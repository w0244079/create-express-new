# create-express-new

An application generator for [Express 5](https://expressjs.com/), creating web apps or JSON APIs
as ES modules, TypeScript or CommonJS that run on current Node.js with no build step.

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][npm-url]
[![Node.js Version][node-image]][npm-url]
[![License][license-image]](LICENSE)
[![CI][github-actions-ci-image]][github-actions-ci-url]
[![OpenSSF Scorecard][scorecard-image]][scorecard-url]

`create-express-new` is a fork of [`express-generator`](https://github.com/expressjs/generator),
the original Express application generator, reimagined for today's Express apps. It keeps the
familiar `express` command and project layout, and updates everything it generates for Express 5
and modern Node.js. It is not affiliated with or endorsed by the Express project.

## Quick Start

Run the generator with no arguments to be guided through the options (requires Node.js 22.9 or newer):

```bash
$ npm create express-new@latest
```

The wizard asks for the project directory (enter `.` for the current directory), whether you are
building a web app or a JSON API, the view engine, the language (JavaScript, TypeScript or CommonJS),
optional middleware (and CSRF protection, with sessions), the request logger, extras (a Dockerfile and
ESLint) and a `.gitignore`.
Press Esc (or ←) to go back to the previous question; your earlier answers are kept. It then shows the
equivalent command, so you can repeat the setup or use it in scripts, and offers to run `npm install`.

When the directory already has files the app would replace, the wizard lists them and asks whether
to overwrite them, keep your config files (see `--keep-config` below) or cancel. Files whose contents
are already the same are left alone. An existing `.gitignore` is never replaced: the lines it is
missing are added at the end. If a file is where the app needs a folder (or a folder where it needs
a file), nothing is written. Files from an earlier app in another language or view engine, such as
an `app.js` next to a new `app.ts`, are left in place with a warning listing them.

Or pass the directory and options directly. `npm create` passes the options after `--` on to the
generator (`npx create-express-new my-app --ts --helmet` works too, without the `--`):

```bash
$ npm create express-new@latest my-app -- --ts --helmet
$ cd my-app
$ npm install
```

Start it at `http://localhost:3000/`:

```bash
$ npm run dev    # restarts on change
$ npm start      # without restarting
```

Run its tests, written with the built-in [`node:test`](https://nodejs.org/api/test.html) runner:

```bash
$ npm test
```

You can also install the generator globally, which provides the `express` command:

```bash
$ npm install -g create-express-new
$ express --view=ejs --helmet my-app
```

The original `express-generator` provides an `express` command too, so install only one of them globally.

## What You Get

```
my-app
├── .env.example      # example environment variables; copy to .env
├── .gitignore        # ignores node_modules, .env files, logs and coverage
├── app.js            # the Express app: middleware, views, routes, error handling
├── bin/www.js        # starts the server, with graceful shutdown on SIGINT/SIGTERM
├── package.json      # "type": "module", start/dev/test scripts
├── public/           # static files, including stylesheets/style.css
├── routes/           # index.js and users.js routers
├── test/app.test.js  # node:test tests for the app
└── views/            # error, index and layout templates (pug by default)
```

Every app has a `GET /health` endpoint that responds with `{ "status": "ok" }`, for load balancers,
container health checks and uptime monitors. It is defined before the middleware, so it stays fast and
out of the request logs.

### JSON APIs

`--api` generates a JSON API instead of a web app: no views, static files or form parsing, and
routes that respond with JSON.

```
my-api
├── app.js            # JSON body parsing, routes, JSON 404 and error handling
├── bin/www.js
├── package.json
├── routes/           # index.js and users.js, responding with JSON
└── test/app.test.js
```

Errors are always JSON, such as `{ "error": "Not Found" }`. Client errors (4xx) include their message;
server errors (5xx) only say `Internal Server Error` in production, so internal details are never sent.
In development, every error includes its message and stack trace. Express runs in development mode
unless `NODE_ENV` is set, so set `NODE_ENV=production` when you deploy.

`--api` works with `--cjs`, `--ts` and the optional middleware, but not with `--view`.

### Module formats

- **ES modules** (default): `import`/`export`, `import.meta.dirname` and `node:` built-ins.
- **CommonJS** (`--cjs`): the same app with `require()`/`module.exports`.
- **TypeScript** (`--ts`): `.ts` files that Node.js 22.18+ runs directly by
  [stripping types](https://nodejs.org/api/typescript.html#type-stripping), so there is no build step.
  Includes a strict `tsconfig.json`, the `@types` packages the app needs and an `npm run typecheck`
  script that runs `tsc`. `--ts` cannot be combined with `--cjs`.

### Configuration

`npm start` and `npm run dev` load environment variables from a `.env` file when one exists, using
Node.js's built-in [`--env-file-if-exists`](https://nodejs.org/api/cli.html#--env-file-if-existsfile),
so no `dotenv` package is needed. Start from the generated example:

```bash
$ cp .env.example .env
```

Variables already set in the environment take precedence over `.env`, so your hosting platform's
settings always win. `npm run dev` restarts when `.env` changes. Keep `.env` out of version control;
the generated `.gitignore` already ignores it, and every other `.env.*` file except `.env.example`.

### Optional middleware

By default, generated apps include only request logging, body parsing and static files (no static
files with `--api`). Add more with:

- `--helmet`: [helmet](https://helmetjs.github.io/) security headers
- `--compression`: gzip/brotli response [compression](https://github.com/expressjs/compression)
- `--cookies`: [cookie-parser](https://github.com/expressjs/cookie-parser), for reading `req.cookies`
- `--cors`: [cors](https://github.com/expressjs/cors), allowing requests from other origins. Any origin is
  allowed by default; set `CORS_ORIGIN` (see `.env.example`) to a comma-separated list of origins to
  allow only your front ends.
- `--rate-limit`: [express-rate-limit](https://express-rate-limit.mintlify.app/), limiting each client
  to 100 requests every 15 minutes, with `RateLimit` headers and `429 Too Many Requests` responses
  past the limit. Change the limit with `RATE_LIMIT_MAX` and `RATE_LIMIT_WINDOW_MS`. It comes after the
  static files, so only app routes count, and `/health` is never limited.
- `--session` (web apps only): [express-session](https://github.com/expressjs/session), for
  `req.session`. Set `SESSION_SECRET` to a long random string; the app refuses to start in production
  without one. The session cookie is `SameSite=Lax`, and `Secure` over HTTPS. Sessions are kept in
  memory, which loses them on restart and does not suit more than one process, so add a
  [store](https://github.com/expressjs/session#compatible-session-stores) such as `connect-redis`
  before going to production.
- `--csrf` (with `--session` and a view engine): [csrf-sync](https://github.com/Psifi-Solutions/csrf-sync)
  CSRF protection, set up in `csrf.js`. Requests other than `GET`, `HEAD` and `OPTIONS` need the
  session's token, or get `403 Forbidden`. Views get it as `csrfToken`, and the page layout has it in a
  `<meta name="csrf-token">` tag. An example form at `/users/new` shows it in use, with a
  `POST /users/new` that checks the name and redirects back. Send the token in a hidden `_csrf` form
  field:

  ```pug
  form(method='post', action='/users/new')
    input(type='hidden', name='_csrf', value=csrfToken)
  ```

  or, from JavaScript, in an `x-csrf-token` header:

  ```js
  const token = document.querySelector('meta[name="csrf-token"]').content;
  await fetch('/users/new', { method: 'POST', headers: { 'x-csrf-token': token }, body: new URLSearchParams({ name: 'Ada' }) });
  ```

- `--uploads`: [multer](https://github.com/expressjs/multer) and a `POST /uploads` route that takes one
  file in a `file` field, with a form at `GET /uploads` in apps with views (JSON APIs and `--no-view`
  apps respond with the saved file's details as JSON instead). See [File uploads](#file-uploads).

`--rate-limit` and `--session` also make the app trust the `X-Forwarded-*` headers of the proxies set
in `TRUST_PROXY`, the number of proxies (such as `1` behind one load balancer) or their addresses.
Behind a proxy, set it so the rate limit counts each client rather than the proxy, and session
cookies are `Secure` when the proxy terminates HTTPS. Leave it unset otherwise, as clients could
then fake their address.

### File uploads

`--uploads` adds multer to the `/uploads` route only, rather than to every route, so no other route
accepts files. Its `routes/uploads.js`:

- saves files in `uploads/` under random names, never the name the client sent, and does not serve
  them as static files, where an uploaded HTML or SVG file could run scripts on your site. Both
  `.gitignore` and `.dockerignore` ignore the folder.
- accepts one file of up to 5 MB (set `UPLOAD_MAX_SIZE` in bytes to change it), responding with
  `413` for larger files and `400` for other upload errors.
- accepts only PDF, GIF, JPEG, PNG, WebP and plain text files, responding with `415` for others. Edit
  `TYPES` to change the list. The type is the one the client sends, so check a file's contents too
  before trusting it.

With `--csrf`, the CSRF check for the whole app skips `/uploads`, as multer reads the form, including
its `_csrf` field, only inside the route. The route checks the token itself as soon as the file
arrives, before saving anything, so the `_csrf` field must come before the file in the form, as it
does in the generated one. JavaScript can send the token in an `x-csrf-token` header instead.

With `--docker`, the image has an `uploads` folder the app can write to. Files saved in a container are
lost when it is replaced, so mount a volume at `/app/uploads`, or store files somewhere else, such as
object storage, in production.

### Request logging

Requests are logged with [morgan](https://github.com/expressjs/morgan) by default, one readable line
per request. `--logger=pino` uses [pino-http](https://github.com/pinojs/pino-http) instead, which logs
JSON for log collectors and adds `req.log` for your own logs. `npm run dev` pipes them through
[pino-pretty](https://github.com/pinojs/pino-pretty) to keep them readable. Either way, requests are
not logged while the tests run.

### Docker

`--docker` adds a `Dockerfile` and `.dockerignore` for a production image.
Install dependencies first, as the image is built with `npm ci` from `package-lock.json`:

```bash
$ npm install
$ docker build -t my-app .
$ docker run -p 3000:3000 my-app
```

The image is based on `node:22-slim`, the latest release of the minimum supported Node.js version, and
installs only production dependencies. It runs the app as the
unprivileged `node` user with `NODE_ENV=production`, checks `/health` with a `HEALTHCHECK`, and runs
`node` directly so it receives `SIGTERM` and shuts down gracefully. `.env` files are not copied into the
image; set environment variables with your container platform instead. With `--session`, the app needs
`SESSION_SECRET` to start, such as `docker run -e SESSION_SECRET=... -p 3000:3000 my-app`.

### Linting

`--lint` adds [ESLint](https://eslint.org/) with its recommended rules and an `npm run lint` script. With
`--ts` it also adds [typescript-eslint](https://typescript-eslint.io/); as typescript-eslint does not
support TypeScript 7 yet, these apps use TypeScript 6.

## Command Line Options

    -v, --view <engine>  add view <engine> support (ejs|hbs|pug|twig) (defaults to pug)
        --no-view        use static html instead of view engine
        --api            generate a JSON API, without views or static files
        --cjs            generate CommonJS modules instead of ES modules
        --ts             generate TypeScript, run directly by Node.js
        --helmet         add helmet middleware for security headers
        --compression    add compression middleware for gzip/brotli responses
        --cookies        add cookie-parser middleware
        --cors           add cors middleware for cross-origin requests
        --rate-limit     add express-rate-limit to limit requests per client
        --session        add express-session for sessions (not with --api)
        --csrf           add CSRF protection for forms (needs --session)
        --uploads        add multer and an upload route at /uploads
        --logger <name>  request logger (morgan|pino) (defaults to morgan)
        --docker         add a Dockerfile for a production image
        --lint           add ESLint and an npm run lint script
        --no-git         skip the .gitignore
    -f, --force          force on non-empty directory
        --keep-config    keep existing config files (.env.example, Dockerfile,
                         .dockerignore, tsconfig.json, eslint.config.*)
        --version        output the version number
    -h, --help           output usage information

## Changes From express-generator

This fork started from `express-generator` 4.16.1.

### Added

- ES module output by default, plus `--cjs` for CommonJS and `--ts` for TypeScript
- `--api` for JSON APIs, with JSON 404 and error responses that hide server error details in production
- `.env` loading in `npm start` and `npm run dev`, with a generated `.env.example`
- An interactive wizard when run without arguments in a terminal, which shows the equivalent command
- A `.gitignore` for every app (skip it with `--no-git`), rewritten for current Node.js projects
- Request logs are skipped while the generated tests run, keeping `npm test` output readable
- `--helmet`, `--compression`, `--cookies`, `--cors`, `--rate-limit`, `--session` and `--csrf` options
  for opt-in middleware, `--uploads` for file uploads with multer, and `--logger=pino` for JSON request
  logs
- `--docker` for a production Dockerfile with a `HEALTHCHECK`
- A `GET /health` endpoint for load balancers, container health checks and uptime monitors
- `--lint` for ESLint, including typescript-eslint for TypeScript apps
- An `npm run dev` script using `node --watch`
- A generated test suite using `node:test` and `fetch`, run with `npm test`
- Graceful shutdown on SIGINT and SIGTERM in `bin/www.js`
- Clear errors for unknown view engines and conflicting options
- `--view=jade` now warns and generates pug, jade's successor

### Changed

- Generates Express 5 apps (was Express 4.17) with current versions of every dependency,
  including ejs 6, hbs 4, pug 3 and twig 3
- The default view engine is pug (was jade)
- `bin/www` is now `bin/www.js`, a short script built on `app.listen()`
- Generated apps require Node.js 22.9 or newer (22.18 for TypeScript)
- The generator itself is an ES module with a single dependency (ejs), down from five
- Running without arguments in a terminal starts the wizard instead of generating into the current
  directory; pass `.` to generate into the current directory
- The confirmation prompt for non-empty directories lists the files that would be overwritten,
  only accepts y, yes, ok or true, and aborts when STDIN closes without an answer
- Generating into a non-empty directory leaves identical files alone and adds missing lines to an
  existing `.gitignore` instead of replacing it; `--keep-config` keeps existing config files

### Removed

- The dust, hjs (Hogan.js), jade and vash view engines
- CSS preprocessor support (`--css` for less, stylus, compass and sass): apps use plain CSS, which now
  covers variables, nesting and more. See [Using Sass](#using-sass) to add it yourself.
- The `-e/--ejs`, `--hbs`, `--pug` and `-H/--hogan` aliases; use `--view=<engine>`
- cookie-parser from the default middleware; use `--cookies`
- The `debug` package and `DEBUG=...` start instructions; the server logs its port on start

### Migrating commands

| express-generator | create-express-new |
| --- | --- |
| `express --ejs` | `express --view=ejs` |
| `express --hbs` | `express --view=hbs` |
| `express --pug` | `express --view=pug` |
| `express --hogan`, `--view=hjs` | not supported; `--view=hbs` (Handlebars) is the closest alternative |
| `express --css=sass` | plain CSS, or add Sass as shown below |
| `DEBUG=my-app:* npm start` | `npm start` or `npm run dev` |

## Using Sass

To use [Sass](https://sass-lang.com/) in a generated app, install it and compile your stylesheets
before the app starts:

```bash
$ npm install --save-dev sass
$ mv public/stylesheets/style.css public/stylesheets/style.scss
$ npm pkg set scripts.build:css="sass public/stylesheets:public/stylesheets" scripts.prestart="npm run build:css"
```

Run `npx sass --watch public/stylesheets:public/stylesheets` alongside `npm run dev` to recompile on change.

## Contributing

```bash
$ npm install
$ npm test       # generates, installs and runs apps for each option
$ npm run lint
```

### Maintaining generated dependency versions

The versions of the packages that generated apps depend on live in
[`templates/versions.json`](templates/versions.json). Dependabot does not cover them, so check them with:

```bash
$ npm run versions              # report versions that are behind, or have a new major
$ npm run versions -- --update  # raise each version to the newest release in its major
```

New major versions are reported but never applied automatically; review the templates before changing the range.
Packages listed under `hold` are intentionally kept on an older major. A hold with an `until` condition,
such as TypeScript 6 for `--ts --lint`, is reported as ready to lift once the named package's latest release
supports the newer version, for example when typescript-eslint supports TypeScript 7. The `versions`
workflow runs the check monthly.

### Releasing

Releases are published to npm by the `publish` workflow when a GitHub release is published, using
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is needed.

1. Move the `Unreleased` entries in [`CHANGELOG.md`](CHANGELOG.md) under the new version and date
2. Bump the version without tagging yet: `npm version <major|minor|patch> --no-git-tag-version`
3. Commit both, then tag and push: `git tag vX.Y.Z && git push origin HEAD vX.Y.Z`
4. Publish a GitHub release for the tag, with the changelog entry as its notes:
   `gh release create vX.Y.Z --title vX.Y.Z --notes-file <file>`

The workflow checks that the tag matches `package.json`, then runs lint and the tests before
publishing.

## License

[MIT](LICENSE). Originally created by TJ Holowaychuk and the Express contributors.

[npm-image]: https://img.shields.io/npm/v/create-express-new.svg
[npm-url]: https://www.npmjs.com/package/create-express-new
[downloads-image]: https://img.shields.io/npm/dm/create-express-new.svg
[node-image]: https://img.shields.io/node/v/create-express-new.svg
[license-image]: https://img.shields.io/npm/l/create-express-new.svg
[github-actions-ci-image]: https://github.com/w0244079/create-express-new/actions/workflows/ci.yml/badge.svg
[github-actions-ci-url]: https://github.com/w0244079/create-express-new/actions/workflows/ci.yml
[scorecard-image]: https://api.scorecard.dev/projects/github.com/w0244079/create-express-new/badge
[scorecard-url]: https://scorecard.dev/viewer/?uri=github.com/w0244079/create-express-new
