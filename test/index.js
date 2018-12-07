var BlockDevice = require( '..' )
var assert = require( 'assert' )
var util = require( './util' )

describe( 'BlockDevice', function() {

  var device = null

  before( util.setup )

  describe( 'new { path }', function() {

    it( 'constructor', function() {
      device = new BlockDevice({
        path: util.tmpFile,
        blockSize: 512
      })
    })

    it( 'device.open()', function( next ) {
      device.open( next )
    })

    it( 'repeat device.open()', function( next ) {
      device.open( next )
    })

    it( 'device.readBlocks()', function( next ) {
      device.readBlocks( 0, 1, next )
    })

    it( 'device.close()', function( next ) {
      device.close( next )
    })

  })

  describe( 'new { fd }', function() {

    var payload = Buffer.alloc( 512 )
    payload.fill( 2 )

    it( 'constructor', function() {
      device = new BlockDevice({
        fd: util.getFileHandle(),
        blockSize: 512
      })
    })

    it( 'device.writeBlocks()', function( next ) {
      device.writeBlocks( 0, payload, function( error, bytesWritten ) {
        if( error ) return next( error );
        assert.strictEqual( bytesWritten, payload.length )
        next()
      })
    })

    it( 'device.readBlocks()', function( next ) {
      device.readBlocks( 0, 1, function( error, buffer ) {
        if( error ) return next( error );
        assert.deepEqual( buffer, payload )
        next()
      })
    })

    it( 'device.close()', function( next ) {
      device.close( next )
    })

  })

  after( util.teardown )

})
