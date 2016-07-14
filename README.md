# Block Device
[![npm](https://img.shields.io/npm/v/blockdevice.svg?style=flat-square)](https://npmjs.com/package/blockdevice)
[![npm license](https://img.shields.io/npm/l/blockdevice.svg?style=flat-square)](https://npmjs.com/package/blockdevice)
[![npm downloads](https://img.shields.io/npm/dm/blockdevice.svg?style=flat-square)](https://npmjs.com/package/blockdevice)
[![build status](https://img.shields.io/travis/jhermsmeier/node-blockdevice.svg?style=flat-square)](https://travis-ci.org/jhermsmeier/node-blockdevice)

## Install via [npm](https://npmjs.com)

```sh
$ npm install --save blockdevice
```

## Usage Examples

- [example/mbr.js](https://github.com/jhermsmeier/node-blockdevice/blob/master/example/mbr.js): Reading the Master Boot Record of a device

## API

### new BlockDevice( options )
  - options: Object
    - fs: require( 'fs' ), optional; custom 'fs' instance
    - fd: Number, optional; file descriptor
    - path: String, optional *if* `fd` is given
    - mode: String, optional *if* `fd` is given
    - blockSize: Number, optional
    - size: Number, optional
    - headsPerTrack: Number, optional
    - sectorsPerTrack: Number, optional

### BlockDevice.getPath( id )
  - id: Number

### device.open( callback )
  - callback: function( err, fd )

### device.close( callback )
  - callback: function( err )

### device.detectBlockSize( size, step, limit, callback )
  - size: Number, initial block size to be checked
  - step: Number, block size increment
  - limit: Number, maximum block size to be checked
  - callback: function( err, blockSize )

### device.detectSize( step, callback )
  - step: Number, size increment
  - callback: function( err, size )

### device.partition( options )
  - options: Object
    - firstLBA: Number, first logical block of partition
    - lastLBA: Number, last logical block of partition

### device.getLBA( cylinder, head, sector )
  - cylinder: Number
  - head: Number
  - sector: Number

### device._read( offset, length, buffer, callback )
  - offset: Number
  - length: Number
  - buffer: Buffer, optional
  - callback: function( err, buffer, bytesRead )

**INTERNAL**. Used by `.readBlocks()`.

### device.readBlocks( fromLBA, toLBA, buffer, callback )
 - fromLBA: Number
 - fromLBA: Number
 - buffer: Buffer, optional
 - callback: function( err, buffer, bytesRead )

### device._write( offset, buffer, callback )
  - offset: Number
  - buffer: Buffer
  - callback: function( err, bytesWritten )

**INTERNAL**. Used by `.writeBlocks()`.

### device.writeBlocks( fromLBA, buffer, callback )
  - fromLBA: Number
  - buffer: Buffer
  - callback: function( err, bytesWritten )

### new BlockDevice.Partition( device, options )
  - options: Object
    - firstLBA: Number, first logical block of partition
    - lastLBA: Number, last logical block of partition

### get partition.blockSize -> Number
### get partition.sectors -> Number, number of blocks in partition
### get partition.size -> Number, size in bytes

### partition.__OOB( lba )
  - lba: Number, logical block address

**INTERNAL**. Determines if a given LBA is out of bounds of the partition.

### partition.readBlocks( from, to, buffer, callback )
  - from: Number
  - to: Number
  - buffer: Buffer
  - callback: function( err, buffer, bytesRead )

### partition.writeBlocks( from, data, callback )
  - from: Number
  - data: Buffer
  - callback: function( err, bytesWritten )
