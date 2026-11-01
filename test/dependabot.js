import assert from 'node:assert'
import { planApp } from '../lib/app.js'

describe('Dependabot', function () {
  const base = { view: 'pug', git: true, logger: 'morgan', pm: 'pnpm' }
  const config = 'version: 2\n' +
    'updates:\n' +
    '  - package-ecosystem: npm\n' +
    '    directory: /\n' +
    '    schedule:\n' +
    '      interval: weekly\n' +
    '    groups:\n' +
    '      minor-and-patch:\n' +
    '        patterns: ["*"]\n' +
    '        update-types: ["minor", "patch"]\n'

  it('should be opt-in and leave the rest of the app unchanged', function () {
    const plain = planApp('my-app', base)
    const entries = planApp('my-app', { ...base, dependabot: true })
    assert.ok(!plain.some((entry) => entry.path.startsWith('.github')))
    assert.deepStrictEqual(entries.filter((entry) => !entry.path.startsWith('.github')), plain)
  })

  for (const pm of ['pnpm', 'npm']) {
    for (const language of [{}, { ts: true }, { cjs: true }]) {
      for (const kind of [{}, { view: false }, { api: true, view: false }, { api: true }]) {
        const options = { ...base, ...language, ...kind, pm, git: false, dependabot: true }
        it('should generate weekly grouped updates for ' + JSON.stringify(options), function () {
          const entries = planApp('my-app', options)
          const generated = entries.find((entry) => entry.path === '.github/dependabot.yml')
          assert.strictEqual(generated.contents, config)
          assert.strictEqual(generated.config, true)
          assert.ok(entries.some((entry) => entry.path === '.github' && entry.type === 'dir'))
          assert.deepStrictEqual(entries.filter((entry) => entry.path.startsWith('.github')).map((entry) => entry.path),
            ['.github', '.github/dependabot.yml'])
        })
      }
    }
  }
})
