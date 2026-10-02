[![Express Logo](https://i.cloudup.com/zfY6lL7eFa-3000x3000.png)](http://expressjs.com/)

[Express'](https://www.npmjs.com/package/express) application generator.

[![NPM Version][npm-image]][npm-url]
[![NPM Downloads][downloads-image]][downloads-url]
[![Linux Build][github-actions-ci-image]][github-actions-ci-url]
[![Windows Build][appveyor-image]][appveyor-url]

## Installation

```sh
$ npm install -g express-generator
```

You can also run the application generator with the `npx` command. Node.js 22 or newer is required.

```sh
$ npx express-generator
```

## Quick Start

The quickest way to get started with express is to utilize the executable `express(1)` to generate an application as shown below:

Create the app:

```bash
$ express --view=hbs /tmp/foo && cd /tmp/foo
```

Install dependencies:

```bash
$ npm install
```

Start your Express.js app at `http://localhost:3000/`:

```bash
$ npm start
```

Generated apps are ES modules (`"type": "module"`) built on Express 5, and require Node.js 22 or newer.
Use `--cjs` to generate CommonJS modules (`require()` / `module.exports`) instead.
When a stylesheet engine is chosen, the stylesheets are compiled by the app's `build:css` script, which runs automatically before `npm start`.

During development, run the app with automatic restarts (and stylesheet recompiling, when a stylesheet engine is chosen):

```bash
$ npm run dev
```

Run the app's tests, written with the built-in [`node:test`](https://nodejs.org/api/test.html) runner:

```bash
$ npm test
```

## Command Line Options

This generator can also be further configured with the following command line flags.

        --version        output the version number
    -v, --view <engine>  add view <engine> support (ejs|hbs|pug|twig) (defaults to pug)
        --no-view        use static html instead of view engine
    -c, --css <engine>   add stylesheet <engine> support (less|sass|scss|stylus) (defaults to plain css)
        --cjs            generate CommonJS modules instead of ES modules
        --helmet         add helmet middleware for security headers
        --compression    add compression middleware for gzip/brotli responses
        --cookies        add cookie-parser middleware
        --git            add .gitignore
    -f, --force          force on non-empty directory
    -h, --help           output usage information

## License

[MIT](LICENSE)

[npm-image]: https://img.shields.io/npm/v/express-generator.svg
[npm-url]: https://npmjs.org/package/express-generator
[appveyor-image]: https://img.shields.io/appveyor/ci/dougwilson/generator/master.svg?label=windows
[appveyor-url]: https://ci.appveyor.com/project/dougwilson/generator
[downloads-image]: https://img.shields.io/npm/dm/express-generator.svg
[downloads-url]: https://npmjs.org/package/express-generator
[github-actions-ci-image]: https://img.shields.io/github/workflow/status/expressjs/generator/ci/master?label=linux
[github-actions-ci-url]: https://github.com/expressjs/generator/actions/workflows/ci.yml
