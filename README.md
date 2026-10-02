# express-generator-modern

An application generator for [Express 5](https://expressjs.com/), creating web apps or JSON APIs
as ES modules, TypeScript or CommonJS that run on current Node.js with no build step.

[![NPM Version][npm-image]][npm-url]
[![CI][github-actions-ci-image]][github-actions-ci-url]

`express-generator-modern` is a fork of [`express-generator`](https://github.com/expressjs/generator),
the original Express application generator, reimagined for today's Express apps. It keeps the
familiar `express` command and project layout, and updates everything it generates for Express 5
and modern Node.js. It is not affiliated with or endorsed by the Express project.

## Quick Start

Run the generator with no arguments to be guided through the options (requires Node.js 22.9 or newer):

```bash
$ npx express-generator-modern
```

The wizard asks for the project directory, whether you are building a web app or a JSON API, the
view engine, the language (JavaScript, TypeScript or CommonJS), optional middleware, extras (a
Dockerfile and ESLint) and a `.gitignore`.
It then shows the equivalent command, so you can repeat the setup or use it in scripts, and offers to
run `npm install`.

Or pass the options directly:

```bash
$ npx express-generator-modern my-app
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
$ npm install -g express-generator-modern
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

API apps also get a `GET /health` endpoint that responds with `{ "status": "ok" }`, for load balancers
and container health checks. It is defined before the middleware, so it stays fast and out of the
request logs.

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

### Docker

`--docker` adds a `Dockerfile` and `.dockerignore` for a production image, and the `/health` endpoint.
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
image; set environment variables with your container platform instead.

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
        --docker         add a Dockerfile and a /health endpoint
        --lint           add ESLint and an npm run lint script
        --no-git         skip the .gitignore
    -f, --force          force on non-empty directory
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
- `--helmet`, `--compression`, `--cookies` and `--cors` options for opt-in middleware
- `--docker` for a production Dockerfile, and a `/health` endpoint for APIs and containers
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
- The confirmation prompt for non-empty directories only accepts y, yes, ok or true, and aborts
  when STDIN closes without an answer

### Removed

- The dust, hjs (Hogan.js), jade and vash view engines
- CSS preprocessor support (`--css` for less, stylus, compass and sass): apps use plain CSS, which now
  covers variables, nesting and more. See [Using Sass](#using-sass) to add it yourself.
- The `-e/--ejs`, `--hbs`, `--pug` and `-H/--hogan` aliases; use `--view=<engine>`
- cookie-parser from the default middleware; use `--cookies`
- The `debug` package and `DEBUG=...` start instructions; the server logs its port on start

### Migrating commands

| express-generator | express-generator-modern |
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

## License

[MIT](LICENSE). Originally created by TJ Holowaychuk and the Express contributors.

[npm-image]: https://img.shields.io/npm/v/express-generator-modern.svg
[npm-url]: https://www.npmjs.com/package/express-generator-modern
[github-actions-ci-image]: https://github.com/w0244079/generator/actions/workflows/ci.yml/badge.svg
[github-actions-ci-url]: https://github.com/w0244079/generator/actions/workflows/ci.yml
