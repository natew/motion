import { compileError, compileSuccess } from './errors';
import removeFlintExt from '../lib/flintExt';
import socket from './socket'

export default function run(browser, opts) {
  socket(browser, opts, {
    'editor:location': msg => {
      browser.editorLocation = msg
    },

    'view:locations': msg => {
      browser.viewLocations = msg
    },

    'script:add': msg => {
      replaceScript(msg)
    },

    'stylesheet:add': msg => {
      addSheet(msg.view)
    },

    'stylesheet:remove': msg => {
      removeSheet(msg.view)
    },

    'compile:error': msg => {
      compileError(msg.error)
    },

    'compile:success': msg => {
      compileSuccess()
    },

    'packages:reload': reloadScript('__flintExternals'),
    'internals:reload': reloadScript('__flintInternals', { reloadAll: true }),

    'file:delete': ({ name }) => {
      let views = Flint.getFile(name)
      views.map(removeSheet)
      removeScript(name)

      Flint.deleteFile(name)
    },


    // coming from editor to browser

    fromEditor: ({ key, val }) => {
      browser.editor = browser.editor || {}
      browser.editor[key] = val
      browser.emitter.emit('editor:state')
    }
  })
}

// tag loader is a throttler
// it accepts requests to load tags
// and once those tags load, it will continue

function TagLoader() {
  let last = {}
  let loading = {}
  let wait = {}

  return function(name, load) {
    let oldTag = last[name]

    if (loading[name]) {
      wait[name] = true
      return
    }

    loading[name] = true

    load(oldTag, onDone)

    function onDone(newTag) {
      last[name] = newTag
      loading[name] = false

      if (wait[name]) {
        wait[name] = false
        load(last[name], onDone)
      }
    }
  }
}

/*

  This should be a closed async loop for hot loading files.

  ws:add => addScript => tagloader => replaceTag =>
    replaceTag => (tagLoader|null)

*/

const scriptSelector = src => `script[src^="${removeTime(removeBase(src))}"]`
const scriptUrl = name => `/_/${name}.js`
const findScript = name => document.querySelector(scriptSelector(scriptUrl(name)))

const sheetSelector = href => `link[href^="${removeTime(removeBase(href))}"]`
const sheetUrl = name => `/__/styles/${name}.css`
const findSheet = name => document.querySelector(sheetSelector(sheetUrl(name)))

const scrLoad = TagLoader()
const cssLoad = TagLoader()

function addScript(src) {
  let path = src.replace('/_/', '')
  let start = Date.now()
  socket.send('script:load', { path })
  scrLoad(src, (lastTag, done) => {
    lastTag = lastTag || document.querySelector(scriptSelector(src))

    if (!lastTag)
      replaceTag(createScript(src), 'src', finish)
    else
      replaceTag(lastTag, 'src', finish)

    function finish() {
      // console.log('script load took', Date.now() - start)
      socket.send('script:done', { path })
      done()
    }
  })
}

function addSheet(name) {
  cssLoad(name, (lastTag, done) => {
    lastTag = lastTag || findSheet(name)

    if (!lastTag)
      replaceTag(createSheet(sheetUrl(name)), 'href', done)
    else
      replaceTag(lastTag, 'href', done)
  })
}

function getParent(tag) {
  if (tag.parentNode) return tag.parentNode
  if (tag.nodeName == 'SCRIPT') return document.body
  else return document.head
}

function replaceTag(tag, attr, after) {
  if (!tag) return

  let parent = getParent(tag)
  let clone = cloneNode(tag, attr)
  let already = false
  let cielTimeout

  const afterFinish = () => {
    if (already) return
    clearTimeout(cielTimeout)
    already = true
    setTimeout(() => {
      removeTag(tag, parent, () => {
        after && after(clone)
      })
    }, 4)
  }

  clone.onerror = afterFinish
  clone.onload = afterFinish
  parent.appendChild(clone)

  // ceil for slow loads
  cielTimeout = setTimeout(() => {
    if (already) return
    removeTag(tag, tag.parentNode, afterFinish, { leftover: 1 })
  }, 200)
}

function removeTag(tag, parent, cb, opts = {}) {
  let { leftover } = opts
  leftover = typeof leftover == 'number' ? leftover : 2 // how many tags to leave

  try {
    parent.removeChild(tag)
    setTimeout(cb, 2)
  }
  catch(e) {
    const isScript = tag.nodeName == 'SCRIPT'
    let tags = document.querySelectorAll(isScript ? scriptSelector(tag.src) : sheetSelector(tag.href))

    // attempt force removal
    for (let i = 0; i < tags.length - leftover; i++) {
      const tag = tags[i]
      try {
        tag.parentNode.removeChild(tag)
      }
      catch(e) {
        try {
          document.body.removeChild(tag)
          document.head.removeChild(tag)
        }
        catch(e) { /* oh well */ }
      }
    }

    // wait a bit longer after recovery
    setTimeout(cb, 30)
  }
}

function reloadScript(id, opts = {}) {
  return () => {
    const el = document.getElementById(id)
    if (!el) return

    const finish = opts.reloadAll ? reloadAllScripts : renderFlint
    const tag = replaceTag(el, 'src', finish)
  }
}

function replaceScript({ name, timestamp, src }, cb) {
  const jsName = removeFlintExt(name)
  addScript(src || `/_${jsName}`)
}

function reloadAllScripts() {
  const scripts = document.querySelectorAll('.__flintScript')

  if (!scripts.length)
    return

  let total = scripts.length

  _Flint.resetViewState()

  ;[].forEach.call(scripts, script => {
    replaceTag(script, 'src')
  })

  // TODO: this should wait for all tags to be done loading
  setTimeout(Flint.render, 10)
}

let renderAttempts = 0

function renderFlint() {
  if (renderAttempts > 10) {
    renderAttempts = 0
    return
  }

  if (typeof Flint != 'undefined') {
    setTimeout(Flint.render)
    renderAttempts = 0
  }
  else {
    renderAttempts++
    setTimeout(renderFlint, 50)
  }
}

function removeBase(str) {
  return str.replace(/^http\:\/\/[^/]+/, '')
}

function removeTime(str) {
  return str.replace(/\?[0-9]+$/, '')
}

function replaceTime(str) {
  return removeTime(str) + `?${Date.now()}`
}

function createScript(src) {
  let tag = document.createElement('script')
  tag.src = src
  return tag
}

function createSheet(href) {
  let tag = document.createElement('link')
  tag.href = href
  tag.rel = "stylesheet"
  return tag
}

function cloneNode(node, attr) {
  let clone

  if (node.tagName != 'SCRIPT') {
    clone = node.cloneNode(false)
  }
  else {
    clone = document.createElement('script')

    const attrs = node.attributes
    for (let i = 0; i < attrs.length; i++)
       if (attrs[i].name != 'src')
         clone.setAttribute(attrs[i].name, attrs[i].value)
  }

  clone.setAttribute(attr, replaceTime(node.getAttribute(attr)))

  return clone
}

function removeSheet(name) {
  let tag = findSheet(name)
  if (tag && tag.parentNode)
    tag.parentNode.removeChild(tag)
}

function removeScript(name) {
  let tag = findScript(name.replace('.js', ''))
  if (tag && tag.parentNode)
    tag.parentNode.removeChild(tag)
}
