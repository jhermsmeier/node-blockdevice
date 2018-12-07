var fs = require( 'fs' )
var stream = require( 'readable-stream' )
var direct = require( '@ronomon/direct-io' )
var BlockDevice = require( './blockdevice' )
var debug = require( 'debug' )( 'blockdevice:sparse-read-stream' )

class SparseBlockReadStream extends BlockDevice.ReadStream {

  constructor( options ) {

    super( options )

    this.ranges = options.ranges || []
    this.currentRange = null

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

      var chunk = {
        offset: this.position,
        length: length,
        buffer: buffer,
      }

      this.bytesRead += bytesRead
      this.position += buffer.length
      this.push( chunk )

    }

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

}

module.exports = SparseBlockReadStream
