# Using Sass

To use [Sass](https://sass-lang.com/) in a generated app, install it and compile your stylesheets
before the app starts:

```bash
$ pnpm add --save-dev sass --allow-build=@parcel/watcher
$ mv public/stylesheets/style.css public/stylesheets/style.scss
$ pnpm pkg set scripts.css="sass public/stylesheets:public/stylesheets" scripts.prestart="pnpm css"
```

`--allow-build` lets Sass's file watcher, `@parcel/watcher`, run its install script, which would
otherwise stop the install. Sass works without it too: list `'@parcel/watcher': false` under
`allowBuilds` in `pnpm-workspace.yaml` and leave the flag off.

To recompile on change, run `pnpm exec sass --watch public/stylesheets:public/stylesheets` alongside
`pnpm dev`.

In an npm app, use `npm install --save-dev sass`, `npm pkg set` with `scripts.prestart="npm run css"`,
and `npx sass --watch`.
