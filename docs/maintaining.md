# Maintaining

## Generated dependency versions

The versions of the packages that generated apps depend on live in
[`templates/versions.json`](../templates/versions.json). Dependabot does not cover them, so check them with:

```bash
$ npm run versions              # report versions that are behind, too new, or have a new major
$ npm run versions -- --update  # raise each version to the newest release in its major
```

- **Too new:** generated apps do not install a release until it is 3 days old, so an app cannot be
  installed while a version floor is newer than that. The check reports the floor, and `--update`
  lowers it. Versions are only raised to releases at least 7 days old, which leaves a margin.
- **New majors** are reported but never applied; review the templates before changing the range.
- **Packages under `hold`** are kept on an older major on purpose. A hold with an `until` condition,
  such as TypeScript 6 for `--ts --lint`, is reported as ready to lift once the named package's
  latest release supports the newer version, here when typescript-eslint supports TypeScript 7.
- The file also holds the pnpm and npm versions that generated Dockerfiles install.
- The `versions` workflow runs the check monthly.

## Releasing

Releases are published to npm by the `publish` workflow when a GitHub release is published, using
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm token is needed.

1. Move the `Unreleased` entries in [`CHANGELOG.md`](../CHANGELOG.md) under the new version and date
2. Bump the version without tagging yet: `npm version <major|minor|patch> --no-git-tag-version`
3. Commit both, then tag and push: `git tag vX.Y.Z && git push origin HEAD vX.Y.Z`
4. Publish a GitHub release for the tag, with the changelog entry as its notes:
   `gh release create vX.Y.Z --title vX.Y.Z --notes-file <file>`

The workflow checks that the tag matches `package.json`, then runs lint and the tests before
publishing.
