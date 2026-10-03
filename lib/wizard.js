// Interactive wizard that asks for the same choices as the command line
// options and returns them in the same shape as the parsed options. Esc (or
// the left arrow) goes back to the previous question, keeping the answers.

import fs from 'node:fs'
import path from 'node:path'
import { checkDestination, createAppName, planApp } from './app.js'
import { BACK, CancelError, confirm, erase, hinted, multiselect, rows, select, style, text } from './prompts.js'

// existing files listed before asking about them
const MAX_LISTED = 5

const VIEWS = [
  { label: 'pug', value: 'pug', hint: 'default' },
  { label: 'ejs', value: 'ejs' },
  { label: 'hbs', value: 'hbs', hint: 'Handlebars' },
  { label: 'twig', value: 'twig' },
  { label: 'none', value: false, hint: 'static HTML' }
]

/**
 * Walk through the options and return them, or throw CancelError.
 *
 * @param {object} io { input, output, cwd }
 */

export async function wizard (io) {
  const { output, cwd = process.cwd() } = io
  const answers = {}

  // the destination checked against the answers, before asking about it
  let check = null

  output.write('\n' + hinted(style.bold('  create-express-new'), ' create an Express 5 app', output.columns || Infinity) + '\n\n')

  // Each step asks one question, starting from its previous answer, and
  // keeps the text it prints so going back can erase it.
  const steps = [
    {
      name: 'directory',
      ask: (step) => askDirectory(io, step, answers.directory, cwd)
    },
    {
      name: 'kind',
      ask: (step) => step.ask(select, {
        message: 'What are you building?',
        initial: answers.kind,
        choices: [
          { label: 'Web app', value: 'web', hint: 'server-rendered views' },
          { label: 'JSON API', value: 'api', hint: 'no views or static files' }
        ]
      })
    },
    {
      name: 'view',
      when: () => answers.kind === 'web',
      ask: (step) => step.ask(select, { message: 'View engine', initial: answers.view, choices: VIEWS })
    },
    {
      name: 'language',
      ask: (step) => step.ask(select, {
        message: 'Language',
        initial: answers.language,
        choices: [
          { label: 'JavaScript', value: 'esm', hint: 'ES modules' },
          { label: 'TypeScript', value: 'ts', hint: 'runs directly on Node.js 22.18+' },
          { label: 'JavaScript (CommonJS)', value: 'cjs', hint: 'require() and module.exports' }
        ]
      })
    },
    {
      name: 'middleware',
      ask: (step) => step.ask(multiselect, {
        message: 'Optional middleware',
        initial: answers.middleware,
        choices: [
          { label: 'helmet', value: 'helmet', hint: 'security headers' },
          { label: 'compression', value: 'compression', hint: 'gzip/brotli responses' },
          { label: 'cookie-parser', value: 'cookies', hint: 'req.cookies' },
          { label: 'cors', value: 'cors', hint: 'cross-origin requests' }
        ]
      })
    },
    {
      name: 'extras',
      ask: (step) => step.ask(multiselect, {
        message: 'Extras',
        initial: answers.extras,
        choices: [
          { label: 'Dockerfile', value: 'docker', hint: 'production image with a /health check' },
          { label: 'ESLint', value: 'lint', hint: 'npm run lint' }
        ]
      })
    },
    {
      name: 'git',
      ask: (step) => step.ask(confirm, { message: 'Add a .gitignore?', initial: answers.git ?? true })
    },
    {
      name: 'install',
      ask: (step) => step.ask(confirm, { message: 'Install dependencies now?', initial: answers.install ?? true })
    },
    {
      name: 'existing',
      when: () => {
        check = checkApp(answers, cwd)

        // forget a choice about existing files that are no longer generated
        if (!check.blockers.length && !check.conflicts.length) delete answers.existing
        return check.blockers.length > 0 || check.conflicts.length > 0
      },
      ask: (step) => askExisting(step, check, answers.existing)
    },
    {
      name: 'create',
      ask: async (step) => {
        step.say('\n  Equivalent command:\n  ' + style.cyan(toCommand(toOptions(answers))) + '\n')

        const create = await step.ask(confirm, { message: 'Create the app?', initial: true })
        if (create === false) throw new CancelError()
        return create
      }
    }
  ]

  // completed steps, with the text each printed
  const history = []
  let index = 0

  while (index < steps.length) {
    const { name, ask, when } = steps[index]

    if (when && !when()) {
      index++
      continue
    }

    const step = {
      back: history.length > 0,
      printed: [],
      // ask a question, keeping its answer
      async ask (fn, options) {
        const value = await fn(io, { ...options, back: this.back })
        if (value !== BACK) this.printed.push(io.printed)
        return value
      },
      // print text, keeping it
      say (str) {
        output.write(str + '\n')
        this.printed.push(str)
      }
    }

    const value = await ask(step)

    if (value === BACK) {
      // erase what this step printed, and the previous answer, and ask again
      const previous = history.pop()
      eraseText(io, [...previous.printed, ...step.printed])
      index = previous.index
      continue
    }

    answers[name] = value
    history.push({ index, printed: step.printed })
    index++
  }

  return toOptions(answers)
}

/**
 * Ask for the project directory, confirming a directory that is not empty.
 */

async function askDirectory (io, step, previous, cwd) {
  let value = previous ? previous.dir : ''

  for (;;) {
    const answer = await step.ask(text, {
      message: 'Project directory',
      hint: '(. for the current directory)',
      initial: 'my-app',
      value,
      validate: (str) => str.trim() ? null : 'Enter a directory'
    })

    if (answer === BACK) return BACK

    const dir = answer.trim()

    const resolved = path.resolve(cwd, dir)

    if (isEmpty(resolved)) {
      return { dir, force: false }
    }

    const name = resolved === path.resolve(cwd) ? 'The current directory' : 'Directory'
    const force = await confirm(io, { message: name + ' is not empty. Continue anyway?', initial: false, back: true })

    if (force === true) {
      step.printed.push(io.printed)
      return { dir, force: true }
    }

    // ask for the directory again, in place: empty after declining it, or
    // starting from it after going back
    eraseText(io, force === BACK ? step.printed : [...step.printed, io.printed])
    step.printed = []
    value = force === BACK ? dir : ''
  }
}

/**
 * Ask what to do with the existing files the app would overwrite, or show
 * what is in the way of creating it, leaving only going back or cancelling.
 */

async function askExisting (step, { blockers, conflicts }, previous) {
  if (blockers.length) {
    step.say('\n' + blockers.map((blocker) => style.red('  ' + blocker)).join('\n'))

    await step.ask(select, {
      message: 'Cannot create the app here',
      choices: [{ label: 'Cancel', value: 'cancel' }]
    })

    throw new CancelError()
  }

  const shown = conflicts.slice(0, MAX_LISTED).map((entry) => '    ' + entry.path)
  if (conflicts.length > MAX_LISTED) shown.push('    and ' + (conflicts.length - MAX_LISTED) + ' more')
  step.say('\n  These existing files will be overwritten:\n' + style.dim(shown.join('\n')))

  const config = conflicts.filter((entry) => entry.config)
  const choices = [{ label: 'Overwrite them', value: 'overwrite' }]

  if (config.length === conflicts.length) {
    choices.push({ label: 'Keep them', value: 'keep' })
  } else if (config.length) {
    choices.push({ label: 'Keep my config files', value: 'keep', hint: config.map((entry) => entry.path).join(', ') })
  }

  choices.push({ label: 'Cancel', value: 'cancel' })

  const answer = await step.ask(select, { message: 'Existing files', initial: previous, choices })
  if (answer === 'cancel') throw new CancelError()
  return answer
}

/**
 * Check the project directory against the app the answers create.
 */

function checkApp (answers, cwd) {
  const options = toOptions(answers)
  const dir = path.resolve(cwd, options._[0])

  return checkDestination(dir, planApp(createAppName(dir) || 'hello-world', options))
}

/**
 * Erase printed text, counting its rows at the current terminal width, as
 * the terminal may have been resized since it was printed.
 */

function eraseText (io, printed) {
  if (printed.length) erase(io, rows(printed.join('\n'), io.output.columns || Infinity))
}

/**
 * Options in the shape of the parsed command line options.
 */

function toOptions (answers) {
  const { directory, kind, language, middleware = [], extras = [] } = answers

  return {
    _: [directory.dir],
    '!': [],
    api: kind === 'api',
    cjs: language === 'cjs',
    compression: middleware.includes('compression'),
    cookies: middleware.includes('cookies'),
    cors: middleware.includes('cors'),
    docker: extras.includes('docker'),
    force: directory.force,
    git: answers.git,
    helmet: middleware.includes('helmet'),
    install: answers.install,
    keepConfig: answers.existing === 'keep',
    lint: extras.includes('lint'),
    ts: language === 'ts',
    view: kind === 'web' ? answers.view : false
  }
}

/**
 * The command line that generates the same app as the given options.
 *
 * @param {object} options
 */

export function toCommand (options) {
  const args = ['npm', 'create', 'express-new@latest', quote(options._[0])]
  const flags = []

  if (options.api) flags.push('--api')
  else if (options.view === false) flags.push('--no-view')
  else if (options.view !== 'pug') flags.push('--view=' + options.view)

  if (options.ts) flags.push('--ts')
  if (options.cjs) flags.push('--cjs')
  if (options.helmet) flags.push('--helmet')
  if (options.compression) flags.push('--compression')
  if (options.cookies) flags.push('--cookies')
  if (options.cors) flags.push('--cors')
  if (options.docker) flags.push('--docker')
  if (options.lint) flags.push('--lint')
  if (!options.git) flags.push('--no-git')
  if (options.force) flags.push('--force')
  if (options.keepConfig) flags.push('--keep-config')

  // npm create keeps the options before `--` for itself
  if (flags.length) args.push('--', ...flags)

  return args.join(' ')
}

/**
 * Check if a directory is missing or empty.
 */

function isEmpty (dir) {
  try {
    return fs.readdirSync(dir).length === 0
  } catch (err) {
    if (err.code === 'ENOENT') return true
    if (err.code === 'ENOTDIR') return false
    throw err
  }
}

/**
 * Quote a shell argument when needed.
 */

function quote (arg) {
  return /^[\w./@:-]+$/.test(arg) ? arg : JSON.stringify(arg)
}
