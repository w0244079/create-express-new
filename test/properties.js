import assert from 'node:assert'
import fc from 'fast-check'
import validateNpmName from 'validate-npm-package-name'
import { createAppName, mergeLines } from '../lib/app.js'

// property-based tests: each property is checked against generated inputs,
// and a failure reports the smallest input that breaks it

describe('properties', function () {
  describe('createAppName', function () {
    it('should create a name npm accepts from any path', function () {
      fc.assert(fc.property(fc.string({ unit: 'binary' }), function (pathName) {
        const name = createAppName(pathName)
        const { errors = [] } = validateNpmName(name)

        // an empty name is replaced with a default by the caller
        assert.ok(name === '' || errors.length === 0, JSON.stringify(name) + ': ' + errors.join(', '))
      }))
    })

    it('should keep a name it created', function () {
      fc.assert(fc.property(fc.string({ unit: 'binary' }), function (pathName) {
        const name = createAppName(pathName)

        assert.strictEqual(createAppName(name), name)
      }))
    })
  })

  describe('mergeLines', function () {
    const anyEol = fc.constantFrom('\n', '\r\n')
    const anyLine = fc.oneof(
      fc.constantFrom('', '# comment', 'node_modules/', '.env', '*.log', '  dist/  '),
      fc.string().filter((str) => !/[\r\n]/.test(str))
    )
    const anyFile = fc.tuple(fc.array(anyLine), anyEol, fc.boolean())
      .map(([lines, eol, end]) => lines.join(eol) + (end && lines.length ? eol : ''))
    const anyGenerated = fc.array(anyLine).map((lines) => lines.join('\n') + '\n')

    it('should keep the existing contents', function () {
      fc.assert(fc.property(anyFile, anyGenerated, function (existing, generated) {
        assert.ok(mergeLines(existing, generated).startsWith(existing))
      }))
    })

    it('should have every generated line afterwards', function () {
      fc.assert(fc.property(anyFile, anyGenerated, function (existing, generated) {
        const merged = mergeLines(existing, generated).split(/\r?\n/).map((str) => str.trim())

        for (const line of generated.split('\n').map((str) => str.trim())) {
          if (line && !line.startsWith('#')) assert.ok(merged.includes(line), JSON.stringify(line) + ' is missing')
        }
      }))
    })

    it('should add each missing line once', function () {
      fc.assert(fc.property(anyFile, anyGenerated, function (existing, generated) {
        const added = mergeLines(existing, generated).slice(existing.length).split(/\r?\n/).filter(Boolean)

        assert.strictEqual(new Set(added).size, added.length)
      }))
    })

    it('should add nothing when merged again', function () {
      fc.assert(fc.property(anyFile, anyGenerated, function (existing, generated) {
        const merged = mergeLines(existing, generated)

        assert.strictEqual(mergeLines(merged, generated), merged)
      }))
    })

    it('should keep the line endings of the existing contents', function () {
      fc.assert(fc.property(anyFile, anyGenerated, function (existing, generated) {
        const merged = mergeLines(existing, generated)

        if (existing.includes('\r\n')) assert.ok(!/[^\r]\n/.test(merged) && !merged.startsWith('\n'))
        else assert.ok(!merged.includes('\r\n'))
      }))
    })
  })
})
