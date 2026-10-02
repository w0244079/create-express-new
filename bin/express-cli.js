#!/usr/bin/env node

import ejs from 'ejs'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import util from 'node:util'
import { CancelError } from '../lib/prompts.js'
import { wizard } from '../lib/wizard.js'

const MODE_0666 = 0o666
const MODE_0755 = 0o755
const TEMPLATE_DIR = path.join(import.meta.dirname, '..', 'templates')
const VERSION = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf-8')).version

// generated app dependency versions, checked by `npm run versions`
const VERSIONS = JSON.parse(fs.readFileSync(path.join(TEMPLATE_DIR, 'versions.json'), 'utf-8')).versions

// supported view engines, keyed by template file extension
const VIEW_ENGINES = {
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

// command line options
const OPTIONS = {
  api: { type: 'boolean' },
  cjs: { type: 'boolean' },
  compression: { type: 'boolean' },
  cookies: { type: 'boolean' },
  cors: { type: 'boolean' },
  docker: { type: 'boolean' },
  force: { type: 'boolean', short: 'f' },
  git: { type: 'boolean' },
  helmet: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  lint: { type: 'boolean' },
  'no-git': { type: 'boolean' },
  'no-view': { type: 'boolean' },
  ts: { type: 'boolean' },
  version: { type: 'boolean' },
  view: { type: 'string', short: 'v' }
}

// run the wizard when started in a terminal without arguments
const args = process.argv.slice(2)

if (args.length === 0 && process.stdin.isTTY && process.stdout.isTTY) {
  wizard({ input: process.stdin, output: process.stdout }).then((options) => {
    main(options, (code) => installDependencies(options, code))
  }, (err) => {
    if (!(err instanceof CancelError)) throw err
    console.error('aborting')
    exit(1)
  })
} else {
  main(parseOptions(args), exit)
}

/**
 * Prompt for confirmation on STDOUT/STDIN
 */

function confirm (msg, fn) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  let answered = false

  rl.question(msg, (input) => {
    answered = true
    rl.close()
    fn(/^(y|yes|ok|true)$/i.test(input.trim()))
  })

  // treat closing STDIN without an answer as "no"
  rl.on('close', () => {
    if (!answered) {
      console.log()
      fn(false)
    }
  })
}

/**
 * Copy file from template directory.
 */

function copyTemplate (from, to, mode) {
  write(to, fs.readFileSync(path.join(TEMPLATE_DIR, from), 'utf-8'), mode)
}

/**
 * Copy all files with the given extension from template directory.
 */

function copyTemplateMulti (fromDir, toDir, ext) {
  fs.readdirSync(path.join(TEMPLATE_DIR, fromDir))
    .filter((name) => path.extname(name) === '.' + ext)
    .forEach((name) => {
      copyTemplate(path.join(fromDir, name), path.join(toDir, name))
    })
}

/**
 * Create application at the given directory.
 *
 * @param {string} name
 * @param {string} dir
 * @param {object} options
 * @param {function} done
 */

function createApplication (name, dir, options, done) {
  console.log()

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

  if (dir !== '.') {
    mkdir(dir, '.')
  }

  if (!api) {
    mkdir(dir, 'public')
    mkdir(dir, 'public/stylesheets')

    // Stylesheet
    copyTemplate('public/stylesheets/style.css', path.join(dir, 'public/stylesheets/style.css'))
  }

  // copy route templates
  mkdir(dir, 'routes')
  for (const route of ['index', 'users']) {
    const router = loadTemplate('app/routes/' + route + '.js')
    router.locals.api = api
    router.locals.esm = esm
    write(path.join(dir, 'routes', route + '.' + ext), router.render())
  }

  // copy test templates
  mkdir(dir, 'test')
  write(path.join(dir, 'test/app.test.' + ext), test.render())

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
    mkdir(dir, 'views')
    copyTemplateMulti('views', dir + '/views', options.view)

    app.locals.view = { engine: options.view }
    pkg.dependencies[view.pkg] = VERSIONS[view.pkg]
  } else {
    app.locals.view = false

    // Copy extra public files
    if (!api) {
      copyTemplate('public/index.html', path.join(dir, 'public/index.html'))
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
  write(path.join(dir, '.env.example'), envExample.render())

  // Container image
  if (options.docker) {
    const dockerfile = loadTemplate('app/Dockerfile')
    dockerfile.locals.name = name
    dockerfile.locals.www = www
    write(path.join(dir, 'Dockerfile'), dockerfile.render())
    copyTemplate('app/dockerignore', path.join(dir, '.dockerignore'))
  }

  if (options.git) {
    copyTemplate('app/gitignore', path.join(dir, '.gitignore'))
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

    write(path.join(dir, 'tsconfig.json'), JSON.stringify(TSCONFIG, null, 2) + '\n')
  }

  // Linting
  if (options.lint) {
    const config = loadTemplate('app/eslint.config.js')
    config.locals.esm = esm
    config.locals.ts = ts

    // CommonJS apps need the .mjs extension for the ES module config
    write(path.join(dir, esm ? 'eslint.config.js' : 'eslint.config.mjs'), config.render())

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

  // write files
  write(path.join(dir, 'app.' + ext), app.render())
  write(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  mkdir(dir, 'bin')
  write(path.join(dir, 'bin/www.' + ext), server.render(), MODE_0755)

  // dependencies installed by the wizard print next steps afterwards
  if (!options.install) {
    printNextSteps(dir, true)
  }

  done(0)
}

/**
 * Run npm install in the generated app, when the wizard asked to.
 *
 * @param {object} options
 * @param {number} code
 */

function installDependencies (options, code) {
  if (code !== 0 || !options.install) return exit(code)

  const dir = options._[0]

  console.log('   installing dependencies...')
  console.log()

  const child = spawn('npm', ['install'], {
    cwd: dir,
    shell: process.platform === 'win32',
    stdio: 'inherit'
  })

  child.on('error', (err) => {
    error('npm install failed: ' + err.message)
    printNextSteps(dir, true)
    exit(1)
  })

  child.on('close', (status) => {
    if (status !== 0) error('npm install failed')
    printNextSteps(dir, status !== 0)
    exit(status === 0 ? 0 : 1)
  })
}

/**
 * Display the commands to run the generated app.
 *
 * @param {string} dir
 * @param {boolean} install include the npm install step
 */

function printNextSteps (dir, install) {
  const prompt = launchedFromCmd() ? '>' : '$'

  if (dir !== '.') {
    console.log()
    console.log('   change directory:')
    console.log('     %s cd %s', prompt, dir)
  }

  if (install) {
    console.log()
    console.log('   install dependencies:')
    console.log('     %s npm install', prompt)
  }

  console.log()
  console.log('   run the app:')
  console.log('     %s npm start', prompt)
  console.log()
  console.log('   run the app in development, restarting on change:')
  console.log('     %s npm run dev', prompt)
  console.log()
}

/**
 * Create an app name from a directory path, fitting npm naming requirements.
 *
 * @param {String} pathName
 */

function createAppName (pathName) {
  return path.basename(pathName)
    .replace(/[^A-Za-z0-9.-]+/g, '-')
    .replace(/^[-_.]+|-+$/g, '')
    .toLowerCase()
}

/**
 * Check if the given directory `dir` is empty.
 *
 * @param {String} dir
 * @param {Function} fn
 */

function emptyDirectory (dir, fn) {
  fs.readdir(dir, (err, files) => {
    if (err && err.code !== 'ENOENT') throw err
    fn(!files || !files.length)
  })
}

/**
 * Display an error.
 *
 * @param {String} message
 */

function error (message) {
  console.error()
  message.split('\n').forEach((line) => {
    console.error('  error: %s', line)
  })
  console.error()
}

/**
 * Set the exit code, letting the process exit once all output is flushed.
 */

function exit (code) {
  process.exitCode = code
}

/**
 * Determine if launched from cmd.exe
 */

function launchedFromCmd () {
  return process.platform === 'win32' &&
    process.env._ === undefined
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
 * Main program.
 */

function main (options, done) {
  // top-level argument direction
  if (options['!'].length > 0) {
    usage()
    error('unknown option `' + options['!'][0] + "'")
    done(1)
  } else if (options.help) {
    usage()
    done(0)
  } else if (options.version) {
    version()
    done(0)
  } else if (options.view === '') {
    usage()
    error('option `-v, --view <engine>\' argument missing')
    done(1)
  } else {
    // Path
    const destinationPath = options._[0] || '.'

    // App name
    const appName = createAppName(path.resolve(destinationPath)) || 'hello-world'

    // A JSON API has no view engine
    if (options.api) {
      if (typeof options.view === 'string') {
        usage()
        error('option `--api\' cannot be used with `--view\'')
        return done(1)
      }

      options.view = false
    }

    // Default view engine
    if (options.view === true) {
      options.view = 'pug'
    }

    // Renamed engines
    if (options.view === 'jade') {
      warning("jade has been renamed to pug, using `--view=pug'")
      options.view = 'pug'
    }

    if (options.ts && options.cjs) {
      usage()
      error('option `--ts\' cannot be used with `--cjs\'')
      return done(1)
    }

    // Unsupported engines
    if (options.view && !VIEW_ENGINES[options.view]) {
      usage()
      error('unsupported view engine `' + options.view + "'")
      return done(1)
    }

    // Generate application
    emptyDirectory(destinationPath, (empty) => {
      if (empty || options.force) {
        createApplication(appName, destinationPath, options, done)
      } else {
        confirm('destination is not empty, continue? [y/N] ', (ok) => {
          if (ok) {
            process.stdin.destroy()
            createApplication(appName, destinationPath, options, done)
          } else {
            console.error('aborting')
            done(1)
          }
        })
      }
    })
  }
}

/**
 * Make the given dir relative to base.
 *
 * @param {string} base
 * @param {string} dir
 */

function mkdir (base, dir) {
  const loc = path.join(base, dir)

  console.log('   \x1b[36mcreate\x1b[0m : ' + loc + path.sep)
  fs.mkdirSync(loc, { recursive: true, mode: MODE_0755 })
}

/**
 * Parse command line arguments.
 *
 * The view option defaults to `true` when not given and is `''` when given
 * without an argument; `_` holds positionals and `!` holds unknown options.
 *
 * @param {string[]} argv
 */

function parseOptions (argv) {
  const { values, positionals, tokens } = util.parseArgs({
    args: argv,
    options: OPTIONS,
    allowPositionals: true,
    strict: false,
    tokens: true
  })

  const options = { view: true, ...values, _: positionals, '!': [] }

  for (const token of tokens) {
    if (token.kind !== 'option') continue

    if (!Object.hasOwn(OPTIONS, token.name)) {
      options['!'].push(token.rawName)
    } else if (OPTIONS[token.name].type === 'string' &&
      (token.value === undefined || (!token.inlineValue && token.value.startsWith('-')))) {
      // argument missing, or the next option was taken as the argument
      options[token.name] = ''
    }
  }

  if (options['no-view']) {
    options.view = false
  }

  // a .gitignore is added unless --no-git is given
  options.git = !options['no-git']

  return options
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
 * Display the usage.
 */

function usage () {
  console.log('')
  console.log('  Usage: express-generator-modern [options] [dir]')
  console.log('         express [options] [dir]   (when installed globally)')
  console.log('')
  console.log('  Run without arguments in a terminal to choose the options interactively.')
  console.log('')
  console.log('  Options:')
  console.log('')
  console.log('    -v, --view <engine>  add view <engine> support (ejs|hbs|pug|twig) (defaults to pug)')
  console.log('        --no-view        use static html instead of view engine')
  console.log('        --api            generate a JSON API, without views or static files')
  console.log('        --cjs            generate CommonJS modules instead of ES modules')
  console.log('        --ts             generate TypeScript, run directly by Node.js')
  console.log('        --helmet         add helmet middleware for security headers')
  console.log('        --compression    add compression middleware for gzip/brotli responses')
  console.log('        --cookies        add cookie-parser middleware')
  console.log('        --cors           add cors middleware for cross-origin requests')
  console.log('        --docker         add a Dockerfile for a production image')
  console.log('        --lint           add ESLint and an npm run lint script')
  console.log('        --no-git         skip the .gitignore')
  console.log('    -f, --force          force on non-empty directory')
  console.log('        --version        output the version number')
  console.log('    -h, --help           output usage information')
}

/**
 * Display the version.
 */

function version () {
  console.log(VERSION)
}

/**
 * Display a warning.
 *
 * @param {String} message
 */

function warning (message) {
  console.error()
  message.split('\n').forEach((line) => {
    console.error('  warning: %s', line)
  })
  console.error()
}

/**
 * echo str > file.
 *
 * @param {String} file
 * @param {String} str
 */

function write (file, str, mode) {
  fs.writeFileSync(file, str, { mode: mode || MODE_0666 })
  console.log('   \x1b[36mcreate\x1b[0m : ' + file)
}
