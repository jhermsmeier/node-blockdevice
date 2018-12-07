var os = require( 'os' )
var direct = require( '@ronomon/direct-io' )
var debug = require( 'debug' )( 'blockdevice' )

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
  this.mode = options.mode || 'r'

  this.blockSize = options.blockSize || -1
  this.size = options.size || -1

  // Heads per Track (for CHS addressing)
  this.headsPerTrack = options.headsPerTrack || -1
  // Sectors per Track (for CHS addressing)
  this.sectorsPerTrack = options.sectorsPerTrack || -1

  Object.defineProperty( this, 'fs', {
    enumerable: false
  })

}

/**
 * Partition Constructor
 * @type {Function}
 */
BlockDevice.Partition = require( './partition' )

/**
 * Returns physical device path from id
 * @param  {Number} id
 * @return {String} path
 */
BlockDevice.getPath = function( id ) {
  return os.platform() === 'win32' ?
    '\\\\.\\PhysicalDrive' + id :
    '/dev/disk' + id
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
        self.open( callback )
      })
    }

    // Open a new fd handle
    debug( 'fs:open', this.mode, this.path )
    this.fs.open( this.path, this.mode, function( error, fd ) {

      if( error != null )
        return callback.call( self, error, fd )

      // Set file descriptor
      self.fd = fd

      // If no blockSize has been set, attempt to
      // detect it after opening the device
      if( self.blockSize == null || self.blockSize <= 0 ) {
        self.detectBlockSize( 0, 0, 0, function( error, blockSize ) {
          self.blockSize = blockSize || -1
          callback.call( self, error, self.fd )
        })
      } else {
        callback.call( self, error, fd )
      }

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
        callback.call( self, error )
      })
    } else {
      callback.call( self )
    }

    return this

  },

  /**
   * Primitive logical block size detection
   * @param  {Number} [size=128]
   * @param  {Number} [step=128]
   * @param  {Number} [limit=8192]
   * @param  {Function} callback( err, blockSize )
   * @return {BlockDevice}
   */
  detectBlockSize: function( size, step, limit, callback ) {

    var args = [].slice.call( arguments )
    callback = args.pop()

    if( this.fd == null )
      return callback.call( this, new Error( 'Invalid file descriptor' ) )

    limit = args.pop() || 0x2000
    step  = args.pop() || 0x80
    size  = args.pop() || 0x200

    var self = this

    var readBlock = function() {

      var block = Buffer.allocUnsafe( size )

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
        if( size !== bytesRead ) {
          error = new Error( 'Size and bytes read mismatch: ' + size + ', ' + bytesRead )
          return callback.call( self, error )
        }

        // Check if the limit has been reached,
        // and terminate with error, if so
        if( size > limit ) {
          error = new Error( 'Reached limit of ' + limit + ' bytes' )
          return callback.call( self, error )
        }

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
      return callback.call( this, new Error( 'No block size specified' ) )

    step = step || 1024 * 1024 * 1024

    // Keep an output buffer around,
    // to avoid buffer creation on every read
    var block = Buffer.allocUnsafe( this.blockSize )
    var bytesRead = -1, size = -1, offset = 0
    var self = this

    var readBlock = function() {
      self.fs.read( self.fd, block, 0, self.blockSize, offset, function( error, bytesRead ) {

        if( error != null || bytesRead !== self.blockSize ) {
          // We're only interested in I/O errors,
          // since they signal OOB reading, otherwise break out of loop
          if( error && error.code !== 'EIO') {
            debug( 'detect_size:bytes_read:', bytesRead )
            debug( 'detect_size:buffer:', block )
            debug( 'detect_size:offset:', offset )
            debug( 'detect_size:step_size:', step )
            debug( 'detect_size:size:', size / 1024 / 1024 / 1024, 'GB' )
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

  _read: function( position, length, buffer, callback ) {

    if( this.fd == null )
      return callback.call( this, new Error( 'Invalid file descriptor' ) )

    var self = this

    buffer = buffer || Buffer.allocUnsafe( length )
    buffer.fill( 0 )

    debug( 'read', position, length )

    this.fs.read(
      this.fd, buffer, 0, length, position,
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
  readBlocks: function( fromLBA, toLBA, buffer, callback ) {

    fromLBA = fromLBA || 0
    toLBA = toLBA || ( fromLBA + 1 )

    if( fromLBA > toLBA ) {
      var swap = fromLBA
      fromLBA = toLBA
      toLBA = swap
      swap = void 0
    }

    if( typeof buffer === 'function' ) {
      callback = buffer
      buffer = null
    }

    var self = this
    var from = this.blockSize * fromLBA
    var to = this.blockSize * toLBA

    debug( 'read_blocks', fromLBA, toLBA, buffer && buffer.length )

    this._read( from, to - from, buffer, callback )

    return this

  },

  _write: function( offset, buffer, callback ) {

    if( this.fd == null )
      return callback.call( this, new Error( 'Invalid file descriptor' ) )

    if( buffer.length % this.blockSize !== 0 )
      return callback( new Error( 'Buffer length not multiple of block size' ) )

    var self = this

    debug( 'write', offset, buffer.length )

    this.fs.write(
      this.fd, buffer, 0, buffer.length, offset,
      function( error, bytesWritten ) {
        callback.call( self, error, bytesWritten )
      }
    )

    return this

  },

  writeBlocks: function( fromLBA, buffer, callback ) {

    var self = this
    var offset = this.blockSize * fromLBA

    debug( 'write_blocks', fromLBA, buffer.length / this.blockSize )

    this._write( offset, buffer, callback )

    return this

  },

}

// Exports
module.exports = BlockDevice

/**
 * Default chunk size to read / write per call (1MiB)
 * @type {Number}
 * @constant
 */
BlockDevice.DEFAULT_CHUNK_SIZE = 1 * 1024 * 1024

/**
 * Minimum device block size to read or write (512 B)
 * @type {Number}
 * @constant
 */
BlockDevice.MIN_BLOCK_SIZE = 512

/**
 * Set FSCTL_LOCK_VOLUME / F_LOCK
 * @param {Number} fd
 * @param {Function} callback
 */
BlockDevice.lock = function( fd, callback ) {
  debug( 'lock', fd )
  process.platform === 'win32' ?
    direct.setFSCTL_LOCK_VOLUME( fd, 1, callback ) :
    direct.setFlock( fd, 1, callback )
}

/**
 * Unset FSCTL_LOCK_VOLUME / F_LOCK
 * @param {Number} fd
 * @param {Function} callback
 */
BlockDevice.unlock = function( fd, callback ) {
  debug( 'unlock', fd )
  process.platform === 'win32' ?
    direct.setFSCTL_LOCK_VOLUME( fd, 0, callback ) :
    direct.setFlock( fd, 0, callback )
}

/**
 * Set F_NOCACHE (MacOS only, otherwise noop)
 * @param {Number} fd
 * @param {Function} callback
 */
BlockDevice.setNoCache = function( fd, callback ) {
  debug( 'setNoCache', fd )
  process.platform === 'darwin' ?
    direct.setF_NOCACHE( fd, 1, callback ) :
    process.nextTick( callback )
}

/**
 * Unset F_NOCACHE (MacOS only, otherwise noop)
 * @param {Number} fd
 * @param {Function} callback
 */
BlockDevice.unsetNoCache = function( fd, callback ) {
  debug( 'unsetNoCache', fd )
  process.platform === 'darwin' ?
    direct.setF_NOCACHE( fd, 0, callback ) :
    process.nextTick( callback )
}

/**
 * Get information on file / block device sizes
 * @param {Number} fd
 * @param {Function} callback
 */
BlockDevice.getDeviceInfo = function( fd, callback ) {

  debug( 'getDeviceInfo', fd )

  fs.fstat( fd, ( error, stats ) => {

    if( error ) {
      return void callback( error )
    }

    // NOTE: On MacOS, rdisk stats show as a character device
    var isBlockDevice = process.platform === 'darwin' ?
      stats.isBlockDevice() || stats.isCharacterDevice() :
      stats.isBlockDevice()

    if( isBlockDevice ) {
      direct.getBlockDevice( fd, callback )
    } else if( stats.isFile() ) {
      callback( null, {
        logicalSectorSize: BlockDevice.MIN_BLOCK_SIZE,
        physicalSectorSize: BlockDevice.MIN_BLOCK_SIZE,
        serialNumber: '',
        size: stats.size,
      })
    } else {
      callback( new Error( 'Device must be either a file or block device' ) )
    }

  })

}

BlockDevice.ReadStream = require( './read-stream' )
BlockDevice.WriteStream = require( './write-stream' )

BlockDevice.createReadStream = function( path, options ) {
  options = options || {}
  options.path = options.path || path
  if( options.path == null && options.fd == null ) {
    throw new Error( 'Missing path or file descriptor' )
  }
  return new BlockDevice.ReadStream( options )
}

BlockDevice.createWriteStream = function( path, options ) {
  options = options || {}
  options.path = options.path || path
  if( options.path == null && options.fd == null ) {
    throw new Error( 'Missing path or file descriptor' )
  }
  return new BlockDevice.WriteStream( options )
}

// BlockDevice.SparseReadStream = require( './sparse-read-stream' )
// BlockDevice.SparseWriteStream = require( './sparse-write-stream' )
