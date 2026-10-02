#!/usr/bin/env node

import ejs from 'ejs'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import util from 'node:util'

const MODE_0666 = 0o666
const MODE_0755 = 0o755
const TEMPLATE_DIR = path.join(import.meta.dirname, '..', 'templates')
const VERSION = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf-8')).version

// supported stylesheet engines, compiled by the generated app's "build:css"
// script and recompiled on change by its "dev:css" script
const CSS_ENGINES = {
  less: {
    ext: 'less',
    pkg: 'less',
    version: '^4.9.1',
    build: 'lessc public/stylesheets/style.less public/stylesheets/style.css',
    // lessc has no watch mode, so rebuild whenever a .less file changes
    watch: 'nodemon --watch public/stylesheets --ext less --exec "npm run build:css"',
    devDependencies: { nodemon: '^3.1.14' }
  },
  sass: {
    ext: 'sass',
    pkg: 'sass',
    version: '^1.105.1',
    build: 'sass public/stylesheets:public/stylesheets',
    watch: 'sass --watch public/stylesheets:public/stylesheets'
  },
  scss: {
    ext: 'scss',
    pkg: 'sass',
    version: '^1.105.1',
    build: 'sass public/stylesheets:public/stylesheets',
    watch: 'sass --watch public/stylesheets:public/stylesheets'
  },
  stylus: {
    ext: 'styl',
    pkg: 'stylus',
    version: '^0.64.0',
    build: 'stylus public/stylesheets',
    watch: 'stylus --watch public/stylesheets'
  }
}

// supported view engines, keyed by template file extension
const VIEW_ENGINES = {
  ejs: { pkg: 'ejs', version: '^6.0.1' },
  hbs: { pkg: 'hbs', version: '^4.3.1' },
  pug: { pkg: 'pug', version: '^3.0.4' },
  twig: { pkg: 'twig', version: '^3.0.0' }
}

// command line options
const OPTIONS = {
  css: { type: 'string', short: 'c' },
  ejs: { type: 'boolean', short: 'e' },
  force: { type: 'boolean', short: 'f' },
  git: { type: 'boolean' },
  hbs: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  'no-view': { type: 'boolean' },
  pug: { type: 'boolean' },
  version: { type: 'boolean' },
  view: { type: 'string', short: 'v' }
}

// run
main(parseOptions(process.argv.slice(2)), exit)

/**
 * Prompt for confirmation on STDOUT/STDIN
 */

function confirm (msg, callback) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.question(msg, (input) => {
    rl.close()
    callback(/^y|yes|ok|true$/i.test(input))
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

  // Package
  const pkg = {
    name,
    version: '0.0.0',
    private: true,
    type: 'module',
    scripts: {
      start: 'node ./bin/www.js'
    },
    engines: {
      node: '>=22'
    },
    dependencies: {
      express: '^5.2.1'
    },
    devDependencies: {}
  }

  // JavaScript
  const app = loadTemplate('js/app.js')

  // App modules
  app.locals.localModules = Object.create(null)
  app.locals.modules = Object.create(null)
  app.locals.mounts = []
  app.locals.uses = []

  // Request logger
  app.locals.modules.logger = 'morgan'
  app.locals.uses.push("logger('dev')")
  pkg.dependencies.morgan = '^1.12.1'

  // Body parsers
  app.locals.uses.push('express.json()')
  app.locals.uses.push('express.urlencoded({ extended: false })')

  // Cookie parser
  app.locals.modules.cookieParser = 'cookie-parser'
  app.locals.uses.push('cookieParser()')
  pkg.dependencies['cookie-parser'] = '^1.4.7'

  if (dir !== '.') {
    mkdir(dir, '.')
  }

  mkdir(dir, 'public')
  mkdir(dir, 'public/javascripts')
  mkdir(dir, 'public/images')
  mkdir(dir, 'public/stylesheets')

  // CSS Engine support
  const css = CSS_ENGINES[options.css]

  if (css) {
    // compile stylesheets before the app starts
    copyTemplateMulti('css', dir + '/public/stylesheets', css.ext)
    pkg.scripts['build:css'] = css.build
    pkg.scripts.prestart = 'npm run build:css'
    pkg.dependencies[css.pkg] = css.version

    // restart the app and recompile stylesheets on change
    pkg.scripts.dev = 'concurrently --kill-others --names css,app npm:dev:css npm:dev:app'
    pkg.scripts['dev:app'] = 'node --watch ./bin/www.js'
    pkg.scripts['dev:css'] = css.watch
    pkg.devDependencies.concurrently = '^10.0.5'
    Object.assign(pkg.devDependencies, css.devDependencies)
  } else {
    copyTemplateMulti('css', dir + '/public/stylesheets', 'css')

    // restart the app on change
    pkg.scripts.dev = 'node --watch ./bin/www.js'
  }

  // copy route templates
  mkdir(dir, 'routes')
  copyTemplateMulti('js/routes', dir + '/routes', 'js')

  // Index router mount
  app.locals.localModules.indexRouter = './routes/index.js'
  app.locals.mounts.push({ path: '/', code: 'indexRouter' })

  // User router mount
  app.locals.localModules.usersRouter = './routes/users.js'
  app.locals.mounts.push({ path: '/users', code: 'usersRouter' })

  // Template support
  if (options.view) {
    const view = VIEW_ENGINES[options.view]

    // Copy view templates
    mkdir(dir, 'views')
    copyTemplateMulti('views', dir + '/views', options.view)

    app.locals.view = { engine: options.view }
    pkg.dependencies['http-errors'] = '^2.0.1'
    pkg.dependencies[view.pkg] = view.version
  } else {
    // Copy extra public files
    copyTemplate('js/index.html', path.join(dir, 'public/index.html'))
    app.locals.view = false
  }

  // Static files
  app.locals.uses.push("express.static(path.join(import.meta.dirname, 'public'))")

  if (options.git) {
    copyTemplate('js/gitignore', path.join(dir, '.gitignore'))
  }

  // sort dependencies like npm(1)
  pkg.dependencies = sortedObject(pkg.dependencies)
  pkg.devDependencies = sortedObject(pkg.devDependencies)

  if (!Object.keys(pkg.devDependencies).length) {
    delete pkg.devDependencies
  }

  // write files
  write(path.join(dir, 'app.js'), app.render())
  write(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
  mkdir(dir, 'bin')
  copyTemplate('js/www.js', path.join(dir, 'bin/www.js'), MODE_0755)

  const prompt = launchedFromCmd() ? '>' : '$'

  if (dir !== '.') {
    console.log()
    console.log('   change directory:')
    console.log('     %s cd %s', prompt, dir)
  }

  console.log()
  console.log('   install dependencies:')
  console.log('     %s npm install', prompt)
  console.log()
  console.log('   run the app:')
  console.log('     %s npm start', prompt)
  console.log()
  console.log('   run the app in development, restarting on change:')
  console.log('     %s npm run dev', prompt)
  console.log()

  done(0)
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
 * Graceful exit for async STDIO
 */

function exit (code) {
  // flush output for Node.js Windows pipe bug
  // https://github.com/joyent/node/issues/6247 is just one bug example
  // https://github.com/visionmedia/mocha/issues/333 has a good discussion
  function done () {
    if (!(draining--)) process.exit(code)
  }

  let draining = 0
  const streams = [process.stdout, process.stderr]

  streams.forEach((stream) => {
    // submit empty write request and wait for completion
    draining += 1
    stream.write('', done)
  })

  done()
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
  } else if (options.css === '') {
    usage()
    error('option `-c, --css <engine>\' argument missing')
    done(1)
  } else if (options.view === '') {
    usage()
    error('option `-v, --view <engine>\' argument missing')
    done(1)
  } else {
    // Path
    const destinationPath = options._[0] || '.'

    // App name
    const appName = createAppName(path.resolve(destinationPath)) || 'hello-world'

    // View engine
    if (options.view === true) {
      if (options.ejs) {
        options.view = 'ejs'
        warning("option `--ejs' has been renamed to `--view=ejs'")
      }

      if (options.hbs) {
        options.view = 'hbs'
        warning("option `--hbs' has been renamed to `--view=hbs'")
      }

      if (options.pug) {
        options.view = 'pug'
        warning("option `--pug' has been renamed to `--view=pug'")
      }
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

    if (options.css === 'compass') {
      warning("compass is no longer supported, using `--css=scss'")
      options.css = 'scss'
    }

    // Unsupported engines
    if (options.view && !VIEW_ENGINES[options.view]) {
      usage()
      error('unsupported view engine `' + options.view + "'")
      return done(1)
    }

    if (options.css !== true && !CSS_ENGINES[options.css]) {
      usage()
      error('unsupported stylesheet engine `' + options.css + "'")
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
 * Engine options default to `true` when not given and are `''` when given
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

  const options = { css: true, view: true, ...values, _: positionals, '!': [] }

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
  console.log('  Usage: express [options] [dir]')
  console.log('')
  console.log('  Options:')
  console.log('')
  console.log('    -e, --ejs            add ejs engine support')
  console.log('        --pug            add pug engine support')
  console.log('        --hbs            add handlebars engine support')
  console.log('    -v, --view <engine>  add view <engine> support (ejs|hbs|pug|twig) (defaults to pug)')
  console.log('        --no-view        use static html instead of view engine')
  console.log('    -c, --css <engine>   add stylesheet <engine> support (less|sass|scss|stylus) (defaults to plain css)')
  console.log('        --git            add .gitignore')
  console.log('    -f, --force          force on non-empty directory')
  console.log('    --version            output the version number')
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
