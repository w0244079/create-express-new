# Using Sass

`--sass` adds [Sass](https://sass-lang.com/) to a web app. It is not for JSON APIs without views
(`--api` alone), which have no stylesheets.

```bash
$ pnpm create express-new@latest my-app --sass
```

The app has a `public/stylesheets/style.scss` in place of `style.css`, and Sass compiles each
`.scss` file in `public/stylesheets` to the `.css` file next to it, which the views link to:

- `pnpm css` compiles the stylesheets.
- `pnpm start` and `pnpm dev` compile them first, with their `prestart` and `predev` scripts.
- `pnpm css:watch` recompiles them on change. Run it in a second terminal alongside `pnpm dev`, which
  only compiles once when it starts.

An app generated with `--pm=npm` uses `npm run css` and `npm run css:watch`.

The compiled `.css` files and their source maps are in `.gitignore`, so write your styles in `.scss`
files: a plain `.css` file added to `public/stylesheets` would be ignored too.

## In production

Sass is a development dependency. Where only production dependencies are installed, such as with
`pnpm install --prod` or `NODE_ENV=production`, `pnpm start` cannot compile the stylesheets and
fails. Compile them while the development dependencies are installed, then start the app without the
`prestart` script:

```bash
$ pnpm install
$ pnpm css
$ node ./bin/www.js
```

With `--docker`, the image does this for you: its `Dockerfile` compiles the stylesheets in a stage of
their own and copies them into the final image, which has neither Sass nor the package manager.

## Install scripts

Sass's optional file watcher, `@parcel/watcher`, has an install script, and a generated pnpm app
stops the install when a dependency wants to run one. Sass works without it, so `--sass` lists it
under `allowBuilds` in `pnpm-workspace.yaml` as a script not to run. npm skips the script by itself,
with a warning during the install that you can ignore.

## Adding Sass to an existing app

In an app generated without `--sass`:

```bash
$ pnpm add --save-dev sass --allow-build=@parcel/watcher
$ mv public/stylesheets/style.css public/stylesheets/style.scss
$ pnpm pkg set scripts.css="sass public/stylesheets:public/stylesheets" scripts.prestart="pnpm css" scripts.predev="pnpm css"
```

`--allow-build` lets the file watcher run its install script. To leave it off instead, list
`'@parcel/watcher': false` under `allowBuilds` in `pnpm-workspace.yaml`. Add
`public/stylesheets/*.css` and `public/stylesheets/*.css.map` to `.gitignore`.

In an npm app, use `npm install --save-dev sass` and `npm pkg set` with `npm run css` in the scripts.
