var fs = require( 'fs' )
var stream = require( 'readable-stream' )
var direct = require( '@ronomon/direct-io' )
var BlockDevice = require( './blockdevice' )
var async = require( './async' )
var debug = require( 'debug' )( 'blockdevice:read-stream' )

/**
 * BlockReadStream
 * @class
 */
class BlockReadStream extends stream.Readable {

  /**
   * Create a Blockdevice ReadStream
   * @param {Object} options
   * @param {Number} [options.fd]
   * @param {String} [options.path]
   * @param {String} [options.flags]
   * @param {Number} [options.mode=0o666]
   * @param {Boolean} [options.autoClose=true]
   * @param {Number} [options.start=0]
   * @param {Number} [options.end=Infinity]
   * @param {Number} [options.chunkSize=2MiB]
   * @param {Number} [options.blockSize=512]
   * @returns {BlockReadStream}
   */
  constructor( options ) {

    options = Object.assign( {}, BlockReadStream.defaults, options )
    options.objectMode = true
    options.highWaterMark = 1

    super( options )

    // this.fs = options.fs
    this.fd = options.fd
    this.path = options.path
    this.flags = options.flags
    this.mode = options.mode
    this.endPosition = options.end || Infinity
    this.autoClose = options.autoClose
    this.blockSize = options.blockSize
    this.chunkSize = options.chunkSize

    this.position = options.start || 0
    this.bytesRead = 0

    this.opened = false
    this.closed = false
    this.destroyed = false

    this.device = null

    this.on( 'end', () => {
      debug( 'end' )
      if( this.autoClose ) {
        this.close()
      }
    })

    this._onRead = ( error, bytesRead, buffer ) => {

      if( !error && bytesRead !== buffer.length ) {
        error = new Error( `Bytes read mismatch: ${bytesRead} != ${buffer.length}` )
      }

      if( error ) {
        if( this.autoClose ) {
          this.destroy()
        }
        this.emit( 'error', error )
        return
      }

      this.bytesRead += bytesRead
      this.position += buffer.length
      this.push( buffer )

    }

    this.open()

  }

  open() {

    if( this.fd != null ) {
      // TODO: Locks & device info
      this.emit( 'open', this.fd )
      return
    }

    // var path = process.platform === 'darwin' ?
    //   this.path.replace( '/dev/disk', '/dev/rdisk' ) :
    //   this.path

    fs.open( this.path, this.flags, this.mode, ( error, fd ) => {
      if( error ) {
        if( this.autoClose ) {
          this.destroy()
        }
        this.emit( 'error', error )
      } else {
        this.fd = fd
        this.device = null
        async.series([
          ( next ) => BlockDevice.setNoCache( this.fd, next ),
          ( next ) => BlockDevice.lock( this.fd, next ),
          ( next ) => {
            BlockDevice.getDeviceInfo( this.fd, ( error, device ) => {
              if( !error ) {
                this.device = device
                this.endPosition = Math.min( this.endPosition, this.device.size )
              }
              next( error )
            })
          },
        ], ( error ) => {
          if( error ) {
            this.emit( 'error', error )
          } else {
            debug( 'open' )
            this.opened = true
            this.emit( 'open', fd )
          }
        })
      }
    })

  }

  _read() {

    // Wait for file handle to be open
    if( !this.opened ) {
      this.once( 'open', () => this._read() )
      return
    }

    var toRead = this.endPosition - this.position
    if( toRead <= 0 ) {
      this.push( null )
      return
    }

    var length = Math.min( this.chunkSize, Math.max( this.blockSize, toRead ) )
    var buffer = direct.getAlignedBuffer( length, this.device.physicalSectorSize )

    fs.read( this.fd, buffer, 0, length, this.position, this._onRead )

  }

  close( callback ) {

    debug( 'close' )

    if( this.closed || this.fd == null ) {
      if( this.fd == null ) {
        this.once( 'open', () => {
          this.close()
        })
      } else {
        process.nextTick(() => {
          this.emit( 'close' )
          callback()
        })
      }
      return
    }

    this.closed = true
    this.opened = false

    async.series([
      ( next ) => BlockDevice.unlock( this.fd, next ),
      ( next ) => fs.close( this.fd, next ),
    ], ( error ) => {
      this.fd = null
      error ?
        this.emit( 'error', error ) :
        this.emit( 'close' )
    })

  }

  _destroy( error, callback ) {
    debug( '_destroy' )
    this.close(( closeError ) => {
      callback( error || closeError )
    })
  }

}

BlockReadStream.defaults = {
  // fs: fs,
  fd: null,
  path: null,
  flags: fs.constants.O_RDONLY |
    fs.constants.O_DIRECT |
    fs.constants.O_DSYNC |
    fs.constants.O_EXCL,
  mode: 0o666,
  autoClose: true,
  blockSize: BlockDevice.MIN_BLOCK_SIZE,
  chunkSize: BlockDevice.DEFAULT_CHUNK_SIZE,
}

module.exports = BlockReadStream
