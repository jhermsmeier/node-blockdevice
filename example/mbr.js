// Example: MBR
// Read the Master Boot Record from a device
// NOTE: You will probably have to run this
// with elevated privileges, since the disk
// booted from is protected by the OS against
// potentially malicious access.
var BlockDevice = require( '..' )

// Create a new device for a given Path
var device = new BlockDevice({
  // in this case the first physical disk
  path: BlockDevice.getPath( 0 ),
  // also, we only want to read
  mode: 'r',
})

// Open a handle to the device
device.open( function( error ) {

  // You should do proper error handling
  // here, but for the sake of simplicity
  // in an example, we'll just throw
  if( error != null )
    throw error

  // If the block size is not specified
  // in the options, it will attempt to detect it
  // upon open() and it will be set at this point.
  // You can also detect it manually, by calling
  // device.detectBlockSize( size, step, limit, callback )

  // The Master Boot Record is contained in
  // the first 512 bytes of a device, and thus
  // we have to figure out how many blocks we have to read
  // to get the Master Boot Record.
  // (NOTE: the minimum bytes you can read from a
  // physical device is its block size)

  // We'll start at the very beginning
  var from = 0
  // And determine how many blocks
  // we have to read, if the block size
  // is less than 512 bytes
  var to = device.blockSize < 512 ?
    512 / device.blockSize : 1

  // Read the determined amount of blocks from the device
  device.readBlocks( from, to, function( error, buffer, bytesRead ) {

    if( error != null )
      throw error

    // Check if the bytes read correspond to
    // how many blocks were specified
    if( bytesRead < ( to - from ) * device.blockSize )
      throw new Error( 'Less bytes than specified were read' )

    // And if everything went well, here we have our
    // Master Boot Record in the first 512 bytes
    var mbr = buffer.slice( 0, 512 )

    var hex = mbr.toString( 'hex' )
      .replace( /([0-9a-f]{64})/ig, '$1\n' )
      .replace( /([0-9a-f]{2})/ig, '$1 ' )

    // Note the magic 0x55 0xAA at the end
    console.log( hex )

  })

})
