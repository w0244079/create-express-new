import assert from 'node:assert'
import fs from 'node:fs'
import { planApp } from '../lib/app.js'

const VERSIONS = JSON.parse(fs.readFileSync(new URL('../templates/versions.json', import.meta.url), 'utf8')).versions

describe('GitHub Actions CI', function () {
  const base = { view: 'pug', git: true, logger: 'morgan', pm: 'pnpm' }

  function plan (options = {}) {
    return planApp('my-app', { ...base, ...options, ci: true })
  }

  it('should be opt-in and leave the rest of the app unchanged', function () {
    const plain = planApp('my-app', base)
    const entries = plan()

    assert.ok(!plain.some((entry) => entry.path.startsWith('.github')))
    assert.deepStrictEqual(entries.filter((entry) => !entry.path.startsWith('.github')), plain)
    assert.ok(entries.some((entry) => entry.path === '.github/workflows/ci.yml' && entry.config))
  })

  for (const pm of ['pnpm', 'npm']) {
    for (const options of [{}, { ts: true }, { lint: true }, { ts: true, lint: true }, { sass: true }]) {
      it('should configure ' + pm + ' CI for ' + JSON.stringify(options), function () {
        const entries = plan({ ...options, pm })
        const workflow = entries.find((entry) => entry.path === '.github/workflows/ci.yml').contents

        assert.ok(workflow.includes('node-version: [22, 24, 26]'))
        assert.ok(workflow.includes('run: ' + (pm === 'pnpm' ? 'pnpm install --frozen-lockfile' : 'npm ci')))
        assert.ok(workflow.includes('run: ' + pm + ' run test:coverage'))
        assert.ok(workflow.includes('npm@' + VERSIONS.npm.replace(/^\^/, '')) === (pm === 'npm'))
        assert.ok(workflow.includes('version: ' + VERSIONS.pnpm.replace(/^\^/, '')) === (pm === 'pnpm'))
        assert.strictEqual(workflow.includes('run: ' + pm + ' run lint'), Boolean(options.lint))
        assert.strictEqual(workflow.includes('run: ' + pm + ' run typecheck'), Boolean(options.ts))
        assert.strictEqual(workflow.includes('run: ' + pm + ' run css'), Boolean(options.sass))
        assert.ok(!/<%/.test(workflow))
      })
    }
  }

  it('should share the GitHub directory with Dependabot', function () {
    const entries = plan({ dependabot: true })

    assert.deepStrictEqual(entries.filter((entry) => entry.path.startsWith('.github')).map((entry) => entry.path), [
      '.github',
      '.github/workflows',
      '.github/workflows/ci.yml',
      '.github/dependabot.yml'
    ])
  })
})
