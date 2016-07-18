'use babel'

/* @flow */

import style from '../lib/index'
import { it } from 'jasmine-fix'
import React from 'react'
import { mount } from 'enzyme'
import BasicComponent from './basicComponent'

@style({
  mergeStyleProp: true,
  theme: true,
  themeKey: 'look'
})
class StyledComponent extends React.Component {
  static themeProps = ['black']
  static style = {
    h1: {
      background: 'red'
    },
    h2: {
      transform: {
        x: 0
      },
      border: [1, 'solid', '#ccc']
    },
    color: color => ({ color }),
    other: { fontSize: 22 },
    theme: {
      black: {
        h1: {
          background: 'black'
        }
      }
    }
  }

  render() {
    return (
      <div $color={this.props.color} $other>
        <h1>Hello</h1>
        <h2>Hello</h2>
      </div>
    )
  }
}

describe('MotionStyle', () => {
  it('applies simple styles', () => {
    const el = mount(<BasicComponent />)

    const h1 = el.find('h1')
    const instance = el.component.getInstance()

    console.log(instance.__staticStyles)

    // has classname
    expect(!!h1.props().className).toBe(true)
    // matches stylesheet
    expect(h1.props().className).toBe(instance.__staticStyles.h1._name)
    // applies style
    expect(instance.__staticStyles.h1._definition.background).toBe('red')
  })

  it('handles complex styles', () => {
    const el = mount(<StyledComponent />)

    const instance = el.component.getInstance()

    // applies style
    expect(instance.__staticStyles.h2._definition.transform).toBe('translateX(0px)')
    expect(instance.__staticStyles.h2._definition.border).toBe('1px solid #ccc')
  })

  it('applies themes', () => {
    const el = mount(<StyledComponent look="black" />)

    const instance = el.component.getInstance()

    // applies style
    // TODO test this better so its checking actual className match
    expect(instance.__staticStyles['black-h1']._definition.background).toBe('black')
  })

  it('applies booleans theme props', () => {
    const el = mount(<StyledComponent black />)

    const instance = el.component.getInstance()

    // applies style
    // TODO test this better so its checking actual className match
    expect(instance.__staticStyles['black-h1']._definition.background).toBe('black')
  })

  it('passes values to styles', () => {
    const el = mount(<StyledComponent color="yellow" />)

    const div = el.find('div')
    expect(!!div.props().className.match(/color_1m1d7xn/)).toBe(true)
  })
})
