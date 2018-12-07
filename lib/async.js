var async = module.exports

/**
 * @internal Run a series of asynchronous tasks
 * @param {Array<Function>} list
 * @param {Function} callback
 * @returns {undefined}
 */
async.series = function( list, callback ) {

  var tasks = list.slice()

  var run = ( error ) => {
    var task = tasks.shift()
    error || task == null ?
      callback( error ) :
      task( run )
  }

  run()

}
