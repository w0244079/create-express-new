# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `--keep-config` keeps existing config files (`.env.example`, `Dockerfile`, `.dockerignore`,
  `tsconfig.json`, `eslint.config.*`) when generating into a non-empty directory
- The wizard lists the existing files an app would overwrite and asks whether to overwrite them,
  keep the config files or cancel
- The wizard's directory prompt hints that `.` is the current directory

### Changed

- An existing `.gitignore` gets the missing lines added instead of being replaced
- Existing files with the same contents are left alone, logged as `identical`
- The command line lists the files it would overwrite before asking to continue in a non-empty
  directory

### Fixed

- A file where the app needs a folder (or a folder where it needs a file) is reported before
  anything is written, instead of failing with a partly generated app

## [1.0.0] - 2026-10-02

The first release of `create-express-new`, a fork of
[`express-generator`](https://github.com/expressjs/generator) 4.16.1 reimagined for Express 5 and
current Node.js. See [Changes From express-generator](README.md#changes-from-express-generator) for
the full list and a table for migrating commands.

### Added

- `npm create express-new@latest`, with an interactive wizard when run without arguments in a
  terminal; Esc goes back, and it shows the equivalent command and offers to run `npm install`
- ES module output by default, `--cjs` for CommonJS and `--ts` for TypeScript, run directly by
  Node.js with no build step
- `--api` for JSON APIs, with JSON 404 and error responses that hide server error details in
  production
- `--helmet`, `--compression`, `--cookies` and `--cors` for opt-in middleware
- `--docker` for a production Dockerfile running as the `node` user, with a `HEALTHCHECK`
- `--lint` for ESLint, including typescript-eslint for TypeScript apps
- A `GET /health` endpoint, `.env` loading with a generated `.env.example`, an `npm run dev` script
  using `node --watch`, and a `node:test` test suite in every app
- Graceful shutdown on SIGINT and SIGTERM, and a modern `.gitignore` (skip it with `--no-git`)

### Changed

- Generates Express 5 apps with current versions of every dependency; apps require Node.js 22.9 or
  newer (22.18 for TypeScript)
- The default view engine is pug (was jade); `--view=jade` warns and generates pug
- `bin/www` is now `bin/www.js`, a short script built on `app.listen()`
- cookie-parser is no longer included by default; use `--cookies`
- The generator is an ES module with a single dependency (ejs)

### Removed

- The dust, hjs (Hogan.js), jade and vash view engines
- CSS preprocessor support (`--css`); apps use plain CSS
- The `-e/--ejs`, `--hbs`, `--pug` and `-H/--hogan` aliases; use `--view=<engine>`
- The `debug` package and `DEBUG=...` start instructions

[Unreleased]: https://github.com/w0244079/create-express-new/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/w0244079/create-express-new/releases/tag/v1.0.0
