/**
 * Partition Constructor
 * @return {Partition}
 */
function Partition( device, options ) {
  
  if( !(this instanceof Partition) )
    return new Partition( device, options )
  
  this.device = device
  
  this.firstLBA = options.firstLBA || 0
  this.lastLBA = options.lastLBA || -1
  
}

/**
 * Partition Prototype
 * @type {Object}
 */
Partition.prototype = {
  
  constructor: Partition,
  
  __OOB: function( lba ) {
    return lba <= this.firstLBA ||
      lba >= this.lastLBA
  },
  
  get blockSize() {
    return this.device.blockSize
  },
  
  get sectors() {
    return this.lastLBA - this.firstLBA
  },
  
  get size() {
    return this.sectors * this.blockSize
  },
  
  readBlock: function( from, to, buffer, callback ) {
    
    callback = callback.bind( this )
    
    if( this.__OOB( from ) || this.__OOB( to ) )
      callback( new Error( 'Block address out of bounds' ) )
    
    this.device.readLBA( from, to, buffer, callback )
    
    return this
    
  },
  
  writeBlock: function( from, data, callback ) {
    
    callback = callback.bind( this )
    
    if( this.__OOB( from ) || this.__OOB( to ) )
      callback( new Error( 'Block address out of bounds' ) )
    
    this.device.writeLBA( from, data, callback )
    
    return this
    
  },
  
}

// Exports
module.exports = Partition
