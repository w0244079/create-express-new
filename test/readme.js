import assert from 'node:assert'
import { planApp, scriptCommand } from '../lib/app.js'

describe('app README', function () {
  const base = { view: 'pug', git: true, logger: 'morgan', pm: 'pnpm' }

  function generate (options) {
    const entries = planApp('my-app', { ...base, ...options, readme: true })
    return { entries, contents: entries.find((entry) => entry.path === 'README.md').contents }
  }

  it('should be opt-in and leave the rest of the app unchanged', function () {
    const plain = planApp('my-app', base)
    const { entries } = generate({})
    assert.ok(!plain.some((entry) => entry.path === 'README.md'))
    assert.deepStrictEqual(entries.filter((entry) => entry.path !== 'README.md'), plain)
    assert.strictEqual(entries.find((entry) => entry.path === 'README.md').config, true)
  })

  for (const pm of ['pnpm', 'npm']) {
    for (const language of [{}, { ts: true }, { cjs: true }]) {
      for (const kind of [{ view: 'pug' }, { view: 'ejs' }, { view: 'hbs' }, { view: 'twig' }, { view: false }, { api: true, view: false }, { api: true, view: 'pug' }]) {
        const options = { ...language, ...kind, pm }
        it('should document the generated files and commands for ' + JSON.stringify(options), function () {
          const { entries, contents } = generate(options)
          const pkg = JSON.parse(entries.find((entry) => entry.path === 'package.json').contents)

          assert.ok(contents.startsWith('# my-app\n'))
          assert.ok(contents.includes('Requires Node.js ' + pkg.engines.node + ' and ' + pm + ' ' + pkg.devEngines.packageManager.version))
          assert.ok(contents.includes(pm + ' install'))
          assert.ok(!contents.includes(pm === 'npm' ? 'pnpm' : 'npm run'))
          for (const script of Object.keys(pkg.scripts)) {
            assert.ok(contents.includes('`' + scriptCommand(pm, script) + '`'), script)
          }
          for (const [, target] of contents.matchAll(/\]\(\.\/([^)]+)\)/g)) {
            assert.ok(entries.some((entry) => entry.path === target.replace(/\/$/, '')), target)
          }
          assert.ok(!/<%/.test(contents), 'should render all template tags')
          assert.strictEqual(contents.includes('Pages are rendered with ' + kind.view), Boolean(kind.view))
          assert.strictEqual(contents.includes('GET /api/users'), Boolean(kind.api && kind.view))
          assert.strictEqual(contents.includes('API errors return JSON'), Boolean(kind.api))
          for (const absent of ['SESSION_SECRET', 'CORS_ORIGIN', 'RATE_LIMIT_MAX', 'UPLOAD_MAX_SIZE', 'CSRF tokens', '### Docker', '### Sass', 'typecheck', 'lint']) {
            if (absent === 'typecheck' && language.ts) continue
            assert.ok(!contents.includes(absent), absent + ' should be omitted')
          }
        })
      }
    }
  }

  it('should document all selected extras and middleware', function () {
    const { contents } = generate({
      api: true,
      ts: true,
      lint: true,
      docker: true,
      sass: true,
      helmet: true,
      compression: true,
      cookies: true,
      cors: true,
      rateLimit: true,
      session: true,
      csrf: true,
      uploads: true,
      logger: 'pino'
    })

    for (const expected of [
      'pnpm test:coverage', 'pnpm typecheck', 'pnpm lint', 'pnpm css', 'pnpm css:watch',
      'Helmet', 'Compression', 'req.cookies', 'req.log', 'pino-pretty',
      'CORS_ORIGIN', 'RATE_LIMIT_MAX', 'RATE_LIMIT_WINDOW_MS', 'TRUST_PROXY',
      'SESSION_SECRET', 'persistent session store', 'UPLOAD_MAX_SIZE',
      'GET /uploads', 'POST /uploads', 'GET /users/new',
      'csrf.ts', 'x-csrf-token', 'before the file field',
      'the API under `/api` only', 'also require the token',
      'node --env-file-if-exists=.env ./bin/www.ts', 'docker run --env-file .env -p 3000:3000 my-app',
      '/app/uploads', 'Stylesheets are compiled during the image build'
    ]) {
      assert.ok(contents.includes(expected), expected)
    }
  })

  it('should document CORS and CSRF scope choices', function () {
    const { contents } = generate({ api: true, cors: true, corsScope: 'all', session: true, csrf: true, csrfScope: 'pages' })
    assert.ok(contents.includes('CORS applies to the whole app'))
    assert.ok(contents.includes('Routes under `/api` are excluded from CSRF protection'))
    assert.ok(contents.includes('Do not authenticate them using the session'))
    assert.ok(!contents.includes('also require the token'))
  })

  it('should document API uploads without a form or CSRF instructions', function () {
    const { contents } = generate({ api: true, view: false, uploads: true, docker: true, pm: 'npm' })
    assert.ok(contents.includes('POST /uploads'))
    assert.ok(contents.includes('routes/uploads.js'))
    assert.ok(contents.includes('docker run -p 3000:3000 my-app'))
    assert.ok(!contents.includes('GET /uploads'))
    assert.ok(!contents.includes('_csrf'))
    assert.ok(!contents.includes('SESSION_SECRET'))
  })
})
