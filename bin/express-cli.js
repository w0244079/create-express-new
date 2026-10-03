#!/usr/bin/env node

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import readline from 'node:readline'
import util from 'node:util'
import { DEFAULT_PACKAGE_MANAGER, LOGGERS, PACKAGE_MANAGERS, VIEW_ENGINES, checkDestination, createAppName, mergeLines, planApp, scriptCommand } from '../lib/app.js'
import { CancelError } from '../lib/prompts.js'
import { wizard } from '../lib/wizard.js'

const MODE_0755 = 0o755
const VERSION = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'package.json'), 'utf-8')).version

// command line options
const OPTIONS = {
  api: { type: 'boolean' },
  cjs: { type: 'boolean' },
  compression: { type: 'boolean' },
  cookies: { type: 'boolean' },
  cors: { type: 'boolean' },
  csrf: { type: 'boolean' },
  docker: { type: 'boolean' },
  force: { type: 'boolean', short: 'f' },
  git: { type: 'boolean' },
  helmet: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
  'keep-config': { type: 'boolean' },
  lint: { type: 'boolean' },
  logger: { type: 'string' },
  'no-git': { type: 'boolean' },
  'no-view': { type: 'boolean' },
  pm: { type: 'string' },
  'rate-limit': { type: 'boolean' },
  session: { type: 'boolean' },
  ts: { type: 'boolean' },
  uploads: { type: 'boolean' },
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
 * Create application at the given directory, from its plan. Existing files
 * with other contents are overwritten, except config files with
 * `--keep-config`, and an existing .gitignore gets the missing lines.
 * Leftover files from other options are left in place, with a warning.
 *
 * @param {string} dir
 * @param {object[]} entries
 * @param {string[]} leftovers
 * @param {object} options
 * @param {function} done
 */

function createApplication (dir, entries, leftovers, options, done) {
  console.log()

  for (const entry of entries) {
    const file = path.join(dir, entry.path)

    if (entry.type === 'dir') {
      if (entry.path !== '.' || dir !== '.') mkdir(file)
      continue
    }

    const existing = read(file)

    if (existing === null) {
      write(file, entry.contents, entry.mode)
    } else if (existing === entry.contents) {
      log('identical', file)
      executable(file, entry.mode)
    } else if (entry.merge) {
      const merged = mergeLines(existing, entry.contents)
      if (merged === existing) log('keep', file)
      else write(file, merged, entry.mode, 'update')
    } else if (entry.config && options.keepConfig) {
      log('keep', file)
    } else {
      write(file, entry.contents, entry.mode, 'overwrite')
      executable(file, entry.mode)
    }
  }

  if (leftovers.length) {
    warning('these existing files are not used by the new app, so they were left as they are:\n' +
      leftovers.map((file) => '  ' + path.join(dir, file)).join('\n') + '\n' +
      'remove them if they are from an earlier app with other options')
  }

  // dependencies installed by the wizard print next steps afterwards
  if (!options.install) {
    printNextSteps(dir, options.pm, true)
  }

  done(0)
}

/**
 * Install the generated app's dependencies with its package manager, when
 * the wizard asked to.
 *
 * @param {object} options
 * @param {number} code
 */

function installDependencies (options, code) {
  if (code !== 0 || !options.install) return exit(code)

  const dir = options._[0]
  const pm = options.pm

  console.log('   installing dependencies...')
  console.log()

  const child = spawn(pm, ['install'], {
    cwd: dir,
    shell: process.platform === 'win32',
    stdio: 'inherit'
  })

  // a package manager that cannot be started fails with an error, then closes
  let failed = false

  child.on('error', (err) => {
    failed = true
    error(err.code === 'ENOENT'
      ? pm + ' is not installed, see ' + PACKAGE_MANAGERS[pm].docs
      : pm + ' install failed: ' + err.message)
    printNextSteps(dir, pm, true)
    exit(1)
  })

  child.on('close', (status) => {
    if (failed) return
    if (status !== 0) error(pm + ' install failed')
    printNextSteps(dir, pm, status !== 0)
    exit(status === 0 ? 0 : 1)
  })
}

/**
 * Display the commands to run the generated app.
 *
 * @param {string} dir
 * @param {string} pm the app's package manager
 * @param {boolean} install include the install step
 */

function printNextSteps (dir, pm, install) {
  const prompt = launchedFromCmd() ? '>' : '$'

  if (dir !== '.') {
    console.log()
    console.log('   change directory:')
    console.log('     %s cd %s', prompt, dir)
  }

  if (install) {
    console.log()
    console.log('   install dependencies:')
    console.log('     %s %s install', prompt, pm)
  }

  console.log()
  console.log('   run the app:')
  console.log('     %s %s', prompt, scriptCommand(pm, 'start'))
  console.log()
  console.log('   run the app in development, restarting on change:')
  console.log('     %s %s', prompt, scriptCommand(pm, 'dev'))
  console.log()
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
  } else if (options.logger === '') {
    usage()
    error('option `--logger <name>\' argument missing')
    done(1)
  } else if (options.pm === '') {
    usage()
    error('option `--pm <name>\' argument missing')
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

    // Unsupported loggers
    if (!LOGGERS.includes(options.logger)) {
      usage()
      error('unsupported logger `' + options.logger + "'")
      return done(1)
    }

    // Unsupported package managers
    if (!Object.hasOwn(PACKAGE_MANAGERS, options.pm)) {
      usage()
      error('unsupported package manager `' + options.pm + "'")
      return done(1)
    }

    // Sessions are for web apps, and CSRF protection needs them and views
    if (options.session && options.api) {
      usage()
      error('option `--session\' cannot be used with `--api\'')
      return done(1)
    }

    if (options.csrf && !options.session) {
      usage()
      error('option `--csrf\' requires `--session\'')
      return done(1)
    }

    if (options.csrf && !options.view) {
      usage()
      error('option `--csrf\' needs a view engine, so cannot be used with `--no-view\'')
      return done(1)
    }

    // Check the destination before writing anything
    const entries = planApp(appName, options)
    const { blockers, conflicts, leftovers } = checkDestination(destinationPath, entries)

    if (blockers.length) {
      error('cannot create the app:\n' + blockers.join('\n'))
      return done(1)
    }

    const overwrites = conflicts.filter((entry) => !(entry.config && options.keepConfig))

    // Generate application
    emptyDirectory(destinationPath, (empty) => {
      if (empty || options.force) {
        createApplication(destinationPath, entries, leftovers, options, done)
      } else {
        if (overwrites.length) {
          console.log()
          console.log('   these existing files will be overwritten:')
          for (const entry of overwrites) console.log('     ' + path.join(destinationPath, entry.path))
          console.log()
        }

        confirm('destination is not empty, continue? [y/N] ', (ok) => {
          if (ok) {
            process.stdin.destroy()
            createApplication(destinationPath, entries, leftovers, options, done)
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
 * Create a directory, with its parents.
 *
 * @param {string} dir
 */

function mkdir (dir) {
  log('create', dir + path.sep)
  fs.mkdirSync(dir, { recursive: true, mode: MODE_0755 })
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
  options.keepConfig = Boolean(options['keep-config'])
  options.rateLimit = Boolean(options['rate-limit'])
  options.logger ??= 'morgan'
  options.pm ??= DEFAULT_PACKAGE_MANAGER

  return options
}

/**
 * Display the usage.
 */

function usage () {
  console.log('')
  console.log('  Usage: pnpm create express-new@latest [dir] [options]')
  console.log('         npm create express-new@latest [dir] -- [options]')
  console.log('         npx create-express-new [options] [dir]')
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
  console.log('        --rate-limit     add express-rate-limit to limit requests per client')
  console.log('        --session        add express-session for sessions (not with --api)')
  console.log('        --csrf           add CSRF protection for forms (needs --session)')
  console.log('        --uploads        add multer and an upload route at /uploads')
  console.log('        --logger <name>  request logger (morgan|pino) (defaults to morgan)')
  console.log('        --docker         add a Dockerfile for a production image')
  console.log('        --lint           add ESLint and a lint script')
  console.log('        --pm <name>      package manager the app requires (pnpm|npm) (defaults to pnpm)')
  console.log('        --no-git         skip the .gitignore')
  console.log('    -f, --force          force on non-empty directory')
  console.log('        --keep-config    keep existing config files (.env.example, Dockerfile,')
  console.log('                         .dockerignore, tsconfig.json, eslint.config.*,')
  console.log('                         pnpm-workspace.yaml, .npmrc)')
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
 * Make an existing file executable when its planned mode is, as writing it
 * only sets the mode of new files. Adds execute where read is allowed.
 *
 * @param {string} file
 * @param {number} mode
 */

function executable (file, mode) {
  if (!(mode & 0o111)) return

  const current = fs.statSync(file).mode & 0o777
  const wanted = current | ((current & 0o444) >> 2)

  if (wanted !== current) fs.chmodSync(file, wanted)
}

/**
 * Log what happened to a file.
 *
 * @param {string} action
 * @param {string} file
 */

function log (action, file) {
  const color = action === 'overwrite' ? '33' : action === 'create' || action === 'update' ? '36' : '2'
  console.log('   \x1b[' + color + 'm' + action + '\x1b[0m : ' + file)
}

/**
 * Read a file, or null when it does not exist.
 *
 * @param {string} file
 */

function read (file) {
  try {
    return fs.readFileSync(file, 'utf-8')
  } catch (err) {
    if (err.code === 'ENOENT') return null
    throw err
  }
}

/**
 * echo str > file, logging it as `action`.
 *
 * @param {String} file
 * @param {String} str
 * @param {number} mode
 * @param {string} action
 */

function write (file, str, mode, action = 'create') {
  fs.writeFileSync(file, str, { mode })
  log(action, file)
}
