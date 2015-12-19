import webpack from 'webpack'
import { Promise } from 'bluebird'
import { onInternalInstalled } from './lib/messages'
import webpackConfig from './lib/webpackConfig'
import readInstalled from './lib/readInstalled'
import handleWebpackErrors from './lib/handleWebpackErrors'
import depRequireString from './lib/depRequireString'
import hasExports from '../lib/hasExports'
import bridge from '../bridge'
import cache from '../cache'
import opts from '../opts'
import log from '../lib/log'
import handleError from '../lib/handleError'
import { writeFile } from '../lib/fns'

const LOG = 'internals'

export async function bundleInternals() {
  try {
    log(LOG, 'bundleInternals')
    await writeInternalsIn()
    await packInternals()
    onInternalInstalled()
  }
  catch(e) {
    handleError(e)
  }
}

async function writeInternalsIn() {
  const files = cache.getExported()
  const requireString = files.map(f =>
    depRequireString(f.replace(/\.js$/, ''), 'internals', './internal/')).join('')

  log(LOG, 'writeInternalsIn', requireString)
  await writeFile(opts.get('deps').internalsIn, requireString)
}

let runningBundle = null

// TODO: check this in babel to be more accurate
export async function checkInternals(file, source) {
  log(LOG, 'checkInternals', file)

  const isExporting = hasExports(source)
  const alreadyExported = cache.isInternal(file)
  log(LOG, 'checkInternals: found', isExporting, 'already', alreadyExported, 'alreadyRunningBundle', runningBundle)

  cache.setIsInternal(file, isExporting)

  // needs to rewrite internalsIn.js?
  if (!alreadyExported && isExporting || alreadyExported && !isExporting) {
    await writeInternalsIn()
  }

  if (isExporting && !runningBundle) {
    clearTimeout(runningBundle)
    runningBundle = setTimeout(async () => {
      await bundleInternals()
      runningBundle = null
    }, 100)
  }
}

// let internals use externals
export function webpackUserExternals() {
  const imports = cache.getImports()
  const externalsObj = imports.reduce((acc, cur) => {
    acc[cur] = `Flint.packages["${cur}"]`
    return acc
  }, {})

  return externalsObj
}

function packInternals() {
  log(LOG, 'packInternals')

  return new Promise((resolve, reject) => {
    const conf = webpackConfig({
      entry: opts.get('deps').internalsIn,
      externals: webpackUserExternals(),
      output: {
        filename: opts.get('deps').internalsOut
      }
    })

    webpack(conf, (err, stats) => {
      handleWebpackErrors(err, stats, resolve, reject)
    })
  })
}
