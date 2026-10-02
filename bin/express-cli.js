#!/usr/bin/env node

var ejs = require('ejs')
var fs = require('fs')
var minimatch = require('minimatch')
var mkdirp = require('mkdirp')
var parseArgs = require('minimist')
var path = require('path')
var readline = require('readline')
var sortedObject = require('sorted-object')
var util = require('util')

var MODE_0666 = parseInt('0666', 8)
var MODE_0755 = parseInt('0755', 8)
var TEMPLATE_DIR = path.join(__dirname, '..', 'templates')
var VERSION = require('../package').version

// supported stylesheet engines, compiled by the generated app's "build:css"
// script and recompiled on change by its "dev:css" script
var CSS_ENGINES = {
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
var VIEW_ENGINES = {
  ejs: { pkg: 'ejs', version: '^6.0.1' },
  hbs: { pkg: 'hbs', version: '^4.3.1' },
  pug: { pkg: 'pug', version: '^3.0.4' },
  twig: { pkg: 'twig', version: '^3.0.0' }
}

// parse args
var unknown = []
var args = parseArgs(process.argv.slice(2), {
  alias: {
    c: 'css',
    e: 'ejs',
    f: 'force',
    h: 'help',
    v: 'view'
  },
  boolean: ['ejs', 'force', 'git', 'hbs', 'help', 'pug', 'version'],
  default: { css: true, view: true },
  string: ['css', 'view'],
  unknown: function (s) {
    if (s.charAt(0) === '-') {
      unknown.push(s)
    }
  }
})

args['!'] = unknown

// run
main(args, exit)

/**
 * Prompt for confirmation on STDOUT/STDIN
 */

function confirm (msg, callback) {
  var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  })

  rl.question(msg, function (input) {
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
 * Copy multiple files from template directory.
 */

function copyTemplateMulti (fromDir, toDir, nameGlob) {
  fs.readdirSync(path.join(TEMPLATE_DIR, fromDir))
    .filter(minimatch.filter(nameGlob, { matchBase: true }))
    .forEach(function (name) {
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
  var pkg = {
    name: name,
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
  var app = loadTemplate('js/app.js')

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
  var css = CSS_ENGINES[options.css]

  if (css) {
    // compile stylesheets before the app starts
    copyTemplateMulti('css', dir + '/public/stylesheets', '*.' + css.ext)
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
    copyTemplateMulti('css', dir + '/public/stylesheets', '*.css')

    // restart the app on change
    pkg.scripts.dev = 'node --watch ./bin/www.js'
  }

  // copy route templates
  mkdir(dir, 'routes')
  copyTemplateMulti('js/routes', dir + '/routes', '*.js')

  // Index router mount
  app.locals.localModules.indexRouter = './routes/index.js'
  app.locals.mounts.push({ path: '/', code: 'indexRouter' })

  // User router mount
  app.locals.localModules.usersRouter = './routes/users.js'
  app.locals.mounts.push({ path: '/users', code: 'usersRouter' })

  // Template support
  if (options.view) {
    var view = VIEW_ENGINES[options.view]

    // Copy view templates
    mkdir(dir, 'views')
    copyTemplateMulti('views', dir + '/views', '*.' + options.view)

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

  var prompt = launchedFromCmd() ? '>' : '$'

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
  fs.readdir(dir, function (err, files) {
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
  message.split('\n').forEach(function (line) {
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

  var draining = 0
  var streams = [process.stdout, process.stderr]

  exit.exited = true

  streams.forEach(function (stream) {
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
  var contents = fs.readFileSync(path.join(__dirname, '..', 'templates', (name + '.ejs')), 'utf-8')
  var locals = Object.create(null)

  function render () {
    return ejs.render(contents, locals, {
      escape: util.inspect
    })
  }

  return {
    locals: locals,
    render: render
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
  } else if (args.help) {
    usage()
    done(0)
  } else if (args.version) {
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
    var destinationPath = options._[0] || '.'

    // App name
    var appName = createAppName(path.resolve(destinationPath)) || 'hello-world'

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
    emptyDirectory(destinationPath, function (empty) {
      if (empty || options.force) {
        createApplication(appName, destinationPath, options, done)
      } else {
        confirm('destination is not empty, continue? [y/N] ', function (ok) {
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
  var loc = path.join(base, dir)

  console.log('   \x1b[36mcreate\x1b[0m : ' + loc + path.sep)
  mkdirp.sync(loc, MODE_0755)
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
  message.split('\n').forEach(function (line) {
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
