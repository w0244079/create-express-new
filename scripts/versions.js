// Check the dependency versions used by generated apps against the npm registry.
//
//   npm run versions             report drift, exit 1 if anything is behind
//   npm run versions -- --update raise each version floor to the newest
//                                release within its current major
//
// New major versions are only reported, as they need a manual review of the
// generated templates before the range in templates/versions.json is changed.
// An entry named `<package>@<major>` pins that package to that major.
//
// Entries under `hold` are kept on an older major, with a reason. A hold with
// an `until` condition is reported as ready to lift once the latest release
// of `until.package` has a `until.peer` peer dependency range that includes
// `until.supports`.

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
  // `typescript@6` checks typescript within major 6
  const pkg = name.replace(/(.)@\d+$/, '$1')
  const { stdout } = await run(`npm view ${pkg} versions dist-tags.latest --json`)
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
    status += `; held (${reason(hold[r.name])}), latest is ${r.latest}`
  }

  console.log(`${r.name.padEnd(24)} ${r.range.padEnd(10)} ${status}`)
}

// holds that can be lifted
for (const [name, entry] of Object.entries(hold)) {
  if (!entry.until) continue

  const { package: pkg, peer, supports } = entry.until
  const { stdout } = await run(`npm view ${pkg} version peerDependencies --json`)
  const info = JSON.parse(stdout)
  const range = (info.peerDependencies || {})[peer] || ''

  if (range && satisfies(supports, range)) {
    console.log(`${name.padEnd(24)} hold can be lifted: ${pkg} ${info.version} supports ${peer} ${supports} ("${range}")`)
    drift = true
  }
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

function reason (entry) {
  return typeof entry === 'string' ? entry : entry.reason
}

// Check a version against an npm range such as ">=4.8.4 <6.1.0 || ^7.0.0".
// Supports comparators, carets, tildes, x-ranges and ||, which covers the
// peer dependency ranges used in practice.
function satisfies (version, range) {
  const v = parse(version)

  return range.split('||').some((part) => part.trim().split(/\s+/).every((comparator) => {
    const match = /^(>=|<=|>|<|=|\^|~)?v?(\d+|x|\*)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?$/.exec(comparator)
    if (!match) return comparator === '*' || comparator === ''

    const [, op = '', ...parts] = match
    const wild = parts.findIndex((p) => p === undefined || p === 'x' || p === '*')
    const base = parts.map((p) => (p === undefined || p === 'x' || p === '*') ? 0 : Number(p))

    // x-ranges and partial versions: 7, 7.x, 7.1.x
    if (wild !== -1 && (op === '' || op === '=')) {
      if (wild === 0) return true
      const upper = base.slice()
      upper[wild - 1] += 1
      return compare(v, base) >= 0 && compare(v, upper.map((n, i) => i < wild ? n : 0)) < 0
    }

    if (op === '^') {
      const i = base[0] > 0 ? 0 : base[1] > 0 ? 1 : 2
      const upper = base.map((n, j) => j < i ? n : j === i ? n + 1 : 0)
      return compare(v, base) >= 0 && compare(v, upper) < 0
    }

    if (op === '~') {
      const upper = [base[0], base[1] + 1, 0]
      return compare(v, base) >= 0 && compare(v, upper) < 0
    }

    const diff = compare(v, base)
    return { '>=': diff >= 0, '<=': diff <= 0, '>': diff > 0, '<': diff < 0, '=': diff === 0, '': diff === 0 }[op]
  }))
}
