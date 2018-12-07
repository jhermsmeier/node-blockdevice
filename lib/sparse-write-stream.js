var fs = require( 'fs' )
var stream = require( 'readable-stream' )
var direct = require( '@ronomon/direct-io' )
var BlockDevice = require( './blockdevice' )
var debug = require( 'debug' )( 'blockdevice:sparse-write-stream' )

class SparseBlockWriteStream extends BlockDevice.WriteStream {

  constructor( options ) {
    super( options )
  }

}

module.exports = SparseBlockWriteStream
