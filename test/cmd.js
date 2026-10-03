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
        assert.strictEqual(ctx.files.length, 18)
        done()
      })
    })

    it('should not print warnings', function () {
      assert.strictEqual(ctx.warnings.length, 0)
    })

    it('should log server errors in the error handler', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.ok(/^ {2}if \(status >= 500\) console\.error\(err\);\n/m.test(contents))
      assert.ok(/^ {2}res\.status\(status\);$/m.test(contents))
    })

    it('should only show client error messages outside development', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.ok(/^ {2}res\.locals\.message = err\.expose \|\| development \? err\.message : 'Internal Server Error';$/m.test(contents))
    })

    it('should give the error page a title and status in every environment', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.ok(/^ {2}res\.locals\.title = res\.locals\.message;$/m.test(contents))
      assert.ok(/^ {2}res\.locals\.status = status;$/m.test(contents))
    })

    it('should not start the wizard without a terminal', function () {
      assert.ok(!/Project directory/.test(ctx.stdout))
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
      assert.notStrictEqual(ctx.files.indexOf('.gitignore'), -1)
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

      it('should respond to the health check', function (done) {
        request(this.app)
          .get('/health')
          .expect(200, { status: 'ok' }, done)
      })

      it('should generate a 404', function (done) {
        request(this.app)
          .get('/does_not_exist')
          .expect(404, /<title>Not Found<\/title>[\s\S]*<h1>Not Found<\/h1>\s*<h2>404<\/h2>/, done)
      })
    })

    describe('when directory contains spaces', function () {
      const ctx0 = setupTestEnvironment('foo bar (BAZ!)')

      it('should create basic app', function (done) {
        run(ctx0.dir, [], function (err, output) {
          if (err) return done(err)
          assert.strictEqual(utils.parseCreatedFiles(output, ctx0.dir).length, 18)
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
          assert.strictEqual(utils.parseCreatedFiles(output, ctx1.dir).length, 18)
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
        assert.ok(/Usage: npm create express-new@latest \[dir\] -- \[options\]/.test(stdout))
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
        assert.strictEqual(ctx.files.length, 19)
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

    it('should list the files it would overwrite', function (done) {
      const dir = path.join(ctx.dir, 'listed')

      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'app.js'), '// mine\n')
      fs.writeFileSync(path.join(dir, 'notes.txt'), '')

      runWithInput(ctx.dir, ['listed'], 'n\n', function (err, code, stdout) {
        if (err) return done(err)
        assert.strictEqual(code, 1)
        assert.ok(/these existing files will be overwritten:\s+listed[/\\]app\.js\s+destination is not empty/.test(stdout))
        assert.strictEqual(fs.readFileSync(path.join(dir, 'app.js'), 'utf8'), '// mine\n')
        done()
      })
    })

    it('should not write anything when a file is in the way of a folder', function (done) {
      const dir = path.join(ctx.dir, 'blocked')

      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(path.join(dir, 'routes'), '')

      runRaw(ctx.dir, ['--force', 'blocked'], function (err, code, stdout, stderr) {
        if (err) return done(err)
        assert.strictEqual(code, 1)
        assert.ok(/error: routes is a file, where a folder is needed/.test(stderr))
        assert.deepStrictEqual(fs.readdirSync(dir), ['routes'])
        done()
      })
    })
  })

  describe('(leftover files)', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should warn about files from another view engine and ESLint config', function (done) {
      fs.mkdirSync(path.join(ctx.dir, 'views'))
      fs.writeFileSync(path.join(ctx.dir, 'views', 'index.ejs'), '')
      fs.writeFileSync(path.join(ctx.dir, 'eslint.config.js'), '')
      fs.writeFileSync(path.join(ctx.dir, 'Dockerfile'), '')

      runRaw(ctx.dir, ['--force', '--cjs', '--lint', '.'], function (err, code, stdout, stderr) {
        if (err) return done(err)
        assert.strictEqual(code, 0)
        const [warning] = utils.parseWarnings(stderr)
        assert.ok(/eslint\.config\.js/.test(warning))
        assert.ok(/views[/\\]index\.ejs/.test(warning))
        assert.ok(!/Dockerfile/.test(warning), 'should not warn about files that may be the user\'s own')
        assert.ok(fs.existsSync(path.join(ctx.dir, 'views', 'index.ejs')), 'should not remove leftover files')
        done()
      })
    })
  })

  describe('--keep-config', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should keep config files and overwrite the app', function (done) {
      fs.writeFileSync(path.join(ctx.dir, 'app.js'), '// mine\n')
      fs.writeFileSync(path.join(ctx.dir, 'tsconfig.json'), '{}\n')
      fs.writeFileSync(path.join(ctx.dir, '.gitignore'), 'dist/\nnode_modules/\n')

      runRaw(ctx.dir, ['--ts', '--force', '--keep-config', '.'], function (err, code, stdout, stderr) {
        if (err) return done(err)
        assert.strictEqual(code, 0)
        assert.deepStrictEqual(utils.parseWarnings(stderr), [
          'these existing files are not used by the new app, so they were left as they are:\n' +
          '  app.js\n' +
          'remove them if they are from an earlier app in another language or view engine'
        ])
        assert.ok(/keep.*: tsconfig\.json/.test(stdout))
        assert.ok(/update.*: \.gitignore/.test(stdout))
        assert.strictEqual(fs.readFileSync(path.join(ctx.dir, 'tsconfig.json'), 'utf8'), '{}\n')
        assert.strictEqual(fs.readFileSync(path.join(ctx.dir, 'app.js'), 'utf8'), '// mine\n')
        assert.ok(fs.existsSync(path.join(ctx.dir, 'app.ts')))
        done()
      })
    })

    it('should add the missing lines to an existing .gitignore', function () {
      const gitignore = fs.readFileSync(path.join(ctx.dir, '.gitignore'), 'utf8')
      assert.ok(gitignore.startsWith('dist/\nnode_modules/\n\n# Added by create-express-new\n.env\n'))
      assert.strictEqual(gitignore.split('\n').filter((line) => line === 'node_modules/').length, 1)
    })

    it('should leave identical files alone when run again', function (done) {
      fs.chmodSync(path.join(ctx.dir, 'bin', 'www.ts'), 0o644)

      runRaw(ctx.dir, ['--ts', '--force', '.'], function (err, code, stdout) {
        if (err) return done(err)
        assert.strictEqual(code, 0)

        if (process.platform !== 'win32') {
          assert.strictEqual(fs.statSync(path.join(ctx.dir, 'bin', 'www.ts')).mode & 0o111, 0o111, 'should make bin/www.ts executable again')
        }

        assert.ok(/identical.*: app\.ts/.test(stdout))
        assert.ok(/keep.*: \.gitignore/.test(stdout))
        assert.ok(/overwrite.*: tsconfig\.json/.test(stdout))
        assert.ok(!/create.*: package\.json/.test(stdout))
        done()
      })
    })
  })

  describe('--api', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--api'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 11)
        done()
      })
    })

    it('should not have views or public files', function () {
      ctx.files.forEach(function (name) {
        assert.ok(!/^(views|public)\//.test(name), 'should not have ' + name)
      })
    })

    it('should log server errors in the error handler', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.ok(/^ {2}if \(status >= 500\) console\.error\(err\);\n/m.test(contents))
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

      it('should respond to the health check', function (done) {
        request(this.app)
          .get('/health')
          .expect(200, { status: 'ok' }, done)
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
        assert.strictEqual(ctx.files.length, 18)
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
          .expect(404, /<title>Not Found<\/title>[\s\S]*<h1>Not Found<\/h1>\s*<h2>404<\/h2>/, done)
      })
    })
  })

  describe('--compression', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--compression'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 18)
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
        assert.strictEqual(ctx.files.length, 18)
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

  describe('--lint', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--lint'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 19)
        assert.notStrictEqual(ctx.files.indexOf('eslint.config.js'), -1)
        done()
      })
    })

    it('should have a lint script and ESLint', function () {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(ctx.dir, 'package.json'), 'utf8'))
      assert.strictEqual(pkg.scripts.lint, 'eslint .')
      assert.deepStrictEqual(Object.keys(pkg.devDependencies), ['@eslint/js', 'eslint', 'globals'])
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    it('should pass npm run lint', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmRun(ctx.dir, 'lint', done)
    })

    describe('with --cjs', function () {
      const ctx0 = setupTestEnvironment('lint with cjs')

      it('should create an ES module config', function (done) {
        run(ctx0.dir, ['--lint', '--cjs', '--view', 'ejs'], function (err, stdout) {
          if (err) return done(err)
          assert.notStrictEqual(utils.parseCreatedFiles(stdout, ctx0.dir).indexOf('eslint.config.mjs'), -1)
          done()
        })
      })

      it('should have installable dependencies', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmInstall(ctx0.dir, done)
      })

      it('should pass npm run lint', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmRun(ctx0.dir, 'lint', done)
      })
    })

    describe('with --ts', function () {
      const ctx1 = setupTestEnvironment('lint with ts')

      it('should create basic app', function (done) {
        run(ctx1.dir, ['--lint', '--ts', '--api', '--cors', '--helmet', '--compression', '--cookies'], function (err) {
          done(err)
        })
      })

      it('should use typescript-eslint with TypeScript 6', function () {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(ctx1.dir, 'package.json'), 'utf8'))
        assert.strictEqual(typeof pkg.devDependencies['typescript-eslint'], 'string')
        assert.strictEqual(pkg.devDependencies.typescript, VERSIONS['typescript@6'])
      })

      it('should have installable dependencies', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmInstall(ctx1.dir, done)
      })

      it('should pass npm run lint', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmRun(ctx1.dir, 'lint', done)
      })

      it('should pass npm run typecheck', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmRun(ctx1.dir, 'typecheck', done)
      })

      it('should pass npm test', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmRun(ctx1.dir, 'test', done)
      })
    })
  })

  describe('--no-git', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app without .gitignore', function (done) {
      run(ctx.dir, ['--no-git'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 17, 'should have 17 files')
        assert.strictEqual(ctx.files.indexOf('.gitignore'), -1, 'should not have .gitignore file')
        done()
      })
    })

    it('should still accept --git', function (done) {
      const dir = path.join(ctx.dir, 'with-git')
      fs.mkdirSync(dir)
      run(dir, ['--git'], function (err, stdout) {
        if (err) return done(err)
        assert.notStrictEqual(utils.parseCreatedFiles(stdout, dir).indexOf('.gitignore'), -1)
        done()
      })
    })
  })

  describe('--cors', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--cors'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 18)
        done()
      })
    })

    it('should use cors middleware', function () {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(ctx.dir, 'package.json'), 'utf8'))
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.strictEqual(typeof pkg.dependencies.cors, 'string')
      assert.ok(/^import cors from 'cors';$/m.test(contents))
      assert.ok(/^app\.use\(cors\(\{$/m.test(contents))
      assert.ok(/^ {2}origin: process\.env\.CORS_ORIGIN\?\.split\(','\)/m.test(contents))
    })

    it('should document CORS_ORIGIN in .env.example', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, '.env.example'), 'utf8')
      assert.ok(/^# CORS_ORIGIN=/m.test(contents))
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

      it('should allow cross-origin requests', function (done) {
        request(this.app)
          .get('/')
          .set('Origin', 'https://example.com')
          .expect('Access-Control-Allow-Origin', '*')
          .expect(200, done)
      })
    })
  })

  describe('--rate-limit', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--rate-limit'], function (err, stdout) {
        if (err) return done(err)
        assert.strictEqual(utils.parseCreatedFiles(stdout, ctx.dir).length, 18)
        done()
      })
    })

    it('should use express-rate-limit after static files', function () {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(ctx.dir, 'package.json'), 'utf8'))
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.strictEqual(pkg.dependencies['express-rate-limit'], VERSIONS['express-rate-limit'])
      assert.ok(/^import \{ rateLimit \} from 'express-rate-limit';$/m.test(contents))
      assert.ok(/^ {2}limit: Number\(process\.env\.RATE_LIMIT_MAX\) \|\| 100,$/m.test(contents))
      assert.ok(contents.indexOf('app.use(rateLimit(') > contents.indexOf('app.use(express.static('))
    })

    it('should trust the proxies in TRUST_PROXY', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.ok(/^ {2}app\.set\('trust proxy', /m.test(contents))
    })

    it('should document the settings in .env.example', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, '.env.example'), 'utf8')
      assert.ok(/^# TRUST_PROXY=1$/m.test(contents))
      assert.ok(/^# RATE_LIMIT_MAX=100$/m.test(contents))
      assert.ok(/^# RATE_LIMIT_WINDOW_MS=900000$/m.test(contents))
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    it('should pass its tests', function (done) {
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

      it('should send rate limit headers', function (done) {
        request(this.app)
          .get('/')
          .expect('RateLimit-Policy', /q=100/)
          .expect(200, done)
      })

      it('should not limit static files', function (done) {
        request(this.app)
          .get('/stylesheets/style.css')
          .expect(function (res) {
            assert.strictEqual(res.headers['ratelimit-policy'], undefined)
          })
          .expect(200, done)
      })
    })
  })

  describe('--session', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--session'], function (err, stdout) {
        if (err) return done(err)
        assert.strictEqual(utils.parseCreatedFiles(stdout, ctx.dir).length, 18)
        done()
      })
    })

    it('should use express-session', function () {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(ctx.dir, 'package.json'), 'utf8'))
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.strictEqual(pkg.dependencies['express-session'], VERSIONS['express-session'])
      assert.ok(/^import session from 'express-session';$/m.test(contents))
      assert.ok(/^ {2}cookie: \{ sameSite: 'lax', secure: 'auto' \}$/m.test(contents))
      assert.ok(/^ {2}app\.set\('trust proxy', /m.test(contents))
      assert.ok(!/csrf/i.test(contents))
    })

    it('should document SESSION_SECRET in .env.example', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, '.env.example'), 'utf8')
      assert.ok(/^# SESSION_SECRET=$/m.test(contents))
      assert.ok(/^# TRUST_PROXY=1$/m.test(contents))
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    it('should require SESSION_SECRET in production', function (done) {
      this.timeout(APP_START_STOP_TIMEOUT)

      const env = utils.childEnvironment()
      env.NODE_ENV = 'production'
      delete env.SESSION_SECRET

      exec('node app.js', { cwd: ctx.dir, env }, function (err, stdout, stderr) {
        assert.ok(err, 'should exit with an error')
        assert.ok(/Set SESSION_SECRET to use sessions in production/.test(stderr))
        done()
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

      it('should not start a session until one is used', function (done) {
        request(this.app)
          .get('/')
          .expect(function (res) {
            assert.strictEqual(res.headers['set-cookie'], undefined)
          })
          .expect(200, done)
      })
    })

    describe('with --api', function () {
      const ctx0 = setupTestEnvironment('session with api')

      it('should exit with code 1', function (done) {
        runRaw(ctx0.dir, ['--session', '--api'], function (err, code, stdout, stderr) {
          if (err) return done(err)
          assert.strictEqual(code, 1)
          assert.ok(/error: option `--session' cannot be used with `--api'/.test(stderr))
          done()
        })
      })
    })
  })

  describe('--csrf', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--session', '--csrf'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 20)
        done()
      })
    })

    it('should use csrf-sync from csrf.js after sessions', function () {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(ctx.dir, 'package.json'), 'utf8'))
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      const csrf = fs.readFileSync(path.resolve(ctx.dir, 'csrf.js'), 'utf8')
      assert.strictEqual(pkg.dependencies['csrf-sync'], VERSIONS['csrf-sync'])
      assert.ok(/^import \{ csrfSync \} from 'csrf-sync';$/m.test(csrf))
      assert.ok(!/skipCsrfProtection/.test(csrf))
      assert.ok(/^import csrf from '\.\/csrf\.js';$/m.test(contents))
      assert.ok(contents.indexOf('app.use(csrf.csrfSynchronisedProtection)') > contents.indexOf('app.use(session('))
    })

    it('should put the token in the page layout', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'views', 'layout.pug'), 'utf8')
      assert.ok(/^ {4}title= title\n {4}meta\(name='csrf-token', content=csrfToken\)$/m.test(contents))
    })

    it('should have an example form with the token', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'views', 'new-user.pug'), 'utf8')
      assert.ok(/^ {4}input\(type='hidden', name='_csrf', value=csrfToken\)$/m.test(contents))
      assert.ok(!/@csrf/.test(contents))
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    it('should pass its tests', function (done) {
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

      it('should reject a form post without the token', function (done) {
        request(this.app)
          .post('/users')
          .type('form')
          .send({ name: 'test' })
          .expect(403, /invalid csrf token/, done)
      })

      it('should accept a form post with the token from the form', function (done) {
        const agent = request.agent(this.app)

        agent.get('/users/new').expect(200, function (err, res) {
          if (err) return done(err)

          const token = /<input type="hidden" name="_csrf" value="([^"]+)">/.exec(res.text)[1]

          agent.post('/users/new')
            .type('form')
            .send({ _csrf: token, name: '<Ada>' })
            .expect('Location', '/users/new?added=%3CAda%3E')
            .expect(303, function (postErr) {
              if (postErr) return done(postErr)

              // the name is escaped in the page
              agent.get('/users/new?added=%3CAda%3E').expect(200, /Added &lt;Ada&gt;/, done)
            })
        })
      })
    })

    ;['ejs', 'hbs', 'twig'].forEach(function (engine) {
      describe('with --view=' + engine, function () {
        const ctx0 = setupTestEnvironment('csrf with ' + engine)

        it('should put the token in the page <head>', function (done) {
          run(ctx0.dir, ['--session', '--csrf', '--view=' + engine], function (err) {
            if (err) return done(err)
            const file = path.resolve(ctx0.dir, 'views', engine === 'ejs' ? 'index.ejs' : 'layout.' + engine)
            const contents = fs.readFileSync(file, 'utf8')
            assert.ok(/<title>.*<\/title>\n {4}<meta name="csrf-token" content="[^"]+">\n/.test(contents))
            const form = fs.readFileSync(path.resolve(ctx0.dir, 'views', 'new-user.' + engine), 'utf8')
            assert.ok(/\n +<input type="hidden" name="_csrf" value="[^"]+">\n/.test(form))

            if (engine === 'ejs') {
              // the error page renders before the token is set for a CSRF failure,
              // where an undefined variable would throw
              const error = fs.readFileSync(path.resolve(ctx0.dir, 'views', 'error.ejs'), 'utf8')
              assert.ok(/<meta name="csrf-token" content="<%= locals\.csrfToken %>">/.test(error))
            }
            done()
          })
        })
      })
    })

    describe('without --session', function () {
      const ctx0 = setupTestEnvironment('csrf without session')

      it('should exit with code 1', function (done) {
        runRaw(ctx0.dir, ['--csrf'], function (err, code, stdout, stderr) {
          if (err) return done(err)
          assert.strictEqual(code, 1)
          assert.ok(/error: option `--csrf' requires `--session'/.test(stderr))
          done()
        })
      })
    })

    describe('with --no-view', function () {
      const ctx0 = setupTestEnvironment('csrf with no view')

      it('should exit with code 1', function (done) {
        runRaw(ctx0.dir, ['--session', '--csrf', '--no-view'], function (err, code, stdout, stderr) {
          if (err) return done(err)
          assert.strictEqual(code, 1)
          assert.ok(/error: option `--csrf' needs a view engine/.test(stderr))
          done()
        })
      })
    })
  })

  describe('--uploads', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--uploads', '--docker'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 22)
        done()
      })
    })

    it('should have an upload route and form', function () {
      const pkg = JSON.parse(fs.readFileSync(path.resolve(ctx.dir, 'package.json'), 'utf8'))
      const app = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      const route = fs.readFileSync(path.resolve(ctx.dir, 'routes', 'uploads.js'), 'utf8')
      const view = fs.readFileSync(path.resolve(ctx.dir, 'views', 'uploads.pug'), 'utf8')
      assert.strictEqual(pkg.dependencies.multer, VERSIONS.multer)
      assert.ok(/^app\.use\('\/uploads', uploadsRouter\);$/m.test(app))
      assert.ok(/^import multer from 'multer';$/m.test(route))
      assert.ok(/fileSize: Number\(process\.env\.UPLOAD_MAX_SIZE\)/.test(route))
      assert.ok(!/csrf/.test(route))
      assert.ok(/enctype='multipart\/form-data'/.test(view))
      assert.ok(!/@csrf|_csrf/.test(view))
      assert.strictEqual(ctx.files.indexOf('views/new-user.pug'), -1)
    })

    it('should ignore uploaded files', function () {
      assert.ok(/^uploads\/$/m.test(fs.readFileSync(path.resolve(ctx.dir, '.gitignore'), 'utf8')))
      assert.ok(/^uploads\/$/m.test(fs.readFileSync(path.resolve(ctx.dir, '.dockerignore'), 'utf8')))
      assert.ok(/^# UPLOAD_MAX_SIZE=5242880$/m.test(fs.readFileSync(path.resolve(ctx.dir, '.env.example'), 'utf8')))
    })

    it('should give the node user an uploads folder in the image', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'Dockerfile'), 'utf8')
      assert.ok(/^RUN mkdir -p uploads && chown node:node uploads\nUSER node$/m.test(contents))
    })

    it('should have installable dependencies', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmInstall(ctx.dir, done)
    })

    it('should pass its tests, leaving no uploaded files', function (done) {
      this.timeout(NPM_INSTALL_TIMEOUT)
      npmRun(ctx.dir, 'test', function (err) {
        if (err) return done(err)
        assert.deepStrictEqual(fs.readdirSync(path.resolve(ctx.dir, 'uploads')), [])
        done()
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

      it('should show the upload form', function (done) {
        request(this.app)
          .get('/uploads')
          .expect(200, /<form method="post" action="\/uploads" enctype="multipart\/form-data">/, done)
      })

      it('should save an upload and redirect to the form', function (done) {
        request(this.app)
          .post('/uploads')
          .attach('file', Buffer.from('hello'), { filename: 'hello.txt', contentType: 'text/plain' })
          .expect('Location', '/uploads?uploaded=hello.txt')
          .expect(303, function (err) {
            if (err) return done(err)
            const files = fs.readdirSync(path.resolve(ctx.dir, 'uploads'))
            assert.strictEqual(files.length, 1)
            assert.strictEqual(fs.readFileSync(path.resolve(ctx.dir, 'uploads', files[0]), 'utf8'), 'hello')
            done()
          })
      })

      it('should not serve uploaded files', function (done) {
        const file = fs.readdirSync(path.resolve(ctx.dir, 'uploads'))[0]

        request(this.app)
          .get('/uploads/' + file)
          .expect(404, done)
      })

      it('should reject unsupported file types', function (done) {
        request(this.app)
          .post('/uploads')
          .attach('file', Buffer.from('<script>'), { filename: 'page.html', contentType: 'text/html' })
          .expect(415, done)
      })

      it('should ask for a file', function (done) {
        request(this.app)
          .post('/uploads')
          .field('note', 'no file')
          .expect(400, /Choose a file to upload/, done)
      })
    })

    describe('with --api', function () {
      const ctx0 = setupTestEnvironment('uploads with api')

      it('should create basic app', function (done) {
        run(ctx0.dir, ['--api', '--uploads'], function (err, stdout) {
          if (err) return done(err)
          assert.strictEqual(utils.parseCreatedFiles(stdout, ctx0.dir).length, 12)
          done()
        })
      })

      it('should have installable dependencies', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmInstall(ctx0.dir, done)
      })

      describe('npm start', function () {
        before('start app', function () {
          this.app = new AppRunner(ctx0.dir)
        })

        after('stop app', function (done) {
          this.timeout(APP_START_STOP_TIMEOUT)
          this.app.stop(done)
        })

        it('should start app', function (done) {
          this.timeout(APP_START_STOP_TIMEOUT)
          this.app.start(done)
        })

        it('should respond with the saved file as JSON', function (done) {
          request(this.app)
            .post('/uploads')
            .attach('file', Buffer.from('hello'), { filename: 'hello.txt', contentType: 'text/plain' })
            .expect(201, function (err, res) {
              if (err) return done(err)
              assert.strictEqual(res.body.name, 'hello.txt')
              assert.strictEqual(res.body.type, 'text/plain')
              assert.strictEqual(res.body.size, 5)
              assert.ok(fs.existsSync(path.resolve(ctx0.dir, 'uploads', res.body.id)))
              done()
            })
        })

        it('should respond with JSON for files over the size limit', function (done) {
          request(this.app)
            .post('/uploads')
            .attach('file', Buffer.alloc(6 * 1024 * 1024), { filename: 'big.txt', contentType: 'text/plain' })
            .expect(413, function (err, res) {
              if (err) return done(err)
              assert.strictEqual(res.body.error, 'File too large')
              done()
            })
        })
      })
    })

    describe('with --session --csrf', function () {
      const ctx0 = setupTestEnvironment('uploads with csrf')

      it('should create basic app', function (done) {
        run(ctx0.dir, ['--uploads', '--session', '--csrf'], function (err) {
          if (err) return done(err)
          done()
        })
      })

      it('should check the token in the upload route', function () {
        const csrf = fs.readFileSync(path.resolve(ctx0.dir, 'csrf.js'), 'utf8')
        const route = fs.readFileSync(path.resolve(ctx0.dir, 'routes', 'uploads.js'), 'utf8')
        const view = fs.readFileSync(path.resolve(ctx0.dir, 'views', 'uploads.pug'), 'utf8')
        assert.ok(/^ {2}skipCsrfProtection: \(req\) => req\.path === '\/uploads'$/m.test(csrf))
        assert.ok(/^ {4}if \(!csrf\.isRequestValid\(req\)\) return cb\(csrf\.invalidCsrfTokenError\);$/m.test(route))
        // the token field comes before the file, so it is read first
        assert.ok(view.indexOf("name='_csrf'") < view.indexOf("type='file'"))
      })

      it('should have installable dependencies', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmInstall(ctx0.dir, done)
      })

      it('should pass its tests', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmRun(ctx0.dir, 'test', done)
      })

      describe('npm start', function () {
        before('start app', function () {
          this.app = new AppRunner(ctx0.dir)
        })

        after('stop app', function (done) {
          this.timeout(APP_START_STOP_TIMEOUT)
          this.app.stop(done)
        })

        it('should start app', function (done) {
          this.timeout(APP_START_STOP_TIMEOUT)
          this.app.start(done)
        })

        it('should not save a file without the token', function (done) {
          request(this.app)
            .post('/uploads')
            .attach('file', Buffer.from('hello'), { filename: 'hello.txt', contentType: 'text/plain' })
            .expect(403, function (err) {
              if (err) return done(err)
              assert.deepStrictEqual(fs.readdirSync(path.resolve(ctx0.dir, 'uploads')), [])
              done()
            })
        })

        it('should save a file sent after the token', function (done) {
          const agent = request.agent(this.app)

          agent.get('/uploads').expect(200, function (err, res) {
            if (err) return done(err)

            const token = /<input type="hidden" name="_csrf" value="([^"]+)">/.exec(res.text)[1]

            agent.post('/uploads')
              .field('_csrf', token)
              .attach('file', Buffer.from('hello'), { filename: 'hello.txt', contentType: 'text/plain' })
              .expect(303, done)
          })
        })
      })
    })
  })

  describe('--logger', function () {
    describe('pino', function () {
      const ctx = setupTestEnvironment('logger pino')

      it('should create basic app', function (done) {
        run(ctx.dir, ['--api', '--logger=pino'], function (err, stdout) {
          if (err) return done(err)
          assert.strictEqual(utils.parseCreatedFiles(stdout, ctx.dir).length, 11)
          done()
        })
      })

      it('should use pino-http instead of morgan', function () {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(ctx.dir, 'package.json'), 'utf8'))
        const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
        assert.strictEqual(pkg.dependencies['pino-http'], VERSIONS['pino-http'])
        assert.strictEqual(pkg.dependencies.morgan, undefined)
        assert.ok(/^import \{ pinoHttp \} from 'pino-http';$/m.test(contents))
        assert.ok(!/morgan/.test(contents))
      })

      it('should pretty print logs in development', function () {
        const pkg = JSON.parse(fs.readFileSync(path.resolve(ctx.dir, 'package.json'), 'utf8'))
        assert.ok(/ \| pino-pretty$/.test(pkg.scripts.dev))
        assert.strictEqual(pkg.devDependencies['pino-pretty'], VERSIONS['pino-pretty'])
      })

      it('should have installable dependencies', function (done) {
        this.timeout(NPM_INSTALL_TIMEOUT)
        npmInstall(ctx.dir, done)
      })

      it('should pass its tests', function (done) {
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

        it('should respond to GET /', function (done) {
          request(this.app)
            .get('/')
            .expect(200, { message: 'Welcome to Express' }, done)
        })
      })
    })

    describe('(unsupported logger)', function () {
      const ctx = setupTestEnvironment('logger unsupported')

      it('should exit with code 1', function (done) {
        runRaw(ctx.dir, ['--logger=winston'], function (err, code, stdout, stderr) {
          if (err) return done(err)
          assert.strictEqual(code, 1)
          assert.ok(/error: unsupported logger `winston'/.test(stderr))
          done()
        })
      })
    })

    describe('(no logger)', function () {
      const ctx = setupTestEnvironment('logger missing')

      it('should exit with code 1', function (done) {
        runRaw(ctx.dir, ['--logger'], function (err, code, stdout, stderr) {
          if (err) return done(err)
          assert.strictEqual(code, 1)
          assert.ok(/error: option `--logger <name>' argument missing/.test(stderr))
          done()
        })
      })
    })
  })

  describe('--docker', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--docker'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 20)
        done()
      })
    })

    it('should have Docker files', function () {
      assert.notStrictEqual(ctx.files.indexOf('Dockerfile'), -1)
      assert.notStrictEqual(ctx.files.indexOf('.dockerignore'), -1)
    })

    it('should run the app as the node user with a health check', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'Dockerfile'), 'utf8')
      assert.ok(/^FROM node:22-slim$/m.test(contents))
      assert.ok(/^RUN npm ci --omit=dev$/m.test(contents))
      assert.ok(/^COPY --chown=node:node \. \.$/m.test(contents))
      assert.ok(/^USER node$/m.test(contents))
      assert.ok(/^HEALTHCHECK /m.test(contents))
      assert.ok(/^CMD \["node", "\.\/bin\/www\.js"\]$/m.test(contents))
    })

    it('should keep secrets and dependencies out of the image', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, '.dockerignore'), 'utf8')
      assert.ok(/^node_modules$/m.test(contents))
      assert.ok(/^\.env$/m.test(contents))
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

      it('should respond to the health check', function (done) {
        request(this.app)
          .get('/health')
          .expect(200, { status: 'ok' }, done)
      })
    })
  })

  describe('--helmet', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--helmet'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 18)
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
        assert.ok(/Usage: npm create express-new@latest \[dir\] -- \[options\]/.test(stdout))
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
        assert.ok(/Usage: npm create express-new@latest \[dir\] -- \[options\]/.test(stdout))
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
        assert.strictEqual(ctx.files.length, 15)
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

    it('should have a plain text error handler that logs server errors', function () {
      const contents = fs.readFileSync(path.resolve(ctx.dir, 'app.js'), 'utf8')
      assert.ok(/^\/\/ error handler, responding with plain text$/m.test(contents))
      assert.ok(/^ {2}if \(status >= 500\) console\.error\(err\);$/m.test(contents))
      assert.ok(!/createError/.test(contents), 'should keep the default 404 without http-errors')
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

      it('should respond to client errors with plain text', function (done) {
        request(this.app)
          .post('/')
          .set('Content-Type', 'application/json')
          .send('{bad')
          .expect('Content-Type', /text\/plain/)
          .expect(400, /in JSON at position 1/, done)
      })
    })
  })

  describe('--ts', function () {
    const ctx = setupTestEnvironment(this.fullTitle())

    it('should create basic app', function (done) {
      run(ctx.dir, ['--ts'], function (err, stdout) {
        if (err) return done(err)
        ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
        assert.strictEqual(ctx.files.length, 19)
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
          .expect(404, /<title>Not Found<\/title>[\s\S]*<h1>Not Found<\/h1>\s*<h2>404<\/h2>/, done)
      })
    })

    describe('with all middleware', function () {
      const ctx0 = setupTestEnvironment('ts all middleware')

      it('should create basic app', function (done) {
        run(ctx0.dir, ['--ts', '--helmet', '--compression', '--cookies', '--view', 'ejs', '--rate-limit', '--session', '--csrf', '--uploads', '--logger=pino'], function (err, stdout) {
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
        assert.strictEqual(typeof pkg.devDependencies['@types/express-session'], 'string')
        assert.strictEqual(pkg.devDependencies['@types/morgan'], undefined)
        assert.strictEqual(typeof pkg.devDependencies['@types/multer'], 'string')
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
          assert.ok(/Usage: npm create express-new@latest \[dir\] -- \[options\]/.test(stdout))
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
          assert.strictEqual(ctx.files.length, 17, 'should have 17 files')
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
            .expect(404, /<title>Not Found<\/title>[\s\S]*<h1>Not Found<\/h1>\s*<h2>404<\/h2>/, done)
        })
      })
    })

    describe('hbs', function () {
      const ctx = setupTestEnvironment(this.fullTitle())

      it('should create basic app with hbs templates', function (done) {
        run(ctx.dir, ['--view', 'hbs'], function (err, stdout) {
          if (err) return done(err)
          ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
          assert.strictEqual(ctx.files.length, 18)
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
            .expect(404, /<title>Not Found<\/title>[\s\S]*<h1>Not Found<\/h1>\s*<h2>404<\/h2>/, done)
        })
      })
    })

    describe('pug', function () {
      const ctx = setupTestEnvironment(this.fullTitle())

      it('should create basic app with pug templates', function (done) {
        run(ctx.dir, ['--view', 'pug'], function (err, stdout) {
          if (err) return done(err)
          ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
          assert.strictEqual(ctx.files.length, 18)
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
            .expect(404, /<title>Not Found<\/title>[\s\S]*<h1>Not Found<\/h1>\s*<h2>404<\/h2>/, done)
        })
      })
    })

    describe('twig', function () {
      const ctx = setupTestEnvironment(this.fullTitle())

      it('should create basic app with twig templates', function (done) {
        run(ctx.dir, ['--view', 'twig'], function (err, stdout) {
          if (err) return done(err)
          ctx.files = utils.parseCreatedFiles(stdout, ctx.dir)
          assert.strictEqual(ctx.files.length, 18)
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
            .expect(404, /<title>Not Found<\/title>[\s\S]*<h1>Not Found<\/h1>\s*<h2>404<\/h2>/, done)
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
