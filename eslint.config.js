import neostandard from 'neostandard'

export default [
  ...neostandard({
    ignores: ['coverage/**', 'temp/**', 'templates/**']
  }),
  {
    rules: {
      'no-param-reassign': 'error',
      'no-shadow': 'error'
    }
  },
  {
    files: ['test/**'],
    languageOptions: {
      globals: {
        after: 'readonly',
        before: 'readonly',
        describe: 'readonly',
        it: 'readonly'
      }
    }
  }
]
