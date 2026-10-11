# Changelog

All notable changes to this project are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project follows
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.4.0] - 2026-10-11

### Added

- A sample users page in apps with a view engine: `GET /users` renders a `users` view listing two
  sample users, in place of the text `respond with a resource`, and the home page links to it and
  names the view to edit

### Changed

- A web app with a JSON API (`--api` with a view engine) has its API routers in a `routes/api` folder,
  apart from the routers of the pages: `routes/api/index.js`, mounted at `/api`, and
  `routes/api/users.js` for `/api/users`, instead of one `routes/api.js`. The URLs are the same.
  Creating the app again in the folder of an older one reports `routes/api.js` as no longer used

## [1.3.0] - 2026-10-11

### Added

- `--sass` adds Sass to a web app: a `style.scss` compiled to the CSS the app serves by a `css`
  script that runs before `start` and `dev`, a `css:watch` script, and a stage in the `--docker`
  image that compiles the stylesheets. The wizard offers it under Extras
- Issue templates for bug reports and feature requests

## [1.2.0] - 2026-10-11

### Added

- `--api` with a view engine, such as `--api --view=pug`, generates a web app with a JSON API: a
  `routes/api.js` router at `/api`, and JSON responses for every error under `/api`. The wizard offers
  it as "Web app with a JSON API"
- `--cors-scope` and `--csrf-scope`, for a web app with a JSON API, choose whether other origins can
  call only the API (default) or the whole app, and whether the API needs the CSRF token (default) or
  only the pages do; the wizard asks both

### Changed

- `--api` with `--view` is no longer an error, and `--session` and `--csrf` can be used with them

## [1.1.0] - 2026-10-10

### Added

- `--install` installs the dependencies after creating the app, with the app's package manager, as
  the wizard already offered; the wizard's equivalent command includes it

### Changed

- Generated apps use newer versions of `eslint`, `globals` and `@types/node`, and generated
  Dockerfiles install newer versions of pnpm and npm

## [1.0.0] - 2026-10-10

The first release of `create-express-new`, a fork of
[`express-generator`](https://github.com/expressjs/generator) 4.16.1 reimagined for Express 5 and
current Node.js. See [Changes from express-generator](docs/changes-from-express-generator.md) for
the full list and a table for migrating commands.

### Added

- `npm create express-new@latest`, with an interactive wizard when run without arguments in a
  terminal; Esc goes back, and it shows the equivalent command and offers to install the dependencies
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
- `--rate-limit` adds express-rate-limit, limiting each client to 100 requests every 15 minutes
  (`RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS`), after static files and never on `/health`
- `--session` adds express-session for web apps, with `SameSite=Lax` cookies that are `Secure` over
  HTTPS, and refuses to start in production without `SESSION_SECRET`
- `--csrf` adds csrf-sync CSRF protection to apps with `--session` and a view engine, with the token
  in views as `csrfToken` and in a `csrf-token` meta tag in the page layout
- `--uploads` adds multer and a `POST /uploads` route for web apps and JSON APIs, saving one file of
  up to 5 MB (`UPLOAD_MAX_SIZE`) of an allowed type in an ignored `uploads/` folder, with an upload
  form in apps with views; with `--csrf` it checks the token before saving the file, and with
  `--docker` the image has a writable `uploads` folder
- With `--csrf`, an example form at `/users/new` and CSRF setup in its own `csrf.js`
- `--logger=pino` logs requests as JSON with pino-http instead of morgan, pretty printed by the
  `dev` script
- `TRUST_PROXY` sets the proxies the app trusts, for apps with `--rate-limit` or `--session`
- The wizard offers express-rate-limit and express-session (for web apps) with the other middleware,
  asks about CSRF protection when sessions are chosen, and asks which request logger to use
- `--keep-config` keeps existing config files (`.env.example`, `Dockerfile`, `.dockerignore`,
  `tsconfig.json`, `eslint.config.*`) when generating into a non-empty directory
- The wizard lists the existing files an app would overwrite and asks whether to overwrite them,
  keep the config files or cancel
- The wizard's directory prompt hints that `.` is the current directory
- `--pm` sets the package manager an app requires, `pnpm` (the default) or `npm`, as
  `devEngines.packageManager` in `package.json`, so other package managers refuse to install the
  app or run its scripts
- Settings that protect installs from compromised packages in every app: `pnpm-workspace.yaml` for
  pnpm apps (new releases wait 3 days, install scripts of dependencies are not run, dependencies of
  dependencies cannot come from git or URLs, releases with weaker proof of origin than earlier ones
  are refused, and the pnpm version recorded in `pnpm-lock.yaml` is the one that runs) and `.npmrc`
  for npm apps (new releases wait 3 days; npm 12 does not run install scripts or allow git
  dependencies by default); `--keep-config` keeps existing ones
- The wizard asks which package manager the app requires and installs dependencies with it
- `npm run versions` reports a version floor released under 3 days ago as too new for generated apps
  to install, and `--update` lowers it; floors are only raised to releases at least 7 days old

### Changed

- Generates Express 5 apps with current versions of every dependency; apps require Node.js 22.9 or
  newer (22.18 for TypeScript)
- The default view engine is pug (was jade); `--view=jade` warns and generates pug
- `bin/www` is now `bin/www.js`, a short script built on `app.listen()`
- cookie-parser is no longer included by default; use `--cookies`
- The generator is an ES module with a single dependency (ejs)
- Apps require pnpm 11 or newer by default, and `npm install` is refused in them; pass
  `--pm=npm` for an app that requires npm, which now has to be npm 12 or newer
- The usage, next steps, `.env.example` and the wizard's equivalent command name the app's package
  manager, such as `pnpm create express-new@latest my-app --ts` and `pnpm dev`
- `--docker` images install dependencies with the app's package manager, at a fixed version, in a
  build stage of their own, so the package manager is not in the final image
- Every app's error handler logs server errors (5xx) with `console.error`, which no error handler
  did before, so a 500 only showed as a status in the request log
- An existing `.gitignore` gets the missing lines added instead of being replaced
- Existing files with the same contents are left alone, logged as `identical`
- The command line lists the files it would overwrite before asking to continue in a non-empty
  directory
- A warning lists existing files the new app does not use but other options generate (code in the
  other language, the other ESLint config, other view engines' templates, pnpm settings in an npm
  app); they are not removed

### Fixed

- Error pages show the status code in every environment, not only in development, and have a title
- `error.ejs` is a full HTML page with the stylesheet, like the other engines' error pages
- twig layouts escape the page title, which error pages set to the error message
- Web apps with views no longer show server errors' messages outside development, only
  `Internal Server Error`, as JSON APIs already did
- `--no-view` apps have their own error handler, responding with plain text and logging only server
  errors, instead of Express's default handler logging the stack of every error, including client
  errors such as invalid JSON
- twig error pages escape the error message and stack, as twig.js does not escape output by default
- An overwritten or identical `bin/www` is made executable, as writing an existing file kept its mode
- A file where the app needs a folder (or a folder where it needs a file) is reported before
  anything is written, instead of failing with a partly generated app
- The wizard reports a package manager that is not installed once, with where to get it, instead of
  printing the failure and next steps twice

### Removed

- The dust, hjs (Hogan.js), jade and vash view engines
- CSS preprocessor support (`--css`); apps use plain CSS
- The `-e/--ejs`, `--hbs`, `--pug` and `-H/--hogan` aliases; use `--view=<engine>`
- The `debug` package and `DEBUG=...` start instructions

[Unreleased]: https://github.com/w0244079/create-express-new/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/w0244079/create-express-new/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/w0244079/create-express-new/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/w0244079/create-express-new/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/w0244079/create-express-new/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/w0244079/create-express-new/releases/tag/v1.0.0
