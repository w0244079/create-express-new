import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WARNINGS_REGEXP = /[\r\n]((?:\x20{2}warning: [^\r\n]+\r?\n)+)\r?\n/g

export function childEnvironment () {
  const env = Object.create(null)

  // copy the environment except for npm veriables
  for (const key in process.env) {
    if (key.slice(0, 4) !== 'npm_') {
      env[key] = process.env[key]
    }
  }

  return env
}

export function parseCreatedFiles (output, dir) {
  const files = []
  const lines = output.split(/[\r\n]+/)
  let match

  for (let i = 0; i < lines.length; i++) {
    if ((match = /create.*?: (.*)$/.exec(lines[i]))) {
      let file = match[1]

      if (dir) {
        file = path.resolve(dir, file)
        file = path.relative(dir, file)
      }

      file = file.replace(/\\/g, '/')
      files.push(file)
    }
  }

  return files
}

export function parseWarnings (str) {
  let match = null
  const warnings = []

  WARNINGS_REGEXP.lastIndex = 0
  while ((match = WARNINGS_REGEXP.exec(str))) {
    warnings.push(match[1].split(/\r?\n/).slice(0, -1).map((line) => {
      return line.slice(11)
    }).join('\n'))
  }

  return warnings
}

export function stripAnsi (str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
}

export function stripColors (str) {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[(\d+)m/g, '_color_$1_')
}

export function stripWarnings (str) {
  return str.replace(WARNINGS_REGEXP, '')
}

export function tmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'express-generator-'))
}
