import React from 'react'
import classnames from 'classnames'

import eventShorthands from './eventShorthands'
import elementStyles from './styles'

const add = (a, b) => a + b
const contains = (i, ls) => ls.indexOf(i) != -1
const upper = s => s.toUpperCase()
const capital = s => upper(s.substr(0, 1)) + s.slice(1)
const mapObj = (fn, o) => {
  let newO = {}
  let pairs = Object.keys(o).map((k) => fn(k, o[k]))
  pairs.map(pair => newO[pair[0]] = pair[1])
  return newO
}

const divWhitelist = [
  'title',
  'meta',
  'head',
  'circle',
  'col',
  'body'
]

const flatToCamel = {
  novalidate: 'noValidate',
  tabindex: 'tabIndex',
  autoplay: 'autoPlay',
  srcset: 'srcSet',
  frameborder: 'frameBorder',
  allowfullscreen: 'allowFullScreen'
}

export default function createElement(viewName) {
  return function el(identifier, props, ...args) {
    // destructure array identifier
    const [fullname, key, index] = identifier

    if (!fullname)
      return React.createElement('div', null, 'No name given!')

    props = props || {}
    const view = this

    let isHTMLElement = false
    let name = fullname
    let tag, originalTag

    // find element
    if (typeof fullname != 'string') {
      tag = fullname
    }
    else {
      isHTMLElement = (
        fullname[0].toLowerCase() == fullname[0]
        && fullname.indexOf('.') < 0
      )

      // get tag type and name of tag
      if (isHTMLElement) {
        if (fullname.indexOf('-') > 0) {
          [name, tag] = fullname.split('-')
        }
        else {
          tag = fullname
        }

        if (divWhitelist.indexOf(tag) !== -1) {
          originalTag = tag
          tag = 'div'
        }

        // lowercase => camelcase, autoplay => autoPlay, to please React
        Object.keys(flatToCamel).forEach(prop => {
          if (props[prop]) {
            props[flatToCamel[prop]] = props[prop] || true
            delete props[prop]
          }
        })
      }
      else {
        tag = view.Flint.getView(name, viewName)
      }
    }

    if (props && props.className)
      props.className = classnames(props.className)

    // TRANSFORMATIONS:
    elementStyles([key, index], view, name, originalTag || tag, props)

    if (!props.key && !props.nokey) {
      props.key = key + (index || '')
    }

    // map shorthand events to onEvent
    props = mapObj((k, v) => {
      let key = contains(k, eventShorthands) ? ('on' + capital(k)) : k
      return [key, v]
    }, props)

    // onEnter
    if (props.onEnter) {
      let originalKeyDown = props.onKeyDown

      props.onKeyDown = function(e) {
        if (e.keyCode === 13)
          props.onEnter(e.target.value)

        if (originalKeyDown)
          originalKeyDown(e)
      }
    }

    if (props.yield)
      props = Object.assign(props, view.props, { style: props.style });

    // write all tags to div in production
    if (process.env.production)
      tag = 'div'

    return React.createElement(tag, props, ...args)
  }
}