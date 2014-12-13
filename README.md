# BlockDevice

[![npm](http://img.shields.io/npm/v/blockdevice.svg?style=flat)](https://npmjs.org/blockdevice)
[![npm downloads](http://img.shields.io/npm/dm/blockdevice.svg?style=flat)](https://npmjs.org/blockdevice)
[![build status](http://img.shields.io/travis/jhermsmeier/node-blockdevice.svg?style=flat)](https://travis-ci.org/jhermsmeier/node-blockdevice)

## Install via [npm](https://npmjs.org)

```sh
$ npm install blockdevice
```

## Usage

```js
var BlockDevice = require( 'blockdevice' )
```

```js
var device = new BlockDevice({
  // A custom 'fs' instance, defaults to require( 'fs' ) (optional)
  fs: null,
  // A file descriptor, if you have (optional)
  fd: null,
  // Path to the device
  path: null,
  // Mode defaults to 'rs+' to bypass local cache (optional)
  mode: 'rs+',
  // Device block size in bytes (optional)
  blockSize: -1,
  // Device size in bytes (optional)
  size: -1,
})
```

## API

- BlockDevice( options )

- BlockDevice.getPath( id )

- device.open( callback( err, fd ) )
- device.close( callback( err ) )
- device.detectBlockSize( size, step, limit, callback( err, blockSize ) )
- device.detectSize( step, callback( err, size ) )
- device.partition( options )
- device.getLBA( cylinder, head, sector )
- device.read( offset, length, buffer, callback( err, buffer, bytesRead ) )
- device.readLBA( fromLBA, toLBA, buffer, callback( err, buffer, bytesRead ) )
- device.write( offset, buffer, callback( err, bytesWritten ) )
- device.writeLBA( fromLBA, buffer, callback( err, bytesWritten ) )

- BlockDevice.Partition( device, options )

- get partition.blockSize
- get partition.sectors
- get partition.size

- partition.__OOB( lba )
- partition.readBlock( from, to, buffer, callback )
- partition.writeBlock( from, data, callback )
