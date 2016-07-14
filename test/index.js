var BlockDevice = require( '..' )
var assert = require( 'assert' )
var util = require( './util' )

describe( 'BlockDevice', function() {

  var device = null

  before( util.setup )

  describe( 'new { path }', function() {

    it( 'constructor', function() {
      device = new BlockDevice({
        path: util.tmpFile
      })
    })

    it( 'device.open()', function( next ) {
      device.open( next )
    })

    it( 'device.close()', function( next ) {
      device.close( next )
    })

  })

  describe( 'new { fd }', function() {

    it( 'constructor', function() {
      device = new BlockDevice({
        fd: util.getFileHandle()
      })
    })

    it( 'device.open()', function( next ) {
      device.open( next )
    })

    it( 'device.close()', function( next ) {
      device.close( next )
    })

  })

  after( util.teardown )

})
