# Changes from express-generator

This fork started from `express-generator` 4.16.1.

## Added

- ES module output by default, plus `--cjs` for CommonJS and `--ts` for TypeScript
- `--api` for JSON APIs, with JSON 404 and error responses that hide server error details in production
- `.env` loading in the `start` and `dev` scripts, with a generated `.env.example`
- An interactive wizard when run without arguments in a terminal, which shows the equivalent command
- A `.gitignore` for every app (skip it with `--no-git`), rewritten for current Node.js projects
- Request logs are skipped while the generated tests run, keeping the test output readable
- `--helmet`, `--compression`, `--cookies`, `--cors`, `--rate-limit`, `--session` and `--csrf` options
  for opt-in middleware, `--uploads` for file uploads with multer, and `--logger=pino` for JSON request
  logs
- `--docker` for a production Dockerfile with a `HEALTHCHECK`
- A `GET /health` endpoint for load balancers, container health checks and uptime monitors
- `--lint` for ESLint, including typescript-eslint for TypeScript apps
- A `dev` script using `node --watch`
- A generated test suite using `node:test` and `fetch`, run by the `test` script
- A required package manager for every app, pnpm by default or npm with `--pm=npm`, with settings
  that delay new releases and do not run the install scripts of dependencies
- Graceful shutdown on SIGINT and SIGTERM in `bin/www.js`
- Clear errors for unknown view engines and conflicting options
- `--view=jade` now warns and generates pug, jade's successor

## Changed

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

## Removed

- The dust, hjs (Hogan.js), jade and vash view engines
- CSS preprocessor support (`--css` for less, stylus, compass and sass): apps use plain CSS, which now
  covers variables, nesting and more. See [Using Sass](sass.md) to add it yourself.
- The `-e/--ejs`, `--hbs`, `--pug` and `-H/--hogan` aliases; use `--view=<engine>`
- cookie-parser from the default middleware; use `--cookies`
- The `debug` package and `DEBUG=...` start instructions; the server logs its port on start

## Migrating commands

| express-generator | create-express-new |
| --- | --- |
| `express --ejs` | `express --view=ejs` |
| `express --hbs` | `express --view=hbs` |
| `express --pug` | `express --view=pug` |
| `express --hogan`, `--view=hjs` | not supported; `--view=hbs` (Handlebars) is the closest alternative |
| `express --css=sass` | plain CSS, or add Sass as shown in [Using Sass](sass.md) |
| `DEBUG=my-app:* npm start` | `pnpm start` or `pnpm dev` |
