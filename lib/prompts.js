// Minimal interactive terminal prompts, built on node:readline with no
// dependencies. Each prompt takes `{ input, output }` streams, so they can be
// driven by a TTY or, in tests, by plain streams.

import readline from 'node:readline'

const CSI = '\x1b['
const WINDOWS = process.platform === 'win32'

const SYMBOLS = {
  active: WINDOWS ? '>' : '❯',
  done: WINDOWS ? '√' : '✔',
  question: '?'
}

export const style = {
  bold: (str) => CSI + '1m' + str + CSI + '22m',
  cyan: (str) => CSI + '36m' + str + CSI + '39m',
  dim: (str) => CSI + '2m' + str + CSI + '22m',
  green: (str) => CSI + '32m' + str + CSI + '39m',
  red: (str) => CSI + '31m' + str + CSI + '39m'
}

/**
 * Error thrown when the user cancels a prompt with Ctrl+C.
 */

export class CancelError extends Error {
  constructor () {
    super('cancelled')
    this.name = 'CancelError'
  }
}

/**
 * Ask a yes or no question; y and n answer at once, enter takes the default.
 */

export function confirm (io, { message, initial = true }) {
  let value = initial

  return prompt(io, {
    render (done) {
      if (done) return answered(message, value ? 'yes' : 'no')
      return question(message) + ' ' + style.dim(initial ? '(Y/n)' : '(y/N)')
    },
    keypress (str, key) {
      if (key.name === 'y') return { value: (value = true) }
      if (key.name === 'n') return { value: (value = false) }
      if (key.name === 'return') return { value }
    }
  })
}

/**
 * Choose any number of choices; space toggles, enter submits.
 */

export function multiselect (io, { message, choices }) {
  const selected = new Set()
  let index = 0

  return prompt(io, {
    render (done) {
      if (done) {
        const labels = choices.filter((c, i) => selected.has(i)).map((c) => c.label)
        return answered(message, labels.length ? labels.join(', ') : 'none')
      }

      return [
        question(message) + ' ' + style.dim('(space to select, enter to confirm)'),
        ...choices.map((choice, i) => option(choice, i === index, selected.has(i) ? '[x] ' : '[ ] '))
      ].join('\n')
    },
    keypress (str, key) {
      index = move(key, index, choices.length)

      if (key.name === 'space') {
        if (selected.has(index)) selected.delete(index)
        else selected.add(index)
      }

      if (key.name === 'return') {
        return { value: choices.filter((c, i) => selected.has(i)).map((c) => c.value) }
      }
    }
  })
}

/**
 * Choose one of the choices with the arrow keys.
 */

export function select (io, { message, choices }) {
  let index = 0

  return prompt(io, {
    render (done) {
      if (done) return answered(message, choices[index].label)

      return [
        question(message) + ' ' + style.dim('(use arrow keys)'),
        ...choices.map((choice, i) => option(choice, i === index, ''))
      ].join('\n')
    },
    keypress (str, key) {
      index = move(key, index, choices.length)
      if (key.name === 'return') return { value: choices[index].value }
    }
  })
}

/**
 * Ask for text; enter with nothing typed takes the initial value.
 */

export function text (io, { message, initial = '', validate = () => null }) {
  let value = ''
  let error = null

  return prompt(io, {
    render (done) {
      if (done) return answered(message, value || initial)

      const input = value || style.dim(initial)
      const cursor = CSI + '7m ' + CSI + '27m'
      const line = question(message) + ' ' + style.dim(SYMBOLS.active) + ' ' + input + cursor

      return error ? line + '\n' + style.red('  ' + error) : line
    },
    keypress (str, key) {
      error = null

      if (key.name === 'return') {
        error = validate(value || initial)
        if (!error) return { value: value || initial }
      } else if (key.name === 'backspace') {
        value = value.slice(0, -1)
      } else if (str && !key.ctrl && !key.meta && str >= ' ') {
        value += str
      }
    }
  })
}

/**
 * Line for an answered prompt.
 */

function answered (message, value) {
  return style.green(SYMBOLS.done) + ' ' + style.bold(message) + ' ' + style.dim('·') + ' ' + style.cyan(value)
}

/**
 * Move a list cursor with the arrow keys, wrapping around.
 */

function move (key, index, length) {
  if (key.name === 'up') return (index - 1 + length) % length
  if (key.name === 'down') return (index + 1) % length
  return index
}

/**
 * Line for an unanswered prompt.
 */

function question (message) {
  return style.cyan(SYMBOLS.question) + ' ' + style.bold(message)
}

/**
 * Line for a choice in a list.
 */

function option (choice, active, prefix) {
  const hint = choice.hint ? ' ' + style.dim(choice.hint) : ''

  return active
    ? style.cyan(SYMBOLS.active + ' ' + prefix + choice.label) + hint
    : '  ' + prefix + choice.label + hint
}

/**
 * Run a prompt: render it, redraw it on every keypress, and resolve once
 * `keypress` returns `{ value }`.
 */

function prompt ({ input, output }, { render, keypress }) {
  return new Promise((resolve, reject) => {
    let lines = 0

    function draw (done) {
      const str = render(done)

      // move back to the start of the previous render and clear it
      if (lines) output.write(CSI + lines + 'A\r' + CSI + '0J')

      output.write(str + '\n')
      lines = str.split('\n').length
    }

    function cleanup () {
      input.off('keypress', onKeypress)
      if (input.isTTY) input.setRawMode(false)
      input.pause()
      output.write(CSI + '?25h')
    }

    function onKeypress (str, key = {}) {
      if (key.ctrl && key.name === 'c') {
        cleanup()
        reject(new CancelError())
        return
      }

      const result = keypress(str, key)

      if (result && 'value' in result) {
        draw(true)
        cleanup()
        resolve(result.value)
      } else {
        draw(false)
      }
    }

    readline.emitKeypressEvents(input)
    if (input.isTTY) input.setRawMode(true)

    // hide the cursor while prompting
    output.write(CSI + '?25l')
    input.on('keypress', onKeypress)
    input.resume()
    draw(false)
  })
}
