# Package manager

Every app requires one package manager, pnpm by default or npm with `--pm=npm`, and has settings
that protect installs from compromised packages:

| | pnpm | npm |
| --- | --- | --- |
| Required version | 11 or newer | 12 or newer |
| Settings file | `pnpm-workspace.yaml` | `.npmrc` |
| New releases | wait 3 days | wait 3 days |
| Install scripts of dependencies | not run; the install stops until you allow or deny them | not run unless approved |
| Dependencies from git | refused in dependencies of dependencies, as are URLs | refused |
| Releases with weaker proof of origin than earlier ones | refused | allowed |

npm's rules for install scripts and git are npm 12's defaults, not settings in `.npmrc`.

- **npm 12** does not come with Node.js 22 or 24: run `npm install -g npm@12`, on Node.js 22.22.2,
  24.15 or newer.
- **The requirement** is `devEngines.packageManager` in `package.json`. npm refuses to install or
  run scripts in a pnpm app, pnpm refuses in an npm app, and Yarn refuses when run through Corepack.
  It is a guard rail, not a lock: `npm install --force` ignores it, and running `node` directly, as
  the Docker image does, involves no package manager.
- **The pnpm version** that installed a pnpm app is recorded in `pnpm-lock.yaml`. Any other pnpm
  downloads and runs that version, so everyone, and the Docker image, installs with the same one.
- **A release you need before it is 3 days old**: list the package under `minimumReleaseAgeExclude`
  in `pnpm-workspace.yaml`.
- **A dependency with an install script**, such as a native module, stops `pnpm install` until you
  run `pnpm approve-builds`, or list it under `allowBuilds` in `pnpm-workspace.yaml` as `true` or
  `false`.
- **To change package manager later**, edit `devEngines.packageManager`, delete the old settings
  file, lockfile and `node_modules`, and add the new package manager's settings file. Generating an
  app with the other `--pm` in an empty directory gives you one to copy.
