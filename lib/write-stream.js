var fs = require( 'fs' )
var stream = require( 'readable-stream' )
var direct = require( '@ronomon/direct-io' )
var BlockDevice = require( './blockdevice' )
var async = require( './async' )
var debug = require( 'debug' )( 'blockdevice:write-stream' )

/**
 * BlockWriteStream
 * @class
 */
class BlockWriteStream extends stream.Writable {

  constructor( options ) {

    options = Object.assign( {}, BlockWriteStream.defaults, options )
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
    this.blockSize = options.blockSize || MIN_BLOCK_SIZE
    this.chunkSize = options.chunkSize || CHUNK_SIZE

    this.position = options.start || 0
    this.bytesRead = 0
    this.bytesWritten = 0

    this.opened = false
    this.closed = false
    this.destroyed = false

    this.device = null

    this.on( 'finish', () => {
      debug( 'finish' )
      if( this.autoClose ) {
        this.close()
      }
    })

    this.open()

  }

  open() {

    if( this.fd != null ) {
      this.emit( 'open', this.fd )
      return
    }

    fs.open( this.path, this.flags, this.mode, ( error, fd ) => {
      if( error ) {
        if( this.autoClose ) {
          this.destroy()
        }
        this.emit( 'error', error )
      } else {
        this.fd = fd
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

  _write( chunk, encoding, next ) {

    if( !this.opened ) {
      this.once( 'open', () => this._write( chunk, encoding, next ) )
      return
    }

    var offset = 0
    var length = chunk.length
    var buffer = direct.getAlignedBuffer( length, this.device.physicalSectorSize )

    chunk.copy( buffer )

    fs.write( this.fd, buffer, offset, length, this.position, ( error, bytesWritten ) => {
      if( !error ) {
        this.bytesWritten += bytesWritten
        this.position += bytesWritten
      }
      next( error )
    })

  }

  _final( done ) {
    debug( '_final' )
    done()
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

BlockWriteStream.defaults = {
  // fs: fs,
  fd: null,
  path: null,
  flags: fs.constants.O_WRONLY |
    fs.constants.O_DIRECT |
    fs.constants.O_DSYNC |
    fs.constants.O_EXCL |
    fs.constants.O_CREAT,
  mode: 0o666,
  autoClose: true,
  blockSize: BlockDevice.MIN_BLOCK_SIZE,
  chunkSize: BlockDevice.DEFAULT_CHUNK_SIZE,
}

module.exports = BlockWriteStream
