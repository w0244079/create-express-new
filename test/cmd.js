import assert from 'node:assert'
import { exec, spawn } from 'node:child_process'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import url from 'node:url'
import request from 'supertest'
import validateNpmName from 'validate-npm-package-name'
import AppRunner from './support/app-runner.js'
import * as utils from './support/utils.js'

const APP_START_STOP_TIMEOUT = 10000
const PKG_PATH = path.resolve(import.meta.dirname, '..', 'package.json')
const BIN_PATH = path.resolve(path.dirname(PKG_PATH), JSON.parse(fs.readFileSync(PKG_PATH, 'utf8')).bin.express)
const NPM_INSTALL_TIMEOUT = 300000 // 5 minutes
const STDERR_MAX_BUFFER = 5 * 1024 * 1024 // 5mb
const TEMP_DIR = utils.tmpDir()
const VERSIONS = JSON.parse(fs.readFileSync(path.resolve(import.meta.dirname, '..', 'templates', 'versions.json'), 'utf8')).versions

describe('express(1)', function () {
  after(function (done) {
    this.timeout(30000)
    fs.rm(TEMP_DIR, { recursive: true, force: true }, done)
  })

  describe('(no args)', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, [], function (err, stdout, warnings) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        ctx.stdout = stdout
        ctx.warnings = warnings
        assert.strictEqual(ctx.files.length, 19)
        done()
      })
    })

    it('should not print warnings', function () {
      assert.strictEqual(ctx.warnings.length, 0)
    })

    it('should provide start instructions', function () {
      assert.ok(/ npm start/.test(ctx.stdout))
      assert.ok(/ npm run dev/.test(ctx.stdout))
      assert.ok(!/DEBUG=/.test(ctx.stdout))
    })

    it('should have basic files', function () {
      assert.notStrictEqual(ctx.files.indexOf('bin/www.js'), -1)
      assert.notStrictEqual(ctx.files.indexOf('app.js'), -1)
      assert.notStrictEqual(ctx.files.indexOf('package.json'), -1)
      assert.notStrictEqual(ctx.files.indexOf('test/app.test.js'), -1)
      assert.notStrictEqual(ctx.files.indexOf('.env.example'), -1)
    })

    it('should have pug templates', function () {
      assert.notStrictEqual(ctx.files.indexOf('views/error.pug'), -1)
      assert.notStrictEqual(ctx.files.indexOf('views/index.pug'), -1)
      assert.notStrictEqual(ctx.files.indexOf('views/layout.pug'), -1)
    })

    it('should have a package.json file', function () {
      const file = path.resolve(ctx.dir, 'package.json')
      const contents = fs.readFileSync(file, 'utf8')
      assert.strictEqual(contents, '{\n' +
        '  "name": "express-1-no-args",\n' +
        '  "version": "0.0.0",\n' +
        '  "private": true,\n' +
        '  "type": "module",\n' +
        '  "scripts": {\n' +
        '    "start": "node --env-file-if-exists=.env ./bin/www.js",\n' +
        '    "test": "node --test",\n' +
        '    "dev": "node --watch --env-file-if-exists=.env ./bin/www.js"\n' +
        '  },\n' +
        '  "engines": {\n' +
        '    "node": ">=22.9"\n' +
        '  },\n' +
        '  "dependencies": {\n' +
        '    "express": "' + VERSIONS.express + '",\n' +
        '    "http-errors": "' + VERSIONS['http-errors'] + '",\n' +
        '    "morgan": "' + VERSIONS.morgan + '",\n' +
        '    "pug": "' + VERSIONS.pug + '"\n' +
        '  }\n' +
        '}\n')
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    it('should pass npm test', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmRun(ctx.dir, 'test', done)
    })

    it('should export an express app from app.js', function () {
      const file = path.resolve(ctx.dir, 'app.js')
      return import(url.pathToFileURL(file).href).then(function (mod) {
        const app = mod.default
        assert.strictEqual(typeof app, 'function')
        assert.strictEqual(typeof app.handle, 'function')
      })
    })

    describe('npm start', function () {
      before('start app', function () {
        this.app = new AppRunner(ctx.dir)
      })

      after('stop app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.stop(done)
      })

      it('should start app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.start(done)
      })

      it('should respond to HTTP request', function (done) {
        request(this.app)
          .get('/')
          .expect(200, /<title>Express<\/title>/, done)
      })

      it('should generate a 404', function (done) {
        request(this.app)
          .get('/does_not_exist')
          .expect(404, /<h1>Not Found<\/h1>/, done)
      })
    })

    describe('when directory contains spaces', function () {
      const ctx0 = setupTestEnvironment('foo bar (BAZ!)')

      it('should create basic app', function (done) {
        run(ctx0.dir, [], function (err, output) {
          if (err) return done(err)
          assert.strictEqual(utils.parseCreatedFiles(output, ctx0.dir).length, 19)
          done()
        })
      })

      it('should have a valid npm package name', function () {
        const file = path.resolve(ctx0.dir, 'package.json')
        const contents = fs.readFileSync(file, 'utf8')
        const name = JSON.parse(contents).name
        assert.ok(validateNpmName(name).validForNewPackages, 'package name "' + name + '" is valid')
        assert.strictEqual(name, 'foo-bar-baz')
      })
    })

    describe('when directory is not a valid name', function () {
      const ctx1 = setupTestEnvironment('_')

      it('should create basic app', function (done) {
        run(ctx1.dir, [], function (err, output) {
          if (err) return done(err)
          assert.strictEqual(utils.parseCreatedFiles(output, ctx1.dir).length, 19)
          done()
        })
      })

      it('should default to name "hello-world"', function () {
        const file = path.resolve(ctx1.dir, 'package.json')
        const contents = fs.readFileSync(file, 'utf8')
        const name = JSON.parse(contents).name
        assert.ok(validateNpmName(name).validForNewPackages)
        assert.strictEqual(name, 'hello-world')
      })
    })
  })

  describe('(unknown args)', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should exit with code 1', function (done) {
      runRaw(ctx.dir, ['--foo'], function (err, code, stdout, stderr) {
        if (err) return done(err)
        assert.strictEqual(code, 1)
        done()
      })
    })

    it('should print usage', function (done) {
      runRaw(ctx.dir, ['--foo'], function (err, code, stdout, stderr) {
        if (err) return done(err)
        assert.ok(/Usage: express /.test(stdout))
        assert.ok(/--help/.test(stdout))
        assert.ok(/--version/.test(stdout))
        assert.ok(/error: unknown option/.test(stderr))
        done()
      })
    })

    it('should print unknown option', function (done) {
      runRaw(ctx.dir, ['--foo'], function (err, code, stdout, stderr) {
        if (err) return done(err)
        assert.ok(/error: unknown option/.test(stderr))
        done()
      })
    })
  })

  describe('<dir>', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app in directory', function (done) {
      runRaw(ctx.dir, ['foo'], function (err, code, stdout, stderr) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        ctx.stderr = stderr
        ctx.stdout = stdout
        assert.strictEqual(ctx.files.length, 20)
        done()
      })
    })

    it('should provide change directory instructions', function () {
      assert.ok(/cd foo/.test(ctx.stdout))
    })

    it('should provide install instructions', function () {
      assert.ok(/npm install/.test(ctx.stdout))
    })

    it('should provide debug instructions', function () {
      assert.ok(/ npm start/.test(ctx.stdout))
    })

    it('should have basic files', function () {
      assert.notStrictEqual(ctx.files.indexOf('foo/bin/www.js'), -1)
      assert.notStrictEqual(ctx.files.indexOf('foo/app.js'), -1)
      assert.notStrictEqual(ctx.files.indexOf('foo/package.json'), -1)
    })

    it('should have pug templates', function () {
      assert.notStrictEqual(ctx.files.indexOf('foo/views/error.pug'), -1)
      assert.notStrictEqual(ctx.files.indexOf('foo/views/index.pug'), -1)
      assert.notStrictEqual(ctx.files.indexOf('foo/views/layout.pug'), -1)
    })
  })

  describe('(non-empty directory)', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    function confirmWith (input, callback) {
      const dir = path.join(ctx.dir, 'app')

      fs.rmSync(dir, { recursive: true, force: true })
      fs.mkdirSync(dir)
      fs.writeFileSync(path.join(dir, 'existing.txt'), '')

      runWithInput(ctx.dir, ['app'], input, function (err, code, stdout, stderr) {
        if (err) return callback(err)
        callback(null, code, fs.existsSync(path.join(dir, 'app.js')), stdout, stderr)
      })
    }

    ;['y\n', 'yes\n', 'OK\n', ' true \n'].forEach(function (input) {
      it('should create app when answering ' + JSON.stringify(input), function (done) {
        confirmWith(input, function (err, code, created, stdout) {
          if (err) return done(err)
          assert.ok(/destination is not empty, continue\?/.test(stdout))
          assert.strictEqual(code, 0)
          assert.ok(created, 'should have created app.js')
          done()
        })
      })
    })

    ;['n\n', '\n', 'not true\n', 'yesterday\n', ''].forEach(function (input) {
      it('should abort when answering ' + JSON.stringify(input), function (done) {
        confirmWith(input, function (err, code, created, stdout, stderr) {
          if (err) return done(err)
          assert.strictEqual(code, 1)
          assert.ok(!created, 'should not have created app.js')
          assert.ok(/aborting/.test(stderr))
          done()
        })
      })
    })
  })

  describe('--api', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--api'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 10)
        done()
      })
    })

    it('should not have views or public files', function () {
      ctx.files.forEach(function (name) {
        assert.ok(!/^(views|public)\//.test(name), 'should not have ' + name)
      })
    })

    it('should only parse JSON request bodies', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.ok(/^app\.use\(express\.json\(\)\);$/m.test(contents))
      assert.ok(!/urlencoded|express\.static|node:path/.test(contents))
    })

    it('should have API dependencies', function () {
      const file = path.resolve(ctx.dir, 'package.json')
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      assert.deepStrictEqual(Object.keys(pkg.dependencies), ['express', 'http-errors', 'morgan'])
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    it('should pass npm test', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmRun(ctx.dir, 'test', done)
    })

    describe('npm start', function () {
      before('start app', function () {
        this.app = new AppRunner(ctx.dir)
      })

      after('stop app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.stop(done)
      })

      it('should start app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.start(done)
      })

      it('should respond with JSON', function (done) {
        request(this.app)
          .get('/')
          .expect('Content-Type', /application\/json/)
          .expect(200, { message: 'Welcome to Express' }, done)
      })

      it('should list users as JSON', function (done) {
        request(this.app)
          .get('/users')
          .expect(200, [], done)
      })

      it('should generate a JSON 404', function (done) {
        request(this.app)
          .get('/does_not_exist')
          .expect('Content-Type', /application\/json/)
          .expect(404)
          .expect(function (res) {
            assert.strictEqual(res.body.error, 'Not Found')
          })
          .end(done)
      })
    })

    describe('with --ts', function () {
      const ctx0 = setupTestEnvironment('api with ts')

      it('should create basic app', function (done) {
        run(ctx0.dir, ['--api', '--ts'], function (err) {
          done(err)
        })
      })

      it('should have installable dependencies', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmInstall(ctx0.dir, done)
      })

      it('should pass type checking', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmRun(ctx0.dir, 'typecheck', done)
      })

      it('should pass npm test', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmRun(ctx0.dir, 'test', done)
      })
    })

    describe('with --view', function () {
      const ctx1 = setupTestEnvironment('api with view')

      it('should exit with code 1', function (done) {
        runRaw(ctx1.dir, ['--api', '--view', 'ejs'], function (err, code, stdout, stderr) {
          if (err) return done(err)
          assert.strictEqual(code, 1)
          assert.ok(/error: option `--api' cannot be used with `--view'/.test(stderr))
          done()
        })
      })
    })
  })

  describe('--cjs', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--cjs'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 19)
        done()
      })
    })

    it('should have basic files', function () {
      assert.notStrictEqual(ctx.files.indexOf('bin/www.js'), -1)
      assert.notStrictEqual(ctx.files.indexOf('app.js'), -1)
      assert.notStrictEqual(ctx.files.indexOf('package.json'), -1)
      assert.notStrictEqual(ctx.files.indexOf('routes/index.js'), -1)
      assert.notStrictEqual(ctx.files.indexOf('routes/users.js'), -1)
      assert.notStrictEqual(ctx.files.indexOf('test/app.test.js'), -1)
    })

    it('should be a CommonJS package', function () {
      const file = path.resolve(ctx.dir, 'package.json')
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      assert.strictEqual(pkg.type, 'commonjs')
    })

    it('should use require instead of import', function () {
      ['app.js', 'bin/www.js', 'routes/index.js', 'routes/users.js', 'test/app.test.js'].forEach(function (name) {
        const contents = fs.readFileSync(path.resolve(ctx.dir, name), 'utf8')
        assert.ok(/require\(/.test(contents), name + ' should use require')
        assert.ok(!/^(import|export) /m.test(contents), name + ' should not use import/export')
        assert.ok(!/import\.meta/.test(contents), name + ' should not use import.meta')
      })
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    it('should pass npm test', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmRun(ctx.dir, 'test', done)
    })

    it('should export an express app from app.js', function () {
      const app = createRequire(import.meta.url)(path.resolve(ctx.dir, 'app.js'))
      assert.strictEqual(typeof app, 'function')
      assert.strictEqual(typeof app.handle, 'function')
    })

    describe('npm start', function () {
      before('start app', function () {
        this.app = new AppRunner(ctx.dir)
      })

      after('stop app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.stop(done)
      })

      it('should start app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.start(done)
      })

      it('should respond to HTTP request', function (done) {
        request(this.app)
          .get('/')
          .expect(200, /<title>Express<\/title>/, done)
      })

      it('should respond with stylesheet', function (done) {
        request(this.app)
          .get('/stylesheets/style.css')
          .expect(200, /sans-serif/, done)
      })

      it('should generate a 404', function (done) {
        request(this.app)
          .get('/does_not_exist')
          .expect(404, /<h1>Not Found<\/h1>/, done)
      })
    })
  })

  describe('--compression', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--compression'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 19)
        done()
      })
    })

    it('should have compression in package dependencies', function () {
      const file = path.resolve(ctx.dir, 'package.json')
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      assert.strictEqual(typeof pkg.dependencies.compression, 'string')
    })

    it('should use compression middleware', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.ok(/^import compression from 'compression';$/m.test(contents))
      assert.ok(/^app\.use\(compression\(\)\);$/m.test(contents))
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    describe('npm start', function () {
      before('start app', function () {
        this.app = new AppRunner(ctx.dir)
      })

      after('stop app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.stop(done)
      })

      it('should start app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.start(done)
      })

      it('should negotiate response compression', function (done) {
        request(this.app)
          .get('/')
          .set('Accept-Encoding', 'gzip')
          .expect('Vary', /Accept-Encoding/)
          .expect(200, /<title>Express<\/title>/, done)
      })
    })
  })

  describe('--cookies', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--cookies'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 19)
        done()
      })
    })

    it('should have cookie-parser in package dependencies', function () {
      const file = path.resolve(ctx.dir, 'package.json')
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      assert.strictEqual(typeof pkg.dependencies['cookie-parser'], 'string')
    })

    it('should use cookie-parser middleware', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.ok(/^import cookieParser from 'cookie-parser';$/m.test(contents))
      assert.ok(/^app\.use\(cookieParser\(\)\);$/m.test(contents))
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    it('should parse cookies', function () {
      // echo the parsed cookies from the users route
      const users = path.resolve(ctx.dir, 'routes/users.js')
      const contents = fs.readFileSync(users, 'utf8')
      fs.writeFileSync(users, contents.replace("res.send('respond with a resource')", 'res.json(req.cookies)'))

      const file = path.resolve(ctx.dir, 'app.js')
      return import(url.pathToFileURL(file).href).then(function (mod) {
        return request(mod.default)
          .get('/users')
          .set('Cookie', 'name=value')
          .expect(200, { name: 'value' })
      })
    })
  })

  describe('--git', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app with git files', function (done) {
      run(ctx.dir, ['--git'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 20, 'should have 20 files')
        done()
      })
    })

    it('should have basic files', function () {
      assert.notStrictEqual(ctx.files.indexOf('bin/www.js'), -1, 'should have bin/www.js file')
      assert.notStrictEqual(ctx.files.indexOf('app.js'), -1, 'should have app.js file')
      assert.notStrictEqual(ctx.files.indexOf('package.json'), -1, 'should have package.json file')
    })

    it('should have .gitignore', function () {
      assert.notStrictEqual(ctx.files.indexOf('.gitignore'), -1, 'should have .gitignore file')
    })

    it('should have pug templates', function () {
      assert.notStrictEqual(ctx.files.indexOf('views/error.pug'), -1)
      assert.notStrictEqual(ctx.files.indexOf('views/index.pug'), -1)
      assert.notStrictEqual(ctx.files.indexOf('views/layout.pug'), -1)
    })
  })

  describe('--helmet', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--helmet'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 19)
        done()
      })
    })

    it('should have helmet in package dependencies', function () {
      const file = path.resolve(ctx.dir, 'package.json')
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      assert.strictEqual(typeof pkg.dependencies.helmet, 'string')
    })

    it('should use helmet middleware', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.ok(/^import helmet from 'helmet';$/m.test(contents))
      assert.ok(/^app\.use\(helmet\(\)\);$/m.test(contents))
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    describe('npm start', function () {
      before('start app', function () {
        this.app = new AppRunner(ctx.dir)
      })

      after('stop app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.stop(done)
      })

      it('should start app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.start(done)
      })

      it('should send security headers', function (done) {
        request(this.app)
          .get('/')
          .expect('X-Content-Type-Options', 'nosniff')
          .expect('Content-Security-Policy', /default-src 'self'/)
          .expect(function (res) {
            assert.strictEqual(res.headers['x-powered-by'], undefined)
          })
          .expect(200, /<title>Express<\/title>/, done)
      })
    })
  })

  describe('-h', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should print usage', function (done) {
      run(ctx.dir, ['-h'], function (err, stdout) {
        if (err) return done(err)
        const files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(files.length, 0)
        assert.ok(/Usage: express /.test(stdout))
        assert.ok(/--help/.test(stdout))
        assert.ok(/--version/.test(stdout))
        done()
      })
    })
  })

  describe('--help', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should print usage', function (done) {
      run(ctx.dir, ['--help'], function (err, stdout) {
        if (err) return done(err)
        const files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(files.length, 0)
        assert.ok(/Usage: express /.test(stdout))
        assert.ok(/--help/.test(stdout))
        assert.ok(/--version/.test(stdout))
        done()
      })
    })
  })

  describe('(removed options)', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    ;['-c', '--css', '-e', '--ejs', '--hbs', '--hogan', '--pug'].forEach(function (option) {
      it('should reject ' + option + ' as an unknown option', function (done) {
        runRaw(ctx.dir, [option], function (err, code, stdout, stderr) {
          if (err) return done(err)
          assert.strictEqual(code, 1)
          assert.ok(new RegExp('error: unknown option `' + option + "'").test(stderr))
          assert.strictEqual(fs.readdirSync(ctx.dir).length, 0, 'should not create files')
          done()
        })
      })
    })
  })

  describe('--no-view', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app without view engine', function (done) {
      run(ctx.dir, ['--no-view'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 16)
        done()
      })
    })

    it('should have basic files', function () {
      assert.notStrictEqual(ctx.files.indexOf('bin/www.js'), -1)
      assert.notStrictEqual(ctx.files.indexOf('app.js'), -1)
      assert.notStrictEqual(ctx.files.indexOf('package.json'), -1)
    })

    it('should not have views directory', function () {
      assert.strictEqual(ctx.files.indexOf('views'), -1)
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    it('should pass npm test', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmRun(ctx.dir, 'test', done)
    })

    describe('npm start', function () {
      before('start app', function () {
        this.app = new AppRunner(ctx.dir)
      })

      after('stop app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.stop(done)
      })

      it('should start app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.start(done)
      })

      it('should respond to HTTP request', function (done) {
        request(this.app)
          .get('/')
          .expect(200, /<title>Express<\/title>/, done)
      })

      it('should generate a 404', function (done) {
        request(this.app)
          .get('/does_not_exist')
          .expect(404, /Cannot GET \/does_not_exist/, done)
      })
    })
  })

  describe('--ts', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--ts'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 20)
        done()
      })
    })

    it('should have TypeScript files', function () {
      ['app.ts', 'bin/www.ts', 'routes/index.ts', 'routes/users.ts', 'test/app.test.ts', 'tsconfig.json'].forEach(function (name) {
        assert.notStrictEqual(ctx.files.indexOf(name), -1, 'should have ' + name)
      })
      ctx.files.forEach(function (name) {
        assert.ok(!/\.js$/.test(name), 'should not have ' + name)
      })
    })

    it('should import local modules with .ts extensions', function () {
      const app = fs.readFileSync(path.resolve(ctx.dir, 'app.ts'), 'utf8')
      const www = fs.readFileSync(path.resolve(ctx.dir, 'bin/www.ts'), 'utf8')
      assert.ok(/from '\.\/routes\/index\.ts';/.test(app))
      assert.ok(/from '\.\.\/app\.ts';/.test(www))
    })

    it('should have a TypeScript package.json', function () {
      const file = path.resolve(ctx.dir, 'package.json')
      const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
      assert.strictEqual(pkg.type, 'module')
      assert.strictEqual(pkg.engines.node, '>=22.18')
      assert.strictEqual(pkg.scripts.start, 'node --env-file-if-exists=.env ./bin/www.ts')
      assert.strictEqual(pkg.scripts.dev, 'node --watch --env-file-if-exists=.env ./bin/www.ts')
      assert.strictEqual(pkg.scripts.typecheck, 'tsc')
      assert.deepStrictEqual(Object.keys(pkg.devDependencies), [
        '@types/express', '@types/http-errors', '@types/morgan', '@types/node', 'typescript'
      ])
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    it('should pass type checking', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmRun(ctx.dir, 'typecheck', done)
    })

    it('should pass npm test', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmRun(ctx.dir, 'test', done)
    })

    describe('npm start', function () {
      before('start app', function () {
        this.app = new AppRunner(ctx.dir)
      })

      after('stop app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.stop(done)
      })

      it('should start app', function (done) {
        this.timeout(APP_START_STOP_TIMEOUT)
        this.app.start(done)
      })

      it('should respond to HTTP request', function (done) {
        request(this.app)
          .get('/')
          .expect(200, /<title>Express<\/title>/, done)
      })

      it('should generate a 404', function (done) {
        request(this.app)
          .get('/does_not_exist')
          .expect(404, /<h1>Not Found<\/h1>/, done)
      })
    })

    describe('with all middleware', function () {
      const ctx0 = setupTestEnvironment('ts all middleware')

      it('should create basic app', function (done) {
        run(ctx0.dir, ['--ts', '--helmet', '--compression', '--cookies', '--view', 'ejs'], function (err, stdout) {
          if (err) return done(err)
          ctx0.files = utils.parseCreatedFiles(stdout, ctx0.dir)
          done()
        })
      })

      it('should add types for the middleware', function () {
        const file = path.resolve(ctx0.dir, 'package.json')
        const pkg = JSON.parse(fs.readFileSync(file, 'utf8'))
        assert.strictEqual(typeof pkg.devDependencies['@types/compression'], 'string')
        assert.strictEqual(typeof pkg.devDependencies['@types/cookie-parser'], 'string')
      })

      it('should have installable dependencies', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmInstall(ctx0.dir, done)
      })

      it('should pass type checking', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmRun(ctx0.dir, 'typecheck', done)
      })
    })

    describe('with --cjs', function () {
      const ctx1 = setupTestEnvironment('ts with cjs')

      it('should exit with code 1', function (done) {
        runRaw(ctx1.dir, ['--ts', '--cjs'], function (err, code, stdout, stderr) {
          if (err) return done(err)
          assert.strictEqual(code, 1)
          assert.ok(/error: option `--ts' cannot be used with `--cjs'/.test(stderr))
          done()
        })
      })
    })
  })

  describe('--version', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should print version', function (done) {
      const pkg = fs.readFileSync(PKG_PATH, 'utf8')
      const ver = JSON.parse(pkg).version
      run(ctx.dir, ['--version'], function (err, stdout) {
        if (err) return done(err)
        assert.strictEqual(stdout.replace(/[\r\n]+/, '\n'), ver + '\n')
        done()
      })
    })
  })

  describe('--view <engine>', function () {
    describe('(no engine)', function () {
      const ctx = setupTestEnvironment(this.fullTitle())

      it('should exit with code 1', function (done) {
        runRaw(ctx.dir, ['--view'], function (err, code, stdout, stderr) {
          if (err) return done(err)
          assert.strictEqual(code, 1)
          done()
        })
      })

      it('should print usage', function (done) {
        runRaw(ctx.dir, ['--view'], function (err, code, stdout) {
          if (err) return done(err)
          assert.ok(/Usage: express /.test(stdout))
          assert.ok(/--help/.test(stdout))
          assert.ok(/--version/.test(stdout))
          done()
        })
      })

      it('should print argument missing', function (done) {
        runRaw(ctx.dir, ['--view'], function (err, code, stdout, stderr) {
          if (err) return done(err)
          assert.ok(/error: option .* argument missing/.test(stderr))
          done()
        })
      })
    })

    describe('jade', function () {
      const ctx = setupTestEnvironment(this.fullTitle())

      it('should create basic app with pug templates', function (done) {
        run(ctx.dir, ['--view', 'jade'], function (err, stdout, warnings) {
          if (err) return done(err)
          ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
          ctx.warnings = warnings
          assert.notStrictEqual(ctx.files.indexOf('views/index.pug'), -1, 'should have views/index.pug file')
          done()
        })
      })

      it('should warn about engine rename', function () {
        assert.ok(ctx.warnings.some(function (warn) {
          return warn === 'jade has been renamed to pug, using `--view=pug\''
        }))
      })
    })

    describe('(unsupported engine)', function () {
      const ctx = setupTestEnvironment(this.fullTitle())

      it('should exit with code 1', function (done) {
        runRaw(ctx.dir, ['--view', 'hjs'], function (err, code, stdout, stderr) {
          if (err) return done(err)
          assert.strictEqual(code, 1)
          assert.ok(/error: unsupported view engine `hjs'/.test(stderr))
          done()
        })
      })
    })

    describe('ejs', function () {
      const ctx = setupTestEnvironment(this.fullTitle())

      it('should create basic app with ejs templates', function (done) {
        run(ctx.dir, ['--view', 'ejs'], function (err, stdout) {
          if (err) return done(err)
          ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
          assert.strictEqual(ctx.files.length, 18, 'should have 18 files')
          done()
        })
      })

      it('should have basic files', function () {
        assert.notStrictEqual(ctx.files.indexOf('bin/www.js'), -1, 'should have bin/www.js file')
        assert.notStrictEqual(ctx.files.indexOf('app.js'), -1, 'should have app.js file')
        assert.notStrictEqual(ctx.files.indexOf('package.json'), -1, 'should have package.json file')
      })

      it('should have ejs templates', function () {
        assert.notStrictEqual(ctx.files.indexOf('views/error.ejs'), -1, 'should have views/error.ejs file')
        assert.notStrictEqual(ctx.files.indexOf('views/index.ejs'), -1, 'should have views/index.ejs file')
      })

      it('should have ejs in package dependencies', function () {
        const file = path.resolve(ctx.dir, 'package.json')
        const contents = fs.readFileSync(file, 'utf8')
        const pkg = JSON.parse(contents)
        assert.strictEqual(typeof pkg.dependencies.ejs, 'string')
      })

      it('should have installable dependencies', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmInstall(ctx.dir, done)
      })

      describe('npm start', function () {
        before('start app', function () {
          this.app = new AppRunner(ctx.dir)
        })

        after('stop app', function (done) {
          this.timeout(APP_START_STOP_TIMEOUT)
          this.app.stop(done)
        })

        it('should start app', function (done) {
          this.timeout(APP_START_STOP_TIMEOUT)
          this.app.start(done)
        })

        it('should respond to HTTP request', function (done) {
          request(this.app)
            .get('/')
            .expect(200, /<title>Express<\/title>/, done)
        })

        it('should generate a 404', function (done) {
          request(this.app)
            .get('/does_not_exist')
            .expect(404, /<h1>Not Found<\/h1>/, done)
        })
      })
    })

    describe('hbs', function () {
      const ctx = setupTestEnvironment(this.fullTitle())

      it('should create basic app with hbs templates', function (done) {
        run(ctx.dir, ['--view', 'hbs'], function (err, stdout) {
          if (err) return done(err)
          ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
          assert.strictEqual(ctx.files.length, 19)
          done()
        })
      })

      it('should have basic files', function () {
        assert.notStrictEqual(ctx.files.indexOf('bin/www.js'), -1)
        assert.notStrictEqual(ctx.files.indexOf('app.js'), -1)
        assert.notStrictEqual(ctx.files.indexOf('package.json'), -1)
      })

      it('should have hbs in package dependencies', function () {
        const file = path.resolve(ctx.dir, 'package.json')
        const contents = fs.readFileSync(file, 'utf8')
        const dependencies = JSON.parse(contents).dependencies
        assert.ok(typeof dependencies.hbs === 'string')
      })

      it('should have hbs templates', function () {
        assert.notStrictEqual(ctx.files.indexOf('views/error.hbs'), -1)
        assert.notStrictEqual(ctx.files.indexOf('views/index.hbs'), -1)
        assert.notStrictEqual(ctx.files.indexOf('views/layout.hbs'), -1)
      })

      it('should have installable dependencies', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmInstall(ctx.dir, done)
      })

      describe('npm start', function () {
        before('start app', function () {
          this.app = new AppRunner(ctx.dir)
        })

        after('stop app', function (done) {
          this.timeout(APP_START_STOP_TIMEOUT)
          this.app.stop(done)
        })

        it('should start app', function (done) {
          this.timeout(APP_START_STOP_TIMEOUT)
          this.app.start(done)
        })

        it('should respond to HTTP request', function (done) {
          request(this.app)
            .get('/')
            .expect(200, /<title>Express<\/title>/, done)
        })

        it('should generate a 404', function (done) {
          request(this.app)
            .get('/does_not_exist')
            .expect(404, /<h1>Not Found<\/h1>/, done)
        })
      })
    })

    describe('pug', function () {
      const ctx = setupTestEnvironment(this.fullTitle())

      it('should create basic app with pug templates', function (done) {
        run(ctx.dir, ['--view', 'pug'], function (err, stdout) {
          if (err) return done(err)
          ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
          assert.strictEqual(ctx.files.length, 19)
          done()
        })
      })

      it('should have basic files', function () {
        assert.notStrictEqual(ctx.files.indexOf('bin/www.js'), -1)
        assert.notStrictEqual(ctx.files.indexOf('app.js'), -1)
        assert.notStrictEqual(ctx.files.indexOf('package.json'), -1)
      })

      it('should have pug in package dependencies', function () {
        const file = path.resolve(ctx.dir, 'package.json')
        const contents = fs.readFileSync(file, 'utf8')
        const dependencies = JSON.parse(contents).dependencies
        assert.ok(typeof dependencies.pug === 'string')
      })

      it('should have pug templates', function () {
        assert.notStrictEqual(ctx.files.indexOf('views/error.pug'), -1)
        assert.notStrictEqual(ctx.files.indexOf('views/index.pug'), -1)
        assert.notStrictEqual(ctx.files.indexOf('views/layout.pug'), -1)
      })

      it('should have installable dependencies', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmInstall(ctx.dir, done)
      })

      describe('npm start', function () {
        before('start app', function () {
          this.app = new AppRunner(ctx.dir)
        })

        after('stop app', function (done) {
          this.timeout(APP_START_STOP_TIMEOUT)
          this.app.stop(done)
        })

        it('should start app', function (done) {
          this.timeout(APP_START_STOP_TIMEOUT)
          this.app.start(done)
        })

        it('should respond to HTTP request', function (done) {
          request(this.app)
            .get('/')
            .expect(200, /<title>Express<\/title>/, done)
        })

        it('should generate a 404', function (done) {
          request(this.app)
            .get('/does_not_exist')
            .expect(404, /<h1>Not Found<\/h1>/, done)
        })
      })
    })

    describe('twig', function () {
      const ctx = setupTestEnvironment(this.fullTitle())

      it('should create basic app with twig templates', function (done) {
        run(ctx.dir, ['--view', 'twig'], function (err, stdout) {
          if (err) return done(err)
          ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
          assert.strictEqual(ctx.files.length, 19)
          done()
        })
      })

      it('should have basic files', function () {
        assert.notStrictEqual(ctx.files.indexOf('bin/www.js'), -1)
        assert.notStrictEqual(ctx.files.indexOf('app.js'), -1)
        assert.notStrictEqual(ctx.files.indexOf('package.json'), -1)
      })

      it('should have twig in package dependencies', function () {
        const file = path.resolve(ctx.dir, 'package.json')
        const contents = fs.readFileSync(file, 'utf8')
        const dependencies = JSON.parse(contents).dependencies
        assert.ok(typeof dependencies.twig === 'string')
      })

      it('should have twig templates', function () {
        assert.notStrictEqual(ctx.files.indexOf('views/error.twig'), -1)
        assert.notStrictEqual(ctx.files.indexOf('views/index.twig'), -1)
        assert.notStrictEqual(ctx.files.indexOf('views/layout.twig'), -1)
      })

      it('should have installable dependencies', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmInstall(ctx.dir, done)
      })

      describe('npm start', function () {
        before('start app', function () {
          this.app = new AppRunner(ctx.dir)
        })

        after('stop app', function (done) {
          this.timeout(APP_START_STOP_TIMEOUT)
          this.app.stop(done)
        })

        it('should start app', function (done) {
          this.timeout(APP_START_STOP_TIMEOUT)
          this.app.start(done)
        })

        it('should respond to HTTP request', function (done) {
          request(this.app)
            .get('/')
            .expect(200, /<title>Express<\/title>/, done)
        })

        it('should generate a 404', function (done) {
          request(this.app)
            .get('/does_not_exist')
            .expect(404, /<h1>Not Found<\/h1>/, done)
        })
      })
    })
  })
})

function npmInstall (dir, callback) {
  const env = utils.childEnvironment()

  exec('npm install --prefer-offline --no-audit --no-fund', { cwd: dir, env, maxBuffer: STDERR_MAX_BUFFER }, function (err, stderr) {
    if (err) {
      err.message += stderr
      callback(err)
      return
    }

    callback()
  })
}

function npmRun (dir, script, callback) {
  const env = utils.childEnvironment()

  exec('npm run ' + script, { cwd: dir, env, maxBuffer: STDERR_MAX_BUFFER }, function (err, stdout, stderr) {
    if (err) {
      err.message += stdout + stderr
      callback(err)
      return
    }

    callback()
  })
}

function run (dir, args, callback) {
  runRaw(dir, args, function (err, code, stdout, stderr) {
    if (err) {
      return callback(err)
    }

    process.stderr.write(utils.stripWarnings(stderr))

    try {
      assert.strictEqual(utils.stripWarnings(stderr), '')
      assert.strictEqual(code, 0)
    } catch (e) {
      return callback(e)
    }

    callback(null, utils.stripColors(stdout), utils.parseWarnings(stderr))
  })
}

function runRaw (dir, args, callback) {
  runWithInput(dir, args, '', callback)
}

function runWithInput (dir, args, input, callback) {
  const argv = [BIN_PATH].concat(args)
  const binp = process.argv[0]
  let stderr = ''
  let stdout = ''

  const child = spawn(binp, argv, {
    cwd: dir
  })

  child.stdin.end(input)

  child.stdout.setEncoding('utf8')
  child.stdout.on('data', function ondata (str) {
    stdout += str
  })
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', function ondata (str) {
    stderr += str
  })

  child.on('close', onclose)
  child.on('error', callback)

  function onclose (code) {
    callback(null, code, stdout, stderr)
  }
}

function setupTestEnvironment (name) {
  const ctx = {}

  before('create environment', function (done) {
    ctx.dir = path.join(TEMP_DIR, name.replace(/[<>]/g, ''))
    fs.mkdir(ctx.dir, { recursive: true }, function (err) {
      done(err)
    })
  })

  after('cleanup environment', function (done) {
    this.timeout(30000)
    fs.rm(ctx.dir, { recursive: true, force: true }, done)
  })

  return ctx
}
