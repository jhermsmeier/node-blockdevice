var os = require( 'os' )
var assert = require( 'assert' )

/**
 * BlockDevice Constructor
 * @param {Object} options
 */
function BlockDevice( options ) {
  
  if( !(this instanceof BlockDevice) )
    return new BlockDevice( options )
  
  options = options != null ?
    options : {}
  
  this.fs = options.fs || require( 'fs' )
  this.fd = options.fd
  this.path = options.path
  this.mode = options.mode || 'rs+'
  
  this.blockSize = options.blockSize || -1
  this.size = options.size || -1
  
  // Heads per Track (for CHS addressing)
  this.hpt = -1
  // Sectors per Track (for CHS addressing)
  this.spt = -1
  
  // Make 'this.fs' non-enumerable
  Object.defineProperty( this, 'fs', {
    enumerable: false
  })
  
}

/**
 * Returns physical device path from id
 * @param  {Number} id
 * @return {String} path
 */
BlockDevice.getPath = function( id ) {
  return os.platform() === 'win32' ?
    '\\\\.\\PhysicalDrive' + id :
    '/dev/device' + id
}

/**
 * BlockDevice Prototype
 * @type {Object}
 */
BlockDevice.prototype = {
  
  /**
   * BlockDevice constructor
   * @type {Function}
   */
  constructor: BlockDevice,
  
  /**
   * Opens a file descriptor for this device
   * @param {Function} callback
   * @return {BlockDevice}
   */
  open: function( callback ) {
    
    var self = this
    
    // Close a previously opened handle
    if( this.fd != null ) {
      return this.close( function( error ) {
        if( error != null )
          return callback.call( self, error )
        self.open( self.path, self.mode, callback )
      })
    }
    
    // Open a new fd handle
    this.fs.open( this.path, this.mode, function( error, fd ) {
      self.fd = fd
      callback.call( self, error, fd )
    })
    
    return this
    
  },
  
  /**
   * Closes the active file descriptor
   * @param {Function} callback
   * @return {BlockDevice}
   */
  close: function( callback ) {
    
    var self = this
    
    if( this.fd != null ) {
      this.fs.close( this.fd, function( error ) {
        self.fd = null
        callback.call( self )
      })
    }
    
    return this
    
  },
  
  /**
   * Primitive logical block size detection
   * @param  {Number} [size=128]
   * @param  {Number} [step=128]
   * @param  {Number} [limit=8192]
   * @param  {Function} callback
   * @return {Number}
   */
  detectBlockSize: function( size, step, limit, callback ) {
    
    if( this.fd == null )
      return callback.call( this, new Error( 'Invalid file descriptor' ) )
    
    size  = size || 0x200
    step  = step || 0x80
    limit = limit || 0x2000
    
    var self = this
    
    var readBlock = function() {
      
      var block = new Buffer( size )
      
      self.fs.read( self.fd, block, 0, size, 0, function( error, bytesRead ) {
        if( error != null ) {
          // EINVAL tells us that the block size
          // ain't just right (yet); everything
          // else is probably user error
          if( error.code !== 'EINVAL' )
            return callback.call( self, error )
          // Increase the blocksize by `step`
          size += step
          // Attempt next size read
          return readBlock()
        }
        // Check if bytes read correspond
        // to current block size
        if( size !== bytesRead )
          return callback.call( self, new Error( 'Size and bytes read mismatch: ' + size + ', ' + bytesRead ) )
        // Check if the limit has been reached,
        // and terminate with error, if so
        if( size > limit )
          return callback.call( self, new Error( 'Reached limit of ' + limit + ' bytes' ))
        // We've successfully found the
        // smallest readable block size;
        // stop looking...
        self.blockSize = size
        callback.call( self, null, size )
        
      })
      
    }
    
    // Start reading blocks
    readBlock()
    
    return this
    
  },
  
  /**
   * Experimental device size detection
   * NOTE: This is extremely slow and should only be used
   * if the device's size can not be determined by reading
   * structures (like GPT/MBR/VBR/EBR/Partitions) from it
   * @param  {Number} step
   * @param  {Function} callback
   * @return {Number}
   */
  detectSize: function( step, callback ) {
    
    if( this.blockSize <= 0 || this.blockSize == null )
      throw new Error( 'No block size specified' )
    
    step = step || 1024 * 1024 * 1024
    
    // Keep an output buffer around,
    // to avoid buffer creation on every read
    var block = new Buffer( this.blockSize )
    var bytesRead = -1, size = -1, offset = 0
    var self = this
    
    var readBlock = function() {
      self.fs.read( self.fd, block, 0, self.blockSize, offset, function( error, bytesRead ) {
        // console.log( 'bytes read:', bytesRead )
        // console.log( 'offset:', offset )
        // console.log( 'step size:', step )
        // console.log( 'size:', size / 1024 / 1024 / 1024, 'GB' )
        if( error != null ) {
          // We're only interested in I/O errors,
          // since they signal OOB reading, otherwise break out of loop
          if( error.code !== 'EIO') {
            return callback.call( self, error, size )
          }
          // Step back
          offset -= step
          // Decrease step size
          step = Math.max( step / 8, 1 )
        } else {
          // Size is block size added to previous offset
          size = offset + self.blockSize
          // Advance offset on successfull read
          offset += step
        }
        // If our maximum accuracy is reached,
        // break out of the loop
        if( step < self.blockSize ) {
          var blocks = Math.ceil( size / self.blockSize )
          var total = blocks * self.blockSize
          return callback.call( self, null, total )
        }
        // Continue reading blocks
        readBlock()
      })
    }
    
    // Start reading blocks
    readBlock()
    
    return this
    
  },
  
  /**
   * Converts a CHS address to an LBA
   * @param  {Number} cylinder
   * @param  {Number} head
   * @param  {Number} sector
   * @return {Number} lba
   */
  getLBA: function( cylinder, head, sector ) {
    
    if( this.hpt < 0 || this.spt < 0 )
      throw new Error( 'Unspecified device geometry' )
    
    return ( cylinder * this.hpt + head ) *
      this.spt + ( sector - 1 )
    
  },
  
  read: function( offset, length, buffer ) {
    buffer = buffer || new Buffer( length )
    return this.fs.readSync( this.fd, buffer, 0, length, offset )
  },
  
  /**
   * Reads from one LBA to another
   * @param  {Number} fromLBA
   * @param  {Number} toLBA
   * @param  {Buffer} buffer (optional)
   * @return {Buffer}
   */
  readLBA: function( fromLBA, toLBA, buffer ) {
    
    fromLBA = fromLBA || 0
    toLBA = toLBA || ( fromLBA + 1 )
    
    var from = this.blockSize * fromLBA
    var to = this.blockSize * toLBA
    
    return this.read( from, to - from, buffer )
    
  },
  
  write: function( offset, buffer ) {
    return this.fs.writeSync( this.fd, buffer, 0, buffer.length, offset )
  },
  
  writeLBA: function( fromLBA, buffer ) {
    var offset = this.blockSize * fromLBA
    return this.write( offset, buffer )
  }
  
}

// Exports
module.exports = BlockDevice
