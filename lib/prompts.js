// Minimal interactive terminal prompts, built on node:readline with no
// dependencies. Each prompt takes `{ input, output }` streams, so they can be
// driven by a TTY or, in tests, by plain streams.
//
// Prompts given `back: true` resolve to BACK when the user presses Esc (or
// the left arrow, outside text prompts), after erasing themselves. After an
// answer, `io.printed` holds the text the answer left on screen, so callers
// can erase it again with `erase(io, rows(text, columns))`. Prompts redraw
// when the terminal is resized.

import readline from 'node:readline'

const CSI = '\x1b['
const WINDOWS = process.platform === 'win32'

const SYMBOLS = {
  active: WINDOWS ? '>' : '❯',
  done: WINDOWS ? '√' : '✔',
  question: '?'
}

export const BACK = Symbol('back')

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

export function confirm (io, { message, initial = true, back = false }) {
  let value = initial

  return prompt(io, {
    back,
    arrows: true,
    render (done, width) {
      if (done) return answered(message, value ? 'yes' : 'no')
      return hinted(question(message), initial ? '(Y/n)' : '(y/N)', width)
    },
    keypress (str, key) {
      if (key.name === 'y') return { value: (value = true) }
      if (key.name === 'n') return { value: (value = false) }
      if (key.name === 'return') return { value }
    }
  })
}

/**
 * Erase the given number of terminal rows above the cursor.
 */

export function erase ({ output }, count) {
  if (count) output.write(CSI + count + 'A\r' + CSI + '0J')
}

/**
 * Choose any number of choices; space toggles, enter submits. `initial` is
 * an array of the values selected to begin with.
 */

export function multiselect (io, { message, choices, initial = [], back = false }) {
  const selected = new Set(choices.map((c, i) => initial.includes(c.value) ? i : -1).filter((i) => i !== -1))
  let index = 0

  return prompt(io, {
    back,
    arrows: true,
    render (done, width) {
      if (done) {
        const labels = choices.filter((c, i) => selected.has(i)).map((c) => c.label)
        return answered(message, labels.length ? labels.join(', ') : 'none')
      }

      const help = back ? '(space to select, enter to confirm, esc to go back)' : '(space to select, enter to confirm)'

      const hints = fitsHints(choices, '[ ] ', width)

      return [
        hinted(question(message), help, width),
        ...choices.map((choice, i) => option(choice, i === index, selected.has(i) ? '[x] ' : '[ ] ', hints))
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
 * Count the terminal rows a string occupies, including wrapped lines.
 */

export function rows (str, columns = Infinity) {
  return str.split('\n').reduce((count, line) => {
    return count + Math.max(1, Math.ceil(visible(line).length / columns))
  }, 0)
}

/**
 * Choose one of the choices with the arrow keys, starting on the choice
 * whose value is `initial`.
 */

export function select (io, { message, choices, initial, back = false }) {
  let index = Math.max(0, choices.findIndex((c) => c.value === initial))

  return prompt(io, {
    back,
    arrows: true,
    render (done, width) {
      if (done) return answered(message, choices[index].label)

      const help = back ? '(use arrow keys, esc to go back)' : '(use arrow keys)'

      const hints = fitsHints(choices, '', width)

      return [
        hinted(question(message), help, width),
        ...choices.map((choice, i) => option(choice, i === index, '', hints))
      ].join('\n')
    },
    keypress (str, key) {
      index = move(key, index, choices.length)
      if (key.name === 'return') return { value: choices[index].value }
    }
  })
}

/**
 * Ask for text, starting with `value`; enter with nothing typed takes the
 * `initial` value.
 */

export function text (io, { message, initial = '', value: start = '', validate = () => null, back = false }) {
  let value = start
  let error = null

  return prompt(io, {
    back,
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
 * Line for an unanswered prompt.
 */

function question (message) {
  return style.cyan(SYMBOLS.question) + ' ' + style.bold(message)
}

/**
 * Check if every choice fits the terminal width with its hint, so hints are
 * shown for all choices or none.
 */

function fitsHints (choices, prefix, width) {
  return choices.every((choice) => {
    const line = '  ' + prefix + choice.label + (choice.hint ? ' ' + choice.hint : '')
    return line.length < width
  })
}

/**
 * A line followed by a dim hint, leaving the hint out when the line would
 * not fit the terminal width.
 */

export function hinted (main, hint, width) {
  const line = main + ' ' + style.dim(hint)
  return visible(line).length < width ? line : main
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
 * Line for a choice in a list.
 */

function option (choice, active, prefix, hints) {
  const main = active
    ? style.cyan(SYMBOLS.active + ' ' + prefix + choice.label)
    : '  ' + prefix + choice.label

  return hints && choice.hint ? main + ' ' + style.dim(choice.hint) : main
}

/**
 * Run a prompt: render it, redraw it on every keypress, and resolve once
 * `keypress` returns `{ value }`, or to BACK when going back.
 */

function prompt (io, { render, keypress, back, arrows = false }) {
  const { input, output } = io
  const width = () => output.columns || Infinity

  return new Promise((resolve, reject) => {
    let last = ''
    let lines = 0

    function draw (done) {
      const str = render(done, width())

      // move back to the start of the previous render and clear it
      erase(io, lines)

      output.write(str + '\n')
      last = str
      lines = rows(str, width())
    }

    // terminals reflow wrapped lines on resize, so recount the previous
    // render at the new width before redrawing
    function onResize () {
      lines = rows(last, width())
      draw(false)
    }

    function cleanup () {
      output.off('resize', onResize)
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

      // go back, erasing this prompt
      if (back && (key.name === 'escape' || (arrows && key.name === 'left'))) {
        erase(io, lines)
        cleanup()
        io.printed = ''
        resolve(BACK)
        return
      }

      const result = keypress(str, key)

      if (result && 'value' in result) {
        draw(true)
        cleanup()
        io.printed = last
        resolve(result.value)
      } else {
        draw(false)
      }
    }

    // wait 100ms, not the default 500ms, to tell Esc from an escape sequence
    readline.emitKeypressEvents(input, { escapeCodeTimeout: 100 })
    if (input.isTTY) input.setRawMode(true)

    // hide the cursor while prompting
    output.write(CSI + '?25l')
    input.on('keypress', onKeypress)
    output.on('resize', onResize)
    input.resume()
    draw(false)
  })
}

/**
 * A string without ANSI escape codes, as it appears on screen.
 */

function visible (str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
}
