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
$ pnpm create express-new@latest
```

`npm create express-new@latest` starts the same wizard. It asks for:

- the project directory (`.` for the current directory)
- a web app or a JSON API, and the view engine
- the language: JavaScript, TypeScript or CommonJS
- optional middleware, and CSRF protection with sessions
- the request logger
- extras: a Dockerfile and ESLint
- a `.gitignore`
- the [package manager](#package-manager) the app requires: pnpm, or npm

Esc (or ←) goes back a question, keeping your answers. At the end the wizard shows the equivalent
command, to repeat the setup or use in scripts, and offers to install the dependencies.

In a directory that already has files:

- Files the app would replace are listed, and the wizard asks whether to overwrite them, keep your
  config files (see `--keep-config` below) or cancel.
- Files with the same contents are left alone.
- An existing `.gitignore` is never replaced; the lines it is missing are added at the end.
- A file where the app needs a folder, or a folder where it needs a file, stops anything being written.
- Files from an earlier app with other options, such as an `app.js` next to a new `app.ts`, are left
  in place and listed in a warning.

Or pass the directory and options directly:

```bash
$ pnpm create express-new@latest my-app --ts --helmet
$ cd my-app
$ pnpm install
```

With `npm create`, put the options after `--`: `npm create express-new@latest my-app -- --ts --helmet`.
`npx create-express-new my-app --ts --helmet` needs no `--`. Either way the app requires pnpm unless
you add `--pm=npm`.

Start it at `http://localhost:3000/`, and run its tests, written with the built-in
[`node:test`](https://nodejs.org/api/test.html) runner:

```bash
$ pnpm dev      # restarts on change
$ pnpm start    # without restarting
$ pnpm test
```

An app generated with `--pm=npm` uses `npm install`, `npm run dev`, `npm start` and `npm test`.

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

Server errors (5xx) are logged with `console.error`; client errors (4xx), such as a 404, are not.
Errors render with the `error` view, or as plain text with `--no-view`. Client errors show their
message. Server errors only say `Internal Server Error` outside development, so internal details are
never sent; development shows every error's message and stack.

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

Errors are always JSON, such as `{ "error": "Not Found" }`, and follow the same rules as web apps:
client errors include their message, server errors only say `Internal Server Error` in production,
and development adds the stack trace. Express runs in development mode unless `NODE_ENV` is set, so
set `NODE_ENV=production` when you deploy.

`--api` works with `--cjs`, `--ts` and the optional middleware, but not with `--view`.

### Module formats

- **ES modules** (default): `import`/`export`, `import.meta.dirname` and `node:` built-ins.
- **CommonJS** (`--cjs`): the same app with `require()`/`module.exports`.
- **TypeScript** (`--ts`): `.ts` files that Node.js 22.18+ runs directly by
  [stripping types](https://nodejs.org/api/typescript.html#type-stripping), so there is no build step.
  Includes a strict `tsconfig.json`, the `@types` packages the app needs and a `typecheck`
  script that runs `tsc`. `--ts` cannot be combined with `--cjs`.

### Configuration

The `start` and `dev` scripts load environment variables from a `.env` file when one exists, using
Node.js's built-in [`--env-file-if-exists`](https://nodejs.org/api/cli.html#--env-file-if-existsfile),
so no `dotenv` package is needed. Start from the generated example:

```bash
$ cp .env.example .env
```

Variables already set in the environment take precedence over `.env`, so your hosting platform's
settings always win. The `dev` script restarts when `.env` changes. The generated `.gitignore` keeps
`.env`, and every other `.env.*` file except `.env.example`, out of version control.

### Optional middleware

By default, generated apps include only request logging, body parsing and static files (no static
files with `--api`). Add more with:

- `--helmet`: [helmet](https://helmetjs.github.io/) security headers
- `--compression`: gzip/brotli response [compression](https://github.com/expressjs/compression)
- `--cookies`: [cookie-parser](https://github.com/expressjs/cookie-parser), for reading `req.cookies`
- `--cors`: [cors](https://github.com/expressjs/cors), allowing requests from other origins
- `--rate-limit`: [express-rate-limit](https://express-rate-limit.mintlify.app/), limiting each client
  to 100 requests every 15 minutes
- `--session` (web apps only): [express-session](https://github.com/expressjs/session), for `req.session`
- `--csrf` (with `--session` and a view engine): [csrf-sync](https://github.com/Psifi-Solutions/csrf-sync)
  CSRF protection for forms
- `--uploads`: [multer](https://github.com/expressjs/multer) and a `POST /uploads` route that takes one
  file of up to 5 MB

[Optional middleware](docs/middleware.md) covers each one's settings and environment variables,
sending the CSRF token from forms and JavaScript, running behind a proxy, and how
[uploaded files](docs/middleware.md#file-uploads) are stored and checked.

### Request logging

Requests are logged with [morgan](https://github.com/expressjs/morgan) by default, one readable line
per request. `--logger=pino` uses [pino-http](https://github.com/pinojs/pino-http) instead, which logs
JSON for log collectors and adds `req.log` for your own logs. The `dev` script pipes them through
[pino-pretty](https://github.com/pinojs/pino-pretty) to keep them readable. Either way, requests are
not logged while the tests run.

### Package manager

Every app requires one package manager, pnpm by default or npm with `--pm=npm`, so other package
managers refuse to install the app or run its scripts. It also has settings that protect installs
from compromised packages: new releases wait 3 days before they are installed, and the install
scripts of dependencies are not run. An npm app needs npm 12 or newer, which does not come with
Node.js 22 or 24.

[Package manager](docs/package-manager.md) compares the pnpm and npm settings, and covers allowing
a dependency's install script, installing a release sooner and changing package manager later.

### Docker

`--docker` adds a `Dockerfile` and `.dockerignore` for a production image. Install dependencies
first, as the image installs from the lockfile:

```bash
$ pnpm install
$ docker build -t my-app .
$ docker run -p 3000:3000 my-app
```

The image:

- is based on `node:22-slim`, the latest release of the minimum supported Node.js version
- installs only production dependencies, in a build stage of their own, so the package manager is
  not in the final image
- runs the app as the unprivileged `node` user with `NODE_ENV=production`
- checks `/health` with a `HEALTHCHECK`
- runs `node` directly, so it receives `SIGTERM` and shuts down gracefully
- does not copy `.env` files; set environment variables with your container platform instead. With
  `--session`, the app needs `SESSION_SECRET` to start, such as
  `docker run -e SESSION_SECRET=... -p 3000:3000 my-app`

### Linting

`--lint` adds [ESLint](https://eslint.org/) with its recommended rules and a `lint` script. With
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
        --lint           add ESLint and a lint script
        --pm <name>      package manager the app requires (pnpm|npm) (defaults to pnpm)
        --no-git         skip the .gitignore
    -f, --force          force on non-empty directory
        --keep-config    keep existing config files (.env.example, Dockerfile,
                         .dockerignore, tsconfig.json, eslint.config.*,
                         pnpm-workspace.yaml, .npmrc)
        --version        output the version number
    -h, --help           output usage information

## Changes From express-generator

This fork started from `express-generator` 4.16.1. It generates Express 5 apps as ES modules, with
pug in place of jade, for Node.js 22.9 or newer. `--view=<engine>` replaces the `--ejs`, `--hbs` and
`--pug` aliases, and apps use plain CSS instead of a CSS preprocessor.

- [Changes from express-generator](docs/changes-from-express-generator.md): everything added,
  changed and removed, and a table for migrating commands
- [Using Sass](docs/sass.md): adding Sass to a generated app

## Contributing

```bash
$ npm install
$ npm test       # generates, installs and runs apps for each option
$ npm run lint
```

The tests install the generated apps with pnpm, so [install pnpm](https://pnpm.io/installation)
first. The tests that install an npm app are skipped unless your npm is version 12 or newer.

See [Maintaining](docs/maintaining.md) for keeping the dependency versions of generated apps current,
and for releasing.

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
