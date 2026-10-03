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

  // Module format
  const esm = !options.cjs
  const dirname = esm ? 'import.meta.dirname' : '__dirname'

  // App kind: a JSON API has no views or static files
  const api = Boolean(options.api)

  // Language
  const ts = Boolean(options.ts)
  const ext = ts ? 'ts' : 'js'
  const www = './bin/www.' + ext

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

  // App modules
  app.locals.localModules = Object.create(null)
  app.locals.modules = Object.create(null)
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
  app.locals.modules.logger = 'morgan'
  app.locals.uses.push("logger('dev', {\n  // skip request logs while testing\n  skip: () => process.env.NODE_ENV === 'test'\n})")
  pkg.dependencies.morgan = VERSIONS.morgan

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
    file('routes/' + route + '.' + ext, router.render())
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

  // Template support
  if (options.view) {
    const view = VIEW_ENGINES[options.view]

    // Copy view templates
    dir('views')
    fs.readdirSync(path.join(TEMPLATE_DIR, 'views'))
      .filter((template) => path.extname(template) === '.' + options.view)
      .forEach((template) => copy('views/' + template, 'views/' + template))

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

  // Environment variables
  const envExample = loadTemplate('app/env.example')
  envExample.locals.cors = Boolean(options.cors)
  file('.env.example', envExample.render(), { config: true })

  // Container image
  if (options.docker) {
    const dockerfile = loadTemplate('app/Dockerfile')
    dockerfile.locals.name = name
    dockerfile.locals.www = www
    file('Dockerfile', dockerfile.render(), { config: true })
    copy('app/dockerignore', '.dockerignore', { config: true })
  }

  if (options.git) {
    copy('app/gitignore', '.gitignore', { merge: true })
  }

  // TypeScript type checking
  if (ts) {
    pkg.scripts.typecheck = 'tsc'
    const types = ['@types/express', '@types/morgan', '@types/node']

    if (app.locals.httpErrors) types.push('@types/http-errors')
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
 * messages for paths in the way of a folder or file, and `conflicts`, the
 * planned files that exist with other contents. Merged files are never
 * conflicts. The file system decides whether names differ only in case.
 *
 * @param {string} dir
 * @param {object[]} entries
 */

export function checkDestination (dir, entries) {
  const blockers = []
  const conflicts = []

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

  return { blockers, conflicts }
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
