var fs = require( 'fs' )

const TEMPFILE = __dirname + '/device.tmp'
const IMAGE_SIZE = 1024 * 1024

module.exports = {
  
  tmpFile: TEMPFILE,
  
  getFileHandle: function( mode ) {
    return fs.openSync( TEMPFILE, mode || 'w+' )
  },
  
  setup: function( done ) {
    fs.open( TEMPFILE, 'w+', function( error, fd ) {
      if( error ) return done( error )
      fs.ftruncate( fd, IMAGE_SIZE, function( error ) {
        if( error ) return done( error )
        fs.close( fd, done )
      })
    })
  },
  
  teardown: function( done ) {
    fs.unlink( TEMPFILE, done )
  },
  
}
