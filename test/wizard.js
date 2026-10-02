import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { PassThrough } from 'node:stream'
import { CancelError } from '../lib/prompts.js'
import { toCommand, wizard } from '../lib/wizard.js'
import * as utils from './support/utils.js'

const DOWN = '\x1b[B'
const ENTER = '\r'

describe('wizard', function () {
  let cwd

  before(function () {
    cwd = utils.tmpDir()
  })

  after(function (done) {
    fs.rm(cwd, { recursive: true, force: true }, done)
  })

  it('should default to a pug web app with .gitignore and install', function () {
    return answer([ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]).then(function (result) {
      assert.deepStrictEqual(result.options, {
        _: ['my-app'],
        '!': [],
        api: false,
        cjs: false,
        compression: false,
        cookies: false,
        force: false,
        git: true,
        helmet: false,
        install: true,
        ts: false,
        view: 'pug'
      })
      assert.ok(result.output.includes('npx express-generator-modern my-app --git'))
    })
  })

  it('should ask for a TypeScript API with middleware', function () {
    const keys = [
      'm', 'y', '-', 'a', 'p', 'x', '\x7f', 'i', ENTER, // directory, with a backspace
      DOWN, ENTER, // JSON API
      DOWN, ENTER, // TypeScript
      ' ', DOWN, DOWN, ' ', ENTER, // helmet and cookie-parser
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
      assert.strictEqual(options.git, false)
      assert.strictEqual(options.install, false)
      assert.ok(!result.output.includes('View engine'), 'should not ask for a view engine')
      assert.ok(result.output.includes('npx express-generator-modern my-api --api --ts --helmet --cookies'))
    })
  })

  it('should ask for a CommonJS web app with a view engine', function () {
    const keys = ['w', 'e', 'b', ENTER, ENTER, DOWN, ENTER, DOWN, DOWN, ENTER, ENTER, ENTER, 'n', ENTER]

    return answer(keys).then(function (result) {
      assert.strictEqual(result.options.view, 'ejs')
      assert.strictEqual(result.options.cjs, true)
      assert.ok(result.output.includes('npx express-generator-modern web --view=ejs --cjs --git'))
    })
  })

  it('should ask again when declining a non-empty directory', function () {
    fs.mkdirSync(path.join(cwd, 'busy'))
    fs.writeFileSync(path.join(cwd, 'busy', 'file.txt'), '')

    const keys = ['b', 'u', 's', 'y', ENTER, 'n', 'n', 'e', 'w', ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys).then(function (result) {
      assert.deepStrictEqual(result.options._, ['new'])
      assert.strictEqual(result.options.force, false)
      assert.ok(result.output.includes('Directory is not empty'))
    })
  })

  it('should force a non-empty directory when confirmed', function () {
    const keys = ['b', 'u', 's', 'y', ENTER, 'y', ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER]

    return answer(keys).then(function (result) {
      assert.deepStrictEqual(result.options._, ['busy'])
      assert.strictEqual(result.options.force, true)
      assert.ok(result.output.includes('npx express-generator-modern busy --git --force'))
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
    return answer([ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, ENTER, 'n']).then(function () {
      throw new Error('expected the wizard to be cancelled')
    }, function (err) {
      assert.ok(err instanceof CancelError)
    })
  })

  function answer (keys) {
    const input = new PassThrough()
    const output = new PassThrough()
    let text = ''

    output.setEncoding('utf8')
    output.on('data', function (str) {
      text += str
    })

    const result = wizard({ input, output, cwd })

    // type one key at a time, as a person would
    let i = 0
    const timer = setInterval(function () {
      if (i < keys.length) input.write(keys[i++])
      else clearInterval(timer)
    }, 5)

    return result.then(function (options) {
      clearInterval(timer)
      return { options, output: utils.stripAnsi(text) }
    }, function (err) {
      clearInterval(timer)
      throw err
    })
  }
})

describe('toCommand', function () {
  function options (extra) {
    return Object.assign({ _: ['app'], view: 'pug' }, extra)
  }

  it('should omit the default view engine', function () {
    assert.strictEqual(toCommand(options()), 'npx express-generator-modern app')
  })

  it('should include a view engine or --no-view', function () {
    assert.strictEqual(toCommand(options({ view: 'twig' })), 'npx express-generator-modern app --view=twig')
    assert.strictEqual(toCommand(options({ view: false })), 'npx express-generator-modern app --no-view')
  })

  it('should prefer --api over the view', function () {
    assert.strictEqual(toCommand(options({ api: true, view: false })), 'npx express-generator-modern app --api')
  })

  it('should quote directories with spaces', function () {
    assert.strictEqual(toCommand(options({ _: ['my app'] })), 'npx express-generator-modern "my app"')
  })
})
