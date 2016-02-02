import { _, p, rm, glob, readdir, opts, handleError } from '../lib/fns'
import writeStyle from '../lib/writeStyle'
import superStream from './lib/superStream'
import { isBuilding } from './lib/helpers'
import { scripts, afterBuild } from './scripts'
import { app } from './app'
import { assets } from './assets'

async function init({ once = false } = {}) {
  try {
    writeStyle.init()

    if (!isBuilding()) {
      superStream.init()
    }

    const inFiles = await glob(SCRIPTS_GLOB)
    const _outFiles = await readdir(OPTS.outDir)
    const outFiles = _outFiles
      .map(file => file.path)
      .filter(path => path.slice(-4) !== '.map')

    // cleanup out dir since last run
    const deleted = _.difference(outFiles, inFiles)
    const deletedPaths = deleted.map(f => p(opts('outDir'), f))
    await * deletedPaths.map(f => rm(f))
    log.gulp('deleted', deletedPaths)

    scripts({ inFiles, outFiles })
  }
  catch(e) {
    handleError(e)
  }
}

// listen to gulp events
let listeners = {}
function event(name, cb) {
  listeners[name] = listeners[name] || []
  listeners[name].push(cb)
}
event.run = (name, file, data) => listeners[name] && listeners[name].forEach(cb => cb(file, data))


// exports

export default {
  init,
  scripts,
  afterBuild,
  assets,
  app,
  event
}