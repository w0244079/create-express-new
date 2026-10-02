// Check the dependency versions used by generated apps against the npm registry.
//
//   npm run versions             report drift, exit 1 if anything is behind
//   npm run versions -- --update raise each version floor to the newest
//                                release within its current major
//
// New major versions are only reported, as they need a manual review of the
// generated templates before the range in templates/versions.json is changed.

import { exec } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const FILE = path.join(import.meta.dirname, '..', 'templates', 'versions.json')
const STABLE = /^(\d+)\.(\d+)\.(\d+)$/

const run = promisify(exec)
const update = process.argv.includes('--update')
const config = JSON.parse(fs.readFileSync(FILE, 'utf-8'))
const hold = config.hold || {}

const results = await Promise.all(Object.entries(config.versions).map(async ([name, range]) => {
  const { stdout } = await run(`npm view ${name} versions dist-tags.latest --json`)
  const info = JSON.parse(stdout)
  const floor = parse(range.replace(/^\^/, ''))
  const versions = info.versions.filter((v) => STABLE.test(v)).map(parse)

  // newest release that the caret range allows
  const best = versions
    .filter((v) => v[0] === floor[0] && (floor[0] > 0 || v[1] === floor[1]))
    .sort(compare)
    .pop()
  const latest = parse(info['dist-tags.latest'])

  return {
    name,
    range,
    best: best && '^' + best.join('.'),
    latest: latest.join('.'),
    behind: best && compare(best, floor) > 0,
    major: latest[0] > floor[0] && !hold[name],
    held: latest[0] > floor[0] && Boolean(hold[name])
  }
}))

let drift = false

for (const r of results) {
  let status = 'ok'

  if (r.behind) {
    status = update ? `updated to ${r.best}` : `behind, newest in range is ${r.best}`
    drift = drift || !update
    if (update) config.versions[r.name] = r.best
  }

  if (r.major) {
    status += `; new major ${r.latest} needs review`
    drift = true
  } else if (r.held) {
    status += `; held (${hold[r.name]}), latest is ${r.latest}`
  }

  console.log(`${r.name.padEnd(24)} ${r.range.padEnd(10)} ${status}`)
}

if (update) {
  fs.writeFileSync(FILE, JSON.stringify(config, null, 2) + '\n')
}

process.exitCode = drift ? 1 : 0

function compare (a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

function parse (version) {
  return version.split('.').map(Number)
}
