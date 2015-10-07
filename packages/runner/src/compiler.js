import handleError from './lib/handleError'
import npm from './npm'
import gutil from 'gulp-util'
import through from 'through2'
import fs from 'fs'

let views = []
let VIEW_LOCATIONS = {}
let emit
let OPTS

const isNotIn = (x,y) => x.indexOf(y) == -1
const id = x => x
const props = id('view.props.')
const viewMatcher = /view ([\.A-Za-z_0-9]*)\s*(\([a-zA-Z0-9,\{\}\:\; ]+\))?\s*\{/g
const viewEnd = name => `}) /* end view: ${name} */`
const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1)
const getWrapper = view => 'Flint.' + capitalize(view) + 'Wrapper'
const viewTemplates = {}
const addFlow = src => '/* @flow */ declare var Flint: any; declare var _require:any; ' + src
const jsxEnd = view => `return () => <${getWrapper(view)} view={view}>${viewTemplates[view].join('\n')}</${getWrapper(view)}> })`

// allow style syntax
const replaceStyles = line => line
  .replace(/^\s*\$([a-zA-Z0-9\.\-\_]*)\s*\=/, 'view.styles["__STYLE__$1"] = (_index) => false || ')
  .replace(/\$([a-zA-Z0-9\.\-\_]+)/g, 'view.styles["__STYLE__$1"]')
  .replace('__STYLE__', '$')

const shortFile = file => file.replace(OPTS.dir.replace('.flint', ''), '')
const filePrefix = file => `!function() { return Flint.file('${shortFile(file)}', function(exports) {`
const fileSuffix = ';return exports }) }()'

var Parser = {
  init(opts) {
    OPTS = opts || {}
    console.log('init')
    npm.getPackageDeps(opts.dir).then(opts.after)
  },

  post(file, source, opts) {
    OPTS = opts || {}
    source = filePrefix(file) + source + fileSuffix

    let inView = false
    let removeNextUpdateEnd = 0

    const viewStart = 'Flint.view("'
    const viewEnd = '/* end view:'
    const viewUpdateStart = 'view.update('
    const viewUpdateEnd = ') /*_end_view_update_*/'
    const isViewStyleUpdate = line => line.indexOf('view.update(view.styles["') >= 0
    const isOutOfViewUpdate = line => !inView && line.indexOf(viewUpdateStart) >= 0
    const removeUpdate = line => line.replace(viewUpdateStart, '')

    source = source.split("\n")
      .map(line => {
        // every line:
        let result = line
          .replace('["default"]', '.default')
          .replace("['default']", '.default')
          .replace('"use strict";', "\"use strict\";\n")

        // find if in view
        if (result.indexOf(viewStart) >= 0)
          inView = true
        else if (inView && result.indexOf(viewEnd) >= 0)
          inView = false

        // if not in view, remove view.update
        if (isViewStyleUpdate(result) || isOutOfViewUpdate(result)) {
          result = removeUpdate(result)
          removeNextUpdateEnd++
        }

        // remove update end
        if (removeNextUpdateEnd) {
          if (result.indexOf(viewUpdateEnd) >= 0) {
            result = result.replace(viewUpdateEnd, '')
            removeNextUpdateEnd--
          }
        }
        else {
          // remove update end comment
          result = result.replace('/*_end_view_update_*/', '')
        }

        return result
      })
      .join("\n")

    npm.checkDependencies(source, opts)
    return { file: source }
  },

  pre(file, source) {
    let currentView = { name: null, contents: [] }
    let inJSX = false
    let inView = false
    let viewLines = [];

    VIEW_LOCATIONS[file] = {
      locations: [],
      views: {}
    }

    const transformedSource = source
      .replace(/\^/g, props)
      .replace(/\+\+/g, '+= 1')
      .replace(/\-\-/g, '-= 1')
      .split("\n")
      .map((line, index) => {
        if (line.charAt(0) == "\t")
          console.log('Flint uses spaces over tabs')

        var result = line
        var view = result.match(viewMatcher);
        if (view && view.length) {
          inView = true;
          currentView.name = result.split(" ")[1];

          // set line of view start based on name
          VIEW_LOCATIONS[file].locations.push(index)
          VIEW_LOCATIONS[file].views[index] = currentView.name;
        }

        // enter jsx
        var hasJSX = line.trim().charAt(0) == "<";
        if (inView && !inJSX && hasJSX) {
          inJSX = true;
          viewTemplates[currentView.name] = []
          result = line.trim();
        }

        // if third character is actually code, leave jsx
        const shouldLeaveJSX = (
          line.charAt(0) == '}' ||
          isNotIn(['}', ' ', '<', '', ']', '/'], line.charAt(2))
        )
        const leavingJSX = inJSX && shouldLeaveJSX

        if (leavingJSX) {
          inJSX = false
        }

        // in view (ONLY JSX)
        if (inJSX) {
          result = result
            .replace(/\sclass=([\"\{\'])/g, ' className=$1')
            .replace(/sync[\s]*=[\s]*{([^}]*)}/g, replaceSync)

          viewTemplates[currentView.name].push(result)
        }
        // in view (NOT JSX)
        else {
          result = replaceStyles(result)
        }

        // in view (ALL)
        if (inView) {
          currentView.contents.push(result);
        }

        // end view
        if (inView && line.charAt(0) == "}") {
          const end = viewEnd(currentView.name)

          if (result.trim() == '}')
            result = end
          else
            result += ' ' + end

          inJSX = false;
          inView = false;
          views[currentView.name] = currentView;
          result = jsxEnd(currentView.name)
          currentView = { name: null, contents: [] }
        }

        // dont render jsx
        if (inJSX) return null
        return result;
      })
      // remove invalid lines
      .filter(l => l !== null)
      .join("\n")
      .replace(viewMatcher, viewReplacer)

    // console.log("final source", transformedSource)
    return {
      file: transformedSource,
      views: viewLines
    };
  }
}

function compile(type, opts = {}) {
  if (type == 'init')
    return Parser.init(opts)

  return through.obj(function(file, enc, cb) {
    if (file.isNull()) {
      cb(null, file);
      return;
    }

    if (file.isStream()) {
      cb(new gutil.PluginError('gulp-babel', 'Streaming not supported'));
      return;
    }

    try {
      var res = Parser[type](file.path, file.contents.toString(), opts);
      file.contents = new Buffer(res.file);

      // pass view locations
      if (opts.setViewLocations)
        opts.setViewLocations(VIEW_LOCATIONS)

      this.push(file);
    } catch (err) {
      this.emit('error', new gutil.PluginError('gulp-babel', err, {fileName: file.path, showProperties: false}));
    }

    cb();
  })
}

const replaceSync = (match, inner) =>
  ['value = {', inner, '} onChange = {(e) => {', inner, ' = e.target.value;}}'].join('')

const storeReplacer = (match, name) =>
  ['_stores.', name, ' = function _flintStore() { '].join('')

const makeHash = (str) =>
  str.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0)

const viewReplacer = (match, name, params) => {
  const hash = makeHash(views[name] ? views[name].contents.join("") : ''+Math.random())
  return viewOpen(name, hash, params);
}

const viewOpen = (name, hash, params) =>
  'Flint.view("' + name + '", "' + hash + '", (view, on) => {'

function log(...args) {
  if (OPTS.debug || OPTS.verbose) console.log(...args)
}

export default compile