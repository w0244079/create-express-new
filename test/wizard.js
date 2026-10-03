import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { CancelError, rows, select } from '../lib/prompts.js'
import { toCommand, wizard } from '../lib/wizard.js'
import * as utils from './support/utils.js'

const DOWN = '\x1b[B'
const ENTER = '\r'
const ESC = '\x1b'
const LEFT = '\x1b[D'

describe('wizard', function () {
  let cwd

  before(function () {
    cwd = utils.tmpDir()
  })

  after(function (done) {
    fs.rm(cwd, { recursive: true, force: true }, done)
  })

  it('should default to a pug web app with .gitignore and install', function () {
    return answer([ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]).then(function (result) {
      assert.deepStrictEqual(result.options, {
        _: ['my-app'],
        '!': [],
        api: false,
        cjs: false,
        compression: false,
        cookies: false,
        cors: false,
        docker: false,
        force: false,
        git: true,
        helmet: false,
        csrf: false,
        install: true,
        keepConfig: false,
        lint: false,
        logger: 'morgan',
        rateLimit: false,
        session: false,
        ts: false,
        uploads: false,
        view: 'pug'
      })
      assert.ok(result.output.includes('npm create express-new@latest my-app'))
    })
  })

  it('should ask for a TypeScript API with middleware', function () {
    const keys = [
      'm', 'y', '-', 'a', 'p', 'x', '\x7f', 'i', ENTER, // directory, with a backspace
      DOWN, ENTER, // JSON API
      DOWN, ENTER, // TypeScript
      ' ', DOWN, DOWN, ' ', DOWN, ' ', ENTER, // helmet, cookie-parser and cors
      ENTER, // morgan
      ' ', DOWN, ' ', ENTER, // Dockerfile and ESLint
      'n', // no .gitignore
      'n', // no install
      'y' // create
    ]

    return answer(keys).then(function (result) {
      const { options } = result
      assert.deepStrictEqual(options._, ['my-api'])
      assert.strictEqual(options.api, true)
      assert.strictEqual(options.view, false)
      assert.strictEqual(options.ts, true)
      assert.strictEqual(options.cjs, false)
      assert.strictEqual(options.helmet, true)
      assert.strictEqual(options.compression, false)
      assert.strictEqual(options.cookies, true)
      assert.strictEqual(options.cors, true)
      assert.strictEqual(options.docker, true)
      assert.strictEqual(options.lint, true)
      assert.strictEqual(options.git, false)
      assert.strictEqual(options.install, false)
      assert.ok(!result.output.includes('View engine'), 'should not ask for a view engine')
      assert.ok(result.output.includes('npm create express-new@latest my-api -- --api --ts --helmet --cookies --cors --docker --lint --no-git'))
    })
  })

  it('should ask for a CommonJS web app with a view engine', function () {
    const keys = ['w', 'e', 'b', ENTER, ENTER, DOWN, ENTER, DOWN, DOWN, ENTER, ENTER, ENTER, ENTER, ENTER, 'n', ENTER]

    return answer(keys).then(function (result) {
      assert.strictEqual(result.options.view, 'ejs')
      assert.strictEqual(result.options.cjs, true)
      assert.ok(result.output.includes('npm create express-new@latest web -- --view=ejs --cjs'))
    })
  })

  it('should ask for sessions, CSRF protection, a rate limit and pino', function () {
    const keys = [
      ENTER, ENTER, ENTER, ENTER, // directory, web app, pug, JavaScript
      DOWN, DOWN, DOWN, DOWN, ' ', DOWN, ' ', ENTER, // express-rate-limit and express-session
      ENTER, // CSRF protection
      DOWN, ENTER, // pino
      ENTER, ENTER, ENTER, ENTER // extras, .gitignore, install, create
    ]

    return answer(keys).then(function (result) {
      const { options } = result
      assert.strictEqual(options.rateLimit, true)
      assert.strictEqual(options.session, true)
      assert.strictEqual(options.csrf, true)
      assert.strictEqual(options.logger, 'pino')
      assert.ok(result.output.includes('npm create express-new@latest my-app -- --rate-limit --session --csrf --logger=pino'))
    })
  })

  it('should not offer sessions for a JSON API', function () {
    const keys = [ENTER, DOWN, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys).then(function (result) {
      assert.ok(result.output.includes('express-rate-limit'))
      assert.ok(!result.output.includes('express-session'))
      assert.ok(!result.output.includes('CSRF'))
    })
  })

  it('should offer multer for a JSON API', function () {
    const keys = [
      ENTER, DOWN, ENTER, ENTER, // directory, JSON API, JavaScript
      DOWN, DOWN, DOWN, DOWN, DOWN, ' ', ENTER, // multer
      ENTER, ENTER, ENTER, ENTER, ENTER // morgan, extras, .gitignore, install, create
    ]

    return answer(keys).then(function (result) {
      assert.strictEqual(result.options.uploads, true)
      assert.ok(result.output.includes('npm create express-new@latest my-app -- --api --uploads'))
    })
  })

  it('should not ask for CSRF protection without a view engine', function () {
    const keys = [
      ENTER, ENTER, // directory, web app
      DOWN, DOWN, DOWN, DOWN, ENTER, // no view engine
      ENTER, // JavaScript
      DOWN, DOWN, DOWN, DOWN, DOWN, ' ', ENTER, // express-session
      ENTER, ENTER, ENTER, ENTER, ENTER // morgan, extras, .gitignore, install, create
    ]

    return answer(keys).then(function (result) {
      assert.strictEqual(result.options.session, true)
      assert.strictEqual(result.options.csrf, false)
      assert.ok(!result.output.includes('CSRF'))
    })
  })

  it('should ask again when declining a non-empty directory', function () {
    fs.mkdirSync(path.join(cwd, 'busy'))
    fs.writeFileSync(path.join(cwd, 'busy', 'file.txt'), '')

    const keys = ['b', 'u', 's', 'y', ENTER, 'n', 'n', 'e', 'w', ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys).then(function (result) {
      assert.deepStrictEqual(result.options._, ['new'])
      assert.strictEqual(result.options.force, false)
      assert.ok(result.output.includes('Directory is not empty'))
    })
  })

  it('should force a non-empty directory when confirmed', function () {
    const keys = ['b', 'u', 's', 'y', ENTER, 'y', ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys).then(function (result) {
      assert.deepStrictEqual(result.options._, ['busy'])
      assert.strictEqual(result.options.force, true)
      assert.ok(result.output.includes('npm create express-new@latest busy -- --force'))
    })
  })

  it('should accept the current directory', function () {
    fs.writeFileSync(path.join(cwd, 'notes.txt'), '')

    const keys = ['.', ENTER, 'y', ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys).then(function (result) {
      assert.deepStrictEqual(result.options._, ['.'])
      assert.strictEqual(result.options.force, true)
      assert.ok(result.output.includes('. for the current directory'))
      assert.ok(result.output.includes('The current directory is not empty'))
      assert.ok(!result.output.includes('Existing files'), 'should not ask about files the app does not create')
      assert.ok(result.output.includes('npm create express-new@latest . -- --force'))
    }).finally(function () {
      fs.rmSync(path.join(cwd, 'notes.txt'))
    })
  })

  it('should list existing files and overwrite them', function () {
    fs.mkdirSync(path.join(cwd, 'old'))
    fs.writeFileSync(path.join(cwd, 'old', 'app.js'), '// mine\n')
    fs.writeFileSync(path.join(cwd, 'old', '.env.example'), 'PORT=1\n')

    const keys = ['o', 'l', 'd', ENTER, 'y', ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys).then(function (result) {
      assert.ok(result.output.includes('These existing files will be overwritten'))
      assert.ok(/\.env\.example\s+app\.js/.test(result.output))
      assert.strictEqual(result.options.keepConfig, false)
    })
  })

  it('should keep existing config files when chosen', function () {
    const keys = ['o', 'l', 'd', ENTER, 'y', ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, DOWN, ENTER, ENTER]

    return answer(keys).then(function (result) {
      assert.ok(result.output.includes('Keep my config files'))
      assert.strictEqual(result.options.keepConfig, true)
      assert.ok(result.output.includes('npm create express-new@latest old -- --force --keep-config'))
    })
  })

  it('should forget keeping config files when going back to an app without them', function () {
    fs.writeFileSync(path.join(cwd, 'old', 'app.js'), '// mine\n')
    fs.writeFileSync(path.join(cwd, 'old', 'Dockerfile'), 'FROM node\n')
    fs.rmSync(path.join(cwd, 'old', '.env.example'))

    const keys = [
      'o', 'l', 'd', ENTER, 'y', // directory
      ENTER, ENTER, ENTER, ENTER, ENTER, // kind, view, language, middleware, logger
      ' ', ENTER, // Dockerfile
      ENTER, ENTER, // .gitignore, install
      DOWN, ENTER, // keep the Dockerfile
      LEFT, LEFT, LEFT, LEFT, ' ', ENTER, // back to extras, no Dockerfile
      ENTER, ENTER, // .gitignore, install
      ENTER, ENTER // overwrite app.js, create
    ]

    return answer(keys).then(function (result) {
      assert.strictEqual(result.options.docker, false)
      assert.strictEqual(result.options.keepConfig, false)
    })
  })

  it('should not create an app where a file is in the way', function () {
    fs.mkdirSync(path.join(cwd, 'blocked'))
    fs.writeFileSync(path.join(cwd, 'blocked', 'routes'), '')

    const keys = ['b', 'l', 'o', 'c', 'k', 'e', 'd', ENTER, 'y', ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys).then(function () {
      throw new Error('expected the wizard to be cancelled')
    }, function (err) {
      assert.ok(err instanceof CancelError)
    })
  })

  it('should go back to change the kind of app, skipping the view engine', function () {
    const keys = [ENTER, ENTER, LEFT, DOWN, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys).then(function (result) {
      assert.strictEqual(result.options.api, true)
      assert.strictEqual(result.options.view, false)
      assert.ok(result.output.includes('npm create express-new@latest my-app -- --api'))
    })
  })

  it('should keep answers when going back', function () {
    const keys = [ENTER, ENTER, ENTER, ENTER, ' ', ENTER, LEFT, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys).then(function (result) {
      assert.strictEqual(result.options.helmet, true)
    })
  })

  it('should go back from the summary to change an answer', function () {
    const keys = [ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, LEFT, 'n', ENTER]

    return answer(keys).then(function (result) {
      assert.strictEqual(result.options.install, false)
    })
  })

  it('should go back with Esc, keeping the typed directory', function () {
    const keys = ['x', ENTER, ESC, 200, 'y', ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys).then(function (result) {
      assert.deepStrictEqual(result.options._, ['xy'])
    })
  })

  it('should not go back from the first question', function () {
    const keys = [ESC, 200, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys).then(function (result) {
      assert.deepStrictEqual(result.options._, ['my-app'])
    })
  })

  it('should leave out hints that do not fit a narrow terminal', function () {
    return Promise.all([
      answer([ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER], { columns: 40 }),
      answer([ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER], { columns: 120 })
    ]).then(function ([narrow, wide]) {
      // the Language hints are too long for 40 columns, the app kind hints fit
      assert.ok(!narrow.output.includes('runs directly on Node.js'))
      assert.ok(narrow.output.includes('server-rendered views'))
      assert.ok(!narrow.output.includes('create an Express 5 app'))
      assert.ok(wide.output.includes('runs directly on Node.js'))
      assert.ok(wide.output.includes('create an Express 5 app'))
    })
  })

  it('should redraw wrapped lines in a narrow terminal', function () {
    const name = 'a'.repeat(20)
    const keys = [...name, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys, { columns: 40 }).then(function (result) {
      assert.deepStrictEqual(result.options._, [name])
      // the prompt wraps onto two rows, so redrawing moves up two rows
      assert.ok(result.raw.includes('\x1b[2A\r'))
    })
  })

  it('should cancel on Ctrl+C', function () {
    return answer([ENTER, '\x03']).then(function () {
      throw new Error('expected the wizard to be cancelled')
    }, function (err) {
      assert.ok(err instanceof CancelError)
    })
  })

  it('should cancel when declining to create the app', function () {
    return answer([ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, 'n']).then(function () {
      throw new Error('expected the wizard to be cancelled')
    }, function (err) {
      assert.ok(err instanceof CancelError)
    })
  })

  // type the keys, pausing for numbers (in ms), into a terminal `columns` wide
  function answer (keys, { columns } = {}) {
    const input = new PassThrough()
    const output = new PassThrough()
    let text = ''

    output.columns = columns

    output.setEncoding('utf8')
    output.on('data', function (str) {
      text += str
    })

    const result = wizard({ input, output, cwd })

    // type one key at a time, as a person would
    let i = 0
    let timer = null

    function next () {
      if (i >= keys.length) return
      const key = keys[i++]

      if (typeof key === 'number') {
        timer = setTimeout(next, key)
      } else {
        input.write(key)
        timer = setTimeout(next, 5)
      }
    }

    next()

    return result.then(function (options) {
      clearTimeout(timer)
      return { options, output: utils.stripAnsi(text), raw: text }
    }, function (err) {
      clearTimeout(timer)
      throw err
    })
  }
})

describe('select', function () {
  it('should redraw for the new width when the terminal is resized', async function () {
    const input = new PassThrough()
    const output = new PassThrough()
    let text = ''

    output.columns = 120
    output.setEncoding('utf8')
    output.on('data', function (str) {
      text += str
    })

    const result = select({ input, output }, {
      message: 'Language',
      back: true,
      choices: [
        { label: 'JavaScript', value: 'esm', hint: 'ES modules' },
        { label: 'TypeScript', value: 'ts', hint: 'runs directly on Node.js 22.18+' },
        { label: 'JavaScript (CommonJS)', value: 'cjs', hint: 'require() and module.exports' }
      ]
    })

    await new Promise(setImmediate)
    text = ''
    output.columns = 30
    output.emit('resize')
    await new Promise(setImmediate)

    // the 4 lines drawn at 120 columns reflow onto 7 rows at 30 columns
    assert.ok(text.startsWith('\x1b[7A\r'), JSON.stringify(text.slice(0, 12)))
    assert.ok(!utils.stripAnsi(text).includes('ES modules'), 'should leave out hints that no longer fit')

    input.write('\r')
    assert.strictEqual(await result, 'esm')
  })
})

describe('rows', function () {
  it('should count lines', function () {
    assert.strictEqual(rows('one\ntwo'), 2)
  })

  it('should count wrapped lines', function () {
    assert.strictEqual(rows('x'.repeat(25), 10), 3)
    assert.strictEqual(rows('x'.repeat(10), 10), 1)
  })

  it('should ignore ANSI escape codes', function () {
    assert.strictEqual(rows('\x1b[36m' + 'x'.repeat(10) + '\x1b[39m', 10), 1)
  })
})

describe('toCommand', function () {
  function options (extra) {
    return Object.assign({ _: ['app'], git: true, view: 'pug' }, extra)
  }

  it('should omit the default view engine', function () {
    assert.strictEqual(toCommand(options()), 'npm create express-new@latest app')
  })

  it('should include a view engine or --no-view', function () {
    assert.strictEqual(toCommand(options({ view: 'twig' })), 'npm create express-new@latest app -- --view=twig')
    assert.strictEqual(toCommand(options({ view: false })), 'npm create express-new@latest app -- --no-view')
  })

  it('should prefer --api over the view', function () {
    assert.strictEqual(toCommand(options({ api: true, view: false })), 'npm create express-new@latest app -- --api')
  })

  it('should include --keep-config', function () {
    assert.strictEqual(toCommand(options({ force: true, keepConfig: true })), 'npm create express-new@latest app -- --force --keep-config')
  })

  it('should include the new middleware and a logger other than morgan', function () {
    assert.strictEqual(
      toCommand(options({ rateLimit: true, session: true, csrf: true, logger: 'pino' })),
      'npm create express-new@latest app -- --rate-limit --session --csrf --logger=pino'
    )
    assert.strictEqual(toCommand(options({ logger: 'morgan' })), 'npm create express-new@latest app')
  })

  it('should include --no-git without a .gitignore', function () {
    assert.strictEqual(toCommand(options({ git: false })), 'npm create express-new@latest app -- --no-git')
  })

  it('should quote directories with spaces', function () {
    assert.strictEqual(toCommand(options({ _: ['my app'] })), 'npm create express-new@latest "my app"')
  })
})
