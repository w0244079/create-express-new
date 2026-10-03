// Plan the folders and files of a generated app without writing them, and
// check a destination directory against the plan, so existing files can be
// found, and asked about, before anything is written.

import ejs from 'ejs'
import fs from 'node:fs'
import path from 'node:path'
import util from 'node:util'

const MODE_0666 = 0o666
const MODE_0755 = 0o755
const TEMPLATE_DIR = path.join(import.meta.dirname, '..', 'templates')

// generated app dependency versions, checked by `npm run versions`
const VERSIONS = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, 'versions.json'), 'utf-8')).versions

// supported view engines, keyed by template file extension
export const VIEW_ENGINES = {
  ejs: { pkg: 'ejs' },
  hbs: { pkg: 'hbs' },
  pug: { pkg: 'pug' },
  twig: { pkg: 'twig' }
}

// supported request loggers
export const LOGGERS = ['morgan', 'pino']

// supported package managers, with the versions a generated app accepts: the
// ones that block dependency install scripts by default and support the
// settings in the app's config file
export const PACKAGE_MANAGERS = {
  pnpm: { version: '>=11', docs: 'https://pnpm.io/installation' },
  npm: { version: '>=12', docs: 'https://docs.npmjs.com/downloading-and-installing-node-js-and-npm' }
}

export const DEFAULT_PACKAGE_MANAGER = 'pnpm'

// views generated only with some options
const OPTIONAL_VIEWS = { 'new-user': 'csrf', uploads: 'uploads' }

// the hidden CSRF token field of each view engine's forms, in place of the
// `@csrf` lines in view templates
const CSRF_FIELD = {
  ejs: '<input type="hidden" name="_csrf" value="<%= csrfToken %>">',
  hbs: '<input type="hidden" name="_csrf" value="{{csrfToken}}">',
  pug: "input(type='hidden', name='_csrf', value=csrfToken)",
  twig: '<input type="hidden" name="_csrf" value="{{ csrfToken }}">'
}

// a line for the CSRF token in the <head> of each view engine's page layout,
// added after the title; ejs reads it from `locals`, as the error page can
// render before the token is set
const CSRF_META = {
  ejs: '<meta name="csrf-token" content="<%= locals.csrfToken %>">',
  hbs: '<meta name="csrf-token" content="{{csrfToken}}">',
  pug: "meta(name='csrf-token', content=csrfToken)",
  twig: '<meta name="csrf-token" content="{{ csrfToken }}">'
}

// tsconfig.json for TypeScript apps, which Node.js runs by stripping types
const TSCONFIG = {
  compilerOptions: {
    target: 'esnext',
    module: 'nodenext',
    strict: true,
    noEmit: true,
    allowImportingTsExtensions: true,
    erasableSyntaxOnly: true,
    verbatimModuleSyntax: true,
    skipLibCheck: true
  }
}

// files some other options generate, which an app with these options does
// not use: code in the other language, the other ESLint config, the pnpm
// settings and the templates of other view engines
const ALTERNATIVES = [
  ...['app', 'bin/www', 'csrf', 'routes/index', 'routes/uploads', 'routes/users', 'test/app.test'].flatMap((file) => [file + '.js', file + '.ts']),
  'eslint.config.js',
  'eslint.config.mjs',
  'pnpm-workspace.yaml',
  ...fs.readdirSync(path.join(TEMPLATE_DIR, 'views')).map((file) => 'views/' + file)
]

/**
 * Plan an app: its folders and files, in the order to create them, with
 * paths relative to the app directory. Files are `{ path, contents, mode }`,
 * marked `config` when the app runs without them, so an existing one can be
 * kept, or `merge` when an existing one gets the missing lines instead.
 *
 * @param {string} name
 * @param {object} options
 */

export function planApp (name, options) {
  const entries = []

  function dir (to) {
    entries.push({ type: 'dir', path: to })
  }

  function file (to, contents, extra) {
    entries.push({ type: 'file', path: to, contents, mode: MODE_0666, ...extra })
  }

  function copy (from, to, extra) {
    file(to, fs.readFileSync(path.join(TEMPLATE_DIR, from), 'utf-8'), extra)
  }

  // an ignore file, ignoring uploaded files too
  function ignore (from) {
    const contents = fs.readFileSync(path.join(TEMPLATE_DIR, from), 'utf-8')
    return options.uploads ? contents + '\n# Uploaded files\nuploads/\n' : contents
  }

  // Module format
  const esm = !options.cjs
  const dirname = esm ? 'import.meta.dirname' : '__dirname'

  // App kind: a JSON API has no views or static files
  const api = Boolean(options.api)

  // Sessions, and CSRF protection using them, are for web apps with views
  const session = Boolean(options.session) && !api
  const csrf = Boolean(options.csrf) && session && Boolean(options.view)

  // File uploads, with an upload form in apps with views
  const uploads = Boolean(options.uploads)

  // a rate limit, or a session cookie's Secure flag, need the client's real
  // address and protocol behind a proxy
  const trustProxy = Boolean(options.rateLimit) || session

  // Language
  const ts = Boolean(options.ts)
  const ext = ts ? 'ts' : 'js'
  const www = './bin/www.' + ext

  // Package manager
  const pm = options.pm ?? DEFAULT_PACKAGE_MANAGER

  // load .env, when it exists, before starting the app
  const env = '--env-file-if-exists=.env'

  // Package
  const pkg = {
    name,
    version: '0.0.0',
    private: true,
    type: esm ? 'module' : 'commonjs',
    scripts: {
      start: 'node ' + env + ' ' + www,
      test: 'node --test',
      // restart the app on change
      dev: 'node --watch ' + env + ' ' + www
    },
    engines: {
      // --env-file-if-exists needs Node.js 22.9, and TypeScript type
      // stripping is enabled by default from Node.js 22.18
      node: ts ? '>=22.18' : '>=22.9'
    },
    devEngines: {
      // other package managers refuse to install the app or run its scripts
      packageManager: { name: pm, version: PACKAGE_MANAGERS[pm].version, onFail: 'error' }
    },
    dependencies: {
      express: VERSIONS.express
    },
    devDependencies: {}
  }

  // JavaScript
  const app = loadTemplate('app/app.js')
  const server = loadTemplate('app/www.js')
  const test = loadTemplate('app/test/app.test.js')

  for (const template of [app, server, test]) {
    template.locals.api = api
    template.locals.esm = esm
    template.locals.ext = ext
    template.locals.ts = ts
  }

  app.locals.dirname = dirname
  app.locals.httpErrors = Boolean(options.view) || api
  app.locals.trustProxy = trustProxy
  app.locals.session = session
  app.locals.csrf = csrf

  test.locals.rateLimit = Boolean(options.rateLimit)
  test.locals.csrf = csrf
  test.locals.uploads = uploads
  test.locals.view = Boolean(options.view)

  // App modules
  app.locals.localModules = Object.create(null)
  app.locals.modules = Object.create(null)
  app.locals.named = new Set()
  app.locals.mounts = []
  app.locals.uses = []

  // Security headers
  if (options.helmet) {
    app.locals.modules.helmet = 'helmet'
    app.locals.uses.push('helmet()')
    pkg.dependencies.helmet = VERSIONS.helmet
  }

  // Response compression
  if (options.compression) {
    app.locals.modules.compression = 'compression'
    app.locals.uses.push('compression()')
    pkg.dependencies.compression = VERSIONS.compression
  }

  // Cross-origin requests
  if (options.cors) {
    app.locals.modules.cors = 'cors'
    app.locals.uses.push("cors({\n  // any origin, or only the comma-separated origins in CORS_ORIGIN\n  origin: process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim()) ?? '*'\n})")
    pkg.dependencies.cors = VERSIONS.cors
  }

  // Request logger
  if (options.logger === 'pino') {
    app.locals.modules.pinoHttp = 'pino-http'
    app.locals.named.add('pinoHttp')
    app.locals.uses.push("pinoHttp({\n  // skip request logs while testing\n  autoLogging: { ignore: () => process.env.NODE_ENV === 'test' }\n})")
    pkg.dependencies['pino-http'] = VERSIONS['pino-http']

    // JSON logs, made readable in development
    pkg.scripts.dev += ' | pino-pretty'
    pkg.devDependencies['pino-pretty'] = VERSIONS['pino-pretty']
  } else {
    app.locals.modules.logger = 'morgan'
    app.locals.uses.push("logger('dev', {\n  // skip request logs while testing\n  skip: () => process.env.NODE_ENV === 'test'\n})")
    pkg.dependencies.morgan = VERSIONS.morgan
  }

  // Body parsers
  app.locals.uses.push('express.json()')

  if (!api) {
    app.locals.uses.push('express.urlencoded({ extended: false })')
  }

  // Cookie parser
  if (options.cookies) {
    app.locals.modules.cookieParser = 'cookie-parser'
    app.locals.uses.push('cookieParser()')
    pkg.dependencies['cookie-parser'] = VERSIONS['cookie-parser']
  }

  // the app directory itself
  dir('.')

  if (!api) {
    dir('public')
    dir('public/stylesheets')

    // Stylesheet
    copy('public/stylesheets/style.css', 'public/stylesheets/style.css')
  }

  // copy route templates
  dir('routes')
  for (const route of ['index', 'users']) {
    const router = loadTemplate('app/routes/' + route + '.js')
    router.locals.api = api
    router.locals.esm = esm
    // an example form for CSRF protection to protect
    router.locals.form = csrf
    file('routes/' + route + '.' + ext, router.render())
  }

  // upload route
  if (uploads) {
    const router = loadTemplate('app/routes/uploads.js')
    router.locals.csrf = csrf
    router.locals.dirname = dirname
    router.locals.esm = esm
    router.locals.ext = ext
    router.locals.ts = ts
    router.locals.view = Boolean(options.view)
    file('routes/uploads.' + ext, router.render())
  }

  // copy test templates
  dir('test')
  file('test/app.test.' + ext, test.render())

  // Index router mount
  app.locals.localModules.indexRouter = './routes/index.' + ext
  app.locals.mounts.push({ path: '/', code: 'indexRouter' })

  // User router mount
  app.locals.localModules.usersRouter = './routes/users.' + ext
  app.locals.mounts.push({ path: '/users', code: 'usersRouter' })

  // Upload router mount
  if (uploads) {
    app.locals.localModules.uploadsRouter = './routes/uploads.' + ext
    app.locals.mounts.push({ path: '/uploads', code: 'uploadsRouter' })
    pkg.dependencies.multer = VERSIONS.multer
    pkg.dependencies['http-errors'] = VERSIONS['http-errors']
  }

  // Template support
  if (options.view) {
    const view = VIEW_ENGINES[options.view]

    // Copy view templates, with the CSRF token in the page <head> and forms
    const optional = { csrf, uploads }

    dir('views')
    fs.readdirSync(path.join(TEMPLATE_DIR, 'views'))
      .filter((template) => path.extname(template) === '.' + options.view)
      .filter((template) => {
        const option = OPTIONAL_VIEWS[path.basename(template, path.extname(template))]
        return !option || optional[option]
      })
      .forEach((template) => {
        let contents = fs.readFileSync(path.join(TEMPLATE_DIR, 'views', template), 'utf-8')

        if (csrf) {
          contents = contents
            .replace(/^( *)(<title>.*|title= title)$/m, '$&\n$1' + CSRF_META[options.view])
            .replace(/^( *)@csrf$/gm, '$1' + CSRF_FIELD[options.view])
        } else {
          contents = contents.replace(/^ *@csrf\n/gm, '')
        }

        file('views/' + template, contents)
      })

    app.locals.view = { engine: options.view }
    pkg.dependencies[view.pkg] = VERSIONS[view.pkg]
  } else {
    app.locals.view = false

    // Copy extra public files
    if (!api) {
      copy('public/index.html', 'public/index.html')
    }
  }

  // HTTP errors for the 404 and error handlers
  if (app.locals.httpErrors) {
    pkg.dependencies['http-errors'] = VERSIONS['http-errors']
  }

  // Static files
  if (!api) {
    app.locals.uses.push('express.static(path.join(' + dirname + ", 'public'))")
  }

  // Rate limit, after static files so only app routes count
  if (options.rateLimit) {
    app.locals.modules.rateLimit = 'express-rate-limit'
    app.locals.named.add('rateLimit')
    app.locals.uses.push("rateLimit({\n  // requests each client may make per window, before 429 responses\n  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,\n  limit: Number(process.env.RATE_LIMIT_MAX) || 100,\n  standardHeaders: 'draft-8',\n  legacyHeaders: false\n})")
    pkg.dependencies['express-rate-limit'] = VERSIONS['express-rate-limit']
  }

  // Sessions
  if (session) {
    app.locals.modules.session = 'express-session'
    app.locals.uses.push("session({\n  // the default memory store loses sessions on restart and grows without\n  // limit: add a store, such as connect-redis, for production\n  secret: process.env.SESSION_SECRET || 'development only',\n  resave: false,\n  saveUninitialized: false,\n  // Secure over HTTPS, including behind a proxy with TRUST_PROXY set\n  cookie: { sameSite: 'lax', secure: 'auto' }\n})")
    pkg.dependencies['express-session'] = VERSIONS['express-session']
  }

  // CSRF protection
  if (csrf) {
    const module = loadTemplate('app/csrf.js')
    module.locals.esm = esm
    module.locals.uploads = uploads
    file('csrf.' + ext, module.render())

    app.locals.localModules.csrf = './csrf.' + ext
    app.locals.uses.push('csrf.csrfSynchronisedProtection')
    app.locals.uses.push('(req, res, next) => {\n  // the token for forms, and the csrf-token meta tag in views\n  res.locals.csrfToken = csrf.generateToken(req);\n  next();\n}')
    pkg.dependencies['csrf-sync'] = VERSIONS['csrf-sync']
  }

  // Environment variables
  const envExample = loadTemplate('app/env.example')
  envExample.locals.cors = Boolean(options.cors)
  envExample.locals.trustProxy = trustProxy
  envExample.locals.rateLimit = Boolean(options.rateLimit)
  envExample.locals.session = session
  envExample.locals.uploads = uploads
  envExample.locals.start = scriptCommand(pm, 'start')
  envExample.locals.dev = scriptCommand(pm, 'dev')
  file('.env.example', envExample.render(), { config: true })

  // Package manager settings, protecting installs from compromised packages
  if (pm === 'pnpm') {
    copy('app/pnpm-workspace.yaml', 'pnpm-workspace.yaml', { config: true })
  } else {
    copy('app/npmrc', '.npmrc', { config: true })
  }

  // Container image
  if (options.docker) {
    const dockerfile = loadTemplate('app/Dockerfile')
    dockerfile.locals.name = name
    dockerfile.locals.www = www
    dockerfile.locals.uploads = uploads
    dockerfile.locals.pm = pm
    // the exact package manager version, for repeatable image builds
    dockerfile.locals.pmVersion = VERSIONS[pm].replace(/^\^/, '')
    file('Dockerfile', dockerfile.render(), { config: true })
    file('.dockerignore', ignore('app/dockerignore'), { config: true })
  }

  if (options.git) {
    file('.gitignore', ignore('app/gitignore'), { merge: true })
  }

  // TypeScript type checking
  if (ts) {
    pkg.scripts.typecheck = 'tsc'
    const types = ['@types/express', '@types/node']

    if (options.logger !== 'pino') types.push('@types/morgan')
    if (session) types.push('@types/express-session')

    if (app.locals.httpErrors || uploads) types.push('@types/http-errors')
    if (uploads) types.push('@types/multer')
    if (options.compression) types.push('@types/compression')
    if (options.cookies) types.push('@types/cookie-parser')
    if (options.cors) types.push('@types/cors')

    pkg.devDependencies.typescript = VERSIONS.typescript
    for (const type of types) pkg.devDependencies[type] = VERSIONS[type]

    file('tsconfig.json', JSON.stringify(TSCONFIG, null, 2) + '\n', { config: true })
  }

  // Linting
  if (options.lint) {
    const config = loadTemplate('app/eslint.config.js')
    config.locals.esm = esm
    config.locals.ts = ts

    // CommonJS apps need the .mjs extension for the ES module config
    file(esm ? 'eslint.config.js' : 'eslint.config.mjs', config.render(), { config: true })

    pkg.scripts.lint = 'eslint .'
    for (const dep of ['eslint', '@eslint/js', 'globals']) pkg.devDependencies[dep] = VERSIONS[dep]

    if (ts) {
      // typescript-eslint does not support TypeScript 7 yet
      pkg.devDependencies['typescript-eslint'] = VERSIONS['typescript-eslint']
      pkg.devDependencies.typescript = VERSIONS['typescript@6']
    }
  }

  // sort dependencies like npm(1)
  pkg.dependencies = sortedObject(pkg.dependencies)
  pkg.devDependencies = sortedObject(pkg.devDependencies)

  if (!Object.keys(pkg.devDependencies).length) {
    delete pkg.devDependencies
  }

  file('app.' + ext, app.render())
  file('package.json', JSON.stringify(pkg, null, 2) + '\n')
  dir('bin')
  file('bin/www.' + ext, server.render(), { mode: MODE_0755 })

  return entries
}

/**
 * Check the destination directory against a plan. Returns `blockers`, the
 * messages for paths in the way of a folder or file, `conflicts`, the
 * planned files that exist with other contents, and `leftovers`, the paths
 * of existing files that other options generate and this app does not use.
 * Merged files are never conflicts. The file system decides whether names
 * differ only in case.
 *
 * @param {string} dir
 * @param {object[]} entries
 */

export function checkDestination (dir, entries) {
  const blockers = []
  const conflicts = []
  const planned = new Set(entries.map((entry) => entry.path))
  const leftovers = ALTERNATIVES.filter((file) => {
    const stats = !planned.has(file) && stat(path.join(dir, file))
    return Boolean(stats) && stats.isFile()
  })

  for (const entry of entries) {
    const stats = stat(path.join(dir, entry.path))
    const name = entry.path === '.' ? dir : entry.path

    // a file in the way of a parent folder, reported for that folder
    if (stats === false) {
      if (entry.path === '.') blockers.push(name + ' is inside a file, not a folder')
      continue
    }

    if (!stats) continue

    if (entry.type === 'dir') {
      if (!stats.isDirectory()) blockers.push(name + ' is a file, where a folder is needed')
    } else if (stats.isDirectory()) {
      blockers.push(name + ' is a folder, where a file is needed')
    } else if (!entry.merge && fs.readFileSync(path.join(dir, entry.path), 'utf-8') !== entry.contents) {
      conflicts.push(entry)
    }
  }

  return { blockers, conflicts, leftovers }
}

/**
 * Create an app name from a directory path, fitting npm naming requirements.
 *
 * @param {String} pathName
 */

export function createAppName (pathName) {
  return path.basename(pathName)
    .replace(/[^A-Za-z0-9.-]+/g, '-')
    .replace(/^[-_.]+|-+$/g, '')
    .toLowerCase()
}

/**
 * The command that runs a package.json script with a package manager.
 *
 * @param {string} pm
 * @param {string} script
 */

export function scriptCommand (pm, script) {
  return pm === 'npm' && script !== 'start' && script !== 'test' ? 'npm run ' + script : pm + ' ' + script
}

/**
 * Add the lines of `generated` missing from `existing`, skipping comments
 * and blank lines, under a comment saying where they came from.
 *
 * @param {string} existing
 * @param {string} generated
 */

export function mergeLines (existing, generated) {
  const have = new Set(existing.split(/\r?\n/).map((line) => line.trim()))
  const missing = generated.split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#') && !have.has(line))

  if (!missing.length) return existing

  const eol = existing.includes('\r\n') ? '\r\n' : '\n'
  const start = existing && !existing.endsWith('\n') ? eol : ''

  return existing + start + (existing ? eol : '') + '# Added by create-express-new' + eol + missing.join(eol) + eol
}

/**
 * Load template file.
 */

function loadTemplate (name) {
  const contents = fs.readFileSync(path.join(TEMPLATE_DIR, name + '.ejs'), 'utf-8')
  const locals = Object.create(null)

  function render () {
    return ejs.render(contents, locals, {
      escape: util.inspect
    })
  }

  return {
    locals,
    render
  }
}

/**
 * Sort object keys like npm(1).
 *
 * @param {object} obj
 */

function sortedObject (obj) {
  return Object.fromEntries(Object.keys(obj).sort().map((key) => [key, obj[key]]))
}

/**
 * Stat a path: null when missing, false when a parent is a file.
 */

function stat (file) {
  try {
    return fs.statSync(file)
  } catch (err) {
    if (err.code === 'ENOENT') return null
    if (err.code === 'ENOTDIR') return false
    throw err
  }
}
