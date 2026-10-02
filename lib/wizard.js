// Interactive wizard that asks for the same choices as the command line
// options and returns them in the same shape as the parsed options.

import fs from 'node:fs'
import path from 'node:path'
import { CancelError, confirm, multiselect, select, style, text } from './prompts.js'

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

  output.write('\n' + style.bold('  express-generator-modern') + style.dim('  create an Express 5 app') + '\n\n')

  // Project directory, confirming a directory that is not empty
  let dir
  let force = false

  while (!dir) {
    const answer = await text(io, {
      message: 'Project directory',
      initial: 'my-app',
      validate: (value) => value.trim() ? null : 'Enter a directory'
    })

    if (isEmpty(path.resolve(cwd, answer.trim()))) {
      dir = answer.trim()
    } else if (await confirm(io, { message: 'Directory is not empty. Continue anyway?', initial: false })) {
      dir = answer.trim()
      force = true
    }
  }

  const kind = await select(io, {
    message: 'What are you building?',
    choices: [
      { label: 'Web app', value: 'web', hint: 'server-rendered views' },
      { label: 'JSON API', value: 'api', hint: 'no views or static files' }
    ]
  })

  const view = kind === 'web'
    ? await select(io, { message: 'View engine', choices: VIEWS })
    : false

  const language = await select(io, {
    message: 'Language',
    choices: [
      { label: 'JavaScript', value: 'esm', hint: 'ES modules' },
      { label: 'TypeScript', value: 'ts', hint: 'runs directly on Node.js 22.18+' },
      { label: 'JavaScript (CommonJS)', value: 'cjs', hint: 'require() and module.exports' }
    ]
  })

  const middleware = await multiselect(io, {
    message: 'Optional middleware',
    choices: [
      { label: 'helmet', value: 'helmet', hint: 'security headers' },
      { label: 'compression', value: 'compression', hint: 'gzip/brotli responses' },
      { label: 'cookie-parser', value: 'cookies', hint: 'req.cookies' }
    ]
  })

  const git = await confirm(io, { message: 'Add a .gitignore?', initial: true })
  const install = await confirm(io, { message: 'Install dependencies now?', initial: true })

  const options = {
    _: [dir],
    '!': [],
    api: kind === 'api',
    cjs: language === 'cjs',
    compression: middleware.includes('compression'),
    cookies: middleware.includes('cookies'),
    force,
    git,
    helmet: middleware.includes('helmet'),
    install,
    ts: language === 'ts',
    view
  }

  output.write('\n  Equivalent command:\n  ' + style.cyan(toCommand(options)) + '\n\n')

  if (!await confirm(io, { message: 'Create the app?', initial: true })) {
    throw new CancelError()
  }

  return options
}

/**
 * The command line that generates the same app as the given options.
 *
 * @param {object} options
 */

export function toCommand (options) {
  const args = ['npx', 'express-generator-modern', quote(options._[0])]

  if (options.api) args.push('--api')
  else if (options.view === false) args.push('--no-view')
  else if (options.view !== 'pug') args.push('--view=' + options.view)

  if (options.ts) args.push('--ts')
  if (options.cjs) args.push('--cjs')
  if (options.helmet) args.push('--helmet')
  if (options.compression) args.push('--compression')
  if (options.cookies) args.push('--cookies')
  if (options.git) args.push('--git')
  if (options.force) args.push('--force')

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
