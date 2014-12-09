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
  this.mode = options.mode || 'r+'
  
  this.blockSize = options.blockSize || -1
  this.size = options.size || -1
  
  // Heads per Track (for CHS addressing)
  this.headsPerTrack = -1
  // Sectors per Track (for CHS addressing)
  this.sectorsPerTrack = -1
  
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
   * @return {BlockDevice}
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
   * @return {BlockDevice}
   */
  detectSize: function( step, callback ) {
    
    if( this.fd == null )
      return callback.call( this, new Error( 'Invalid file descriptor' ) )
    
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
        // console.log( 'buffer:', block )
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
   * Return a new partition
   * @param  {Object} options
   * @return {BlockDevice.Partition}
   */
  partition: function( options ) {
    return new BlockDevice.Partition( this, options )
  },
  
  /**
   * Converts a CHS address to an LBA
   * @param  {Number} cylinder
   * @param  {Number} head
   * @param  {Number} sector
   * @return {BlockDevice}
   */
  getLBA: function( cylinder, head, sector ) {
    
    if( this.headsPerTrack < 0 || this.sectorsPerTrack < 0 )
      throw new Error( 'Unspecified device geometry' )
    
    return ( cylinder * this.headsPerTrack + head ) *
      this.sectorsPerTrack + ( sector - 1 )
    
  },
  
  read: function( offset, length, buffer, callback ) {
    
    if( this.fd == null )
      return callback.call( this, new Error( 'Invalid file descriptor' ) )
    
    var self = this
    
    buffer = buffer || new Buffer( length )
    
    this.fs.read(
      this.fd, buffer, 0, length, offset,
      function( error, bytesRead ) {
        callback.call( self, error, buffer, bytesRead )
      }
    )
    
    return this
    
  },
  
  /**
   * Reads from one LBA to another
   * @param  {Number} fromLBA
   * @param  {Number} toLBA
   * @param  {Buffer} buffer (optional)
   * @param  {Function} callback( error, buffer, bytesRead )
   * @return {BlockDevice}
   */
  readLBA: function( fromLBA, toLBA, buffer, callback ) {
    
    fromLBA = fromLBA || 0
    toLBA = toLBA || ( fromLBA + 1 )
    
    if( fromLBA > toLBA ) {
      var swap = fromLBA
      fromLBA = toLBA
      toLBA = swap
      swap = void 0
    }
    
    var self = this
    var from = this.blockSize * fromLBA
    var to = this.blockSize * toLBA
    
    this.read( from, to - from, buffer, callback )
    
    return this
    
  },
  
  write: function( offset, buffer, callback ) {
    
    if( this.fd == null )
      return callback.call( this, new Error( 'Invalid file descriptor' ) )
    
    var self = this
    
    this.fs.write(
      this.fd, buffer, 0, buffer.length, offset,
      function( error, bytesWritten ) {
        callback.call( self, error, bytesWritten )
      }
    )
    
    return this
    
  },
  
  writeLBA: function( fromLBA, buffer, callback ) {
    
    var self = this
    var offset = this.blockSize * fromLBA
    
    this.write( offset, buffer, callback )
    
    return this
    
  },
  
}

// Exports
module.exports = BlockDevice
