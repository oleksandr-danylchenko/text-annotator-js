# Upstream alignment notes

These notes cover the recurring details for aligning this fork with a released
version of `recogito/text-annotator-js`.

## Before merging

- The worktree must be clean.
- Fetch both remotes, then verify the intended `origin/staging` and
  `upstream/main` SHAs. Record them in the PR.
- Verify that `origin/main` is an ancestor of `upstream/main`. Then
  fast-forward the fork's `main` to upstream before creating the alignment PR.
- Create the alignment branch from `origin/staging` and merge `upstream/main`.
  Keep the merge commit: it makes the next upstream alignment small.

Do not push to `staging`, merge the PR, publish to npm, or change the
`@soomo/*` versions as part of the alignment.

## Expected conflicts

The v4.3.7 alignment produced these four conflicts. Additional conflicts need
review instead of an assumed resolution.

| File | Resolution |
| --- | --- |
| `packages/text-annotator/package.json` | Keep `@soomo/text-annotator` and its current `-staging` version; take upstream's other changes. |
| `packages/text-annotator-react/package.json` | Keep `@soomo/react-text-annotator`, its current `-staging` version, `@soomo/text-annotator`, and `@react-aria/live-announcer`. Take upstream dependency updates, but do not add `@recogito/text-annotator`. |
| `packages/text-annotator-tei/src/crosswalk/crosswalk.ts` | Take upstream's code, retaining the type-only import from `@soomo/text-annotator`. The runtime `isRevived` import remains from `@recogito/text-annotator`. |
| `package-lock.json` | Start with staging's lockfile, then run `npm install` after resolving manifests. |

The lockfile regeneration must use the Node version in `.nvmrc` when that file
exists. This repository had no `.nvmrc` during the v4.3.7 alignment and uses
npm.

## Validation and expected results

Run `npm ci` after committing the merge. It must leave `git status` clean.
Then check:

```sh
npm ls @annotorious/core @annotorious/react
rg -n '<<<<<<<|>>>>>>>' packages package.json
git diff origin/staging -- packages/text-annotator-react/src
npm run build --workspace @soomo/text-annotator
npm run build --workspace @recogito/text-annotator-tei
npm run build --workspace @soomo/react-text-annotator
npm run test --workspace @soomo/text-annotator
```

For v4.3.7, Annotorious resolved to 3.9.4; the marker search and React-source
diff were empty; all three workspaces built; and `text-annotator` reported two
passing files and five passing tests.

`npm install` and `npm ci` may report existing dependency vulnerabilities or
an unapproved `esbuild` postinstall script. Treat those as expected environment
output unless the install itself fails or changes the lockfile after `npm ci`.

The upstream TEI crosswalk file contains trailing whitespace, so `git diff
--check` reports it after taking upstream's version. Preserve the upstream file
rather than making unrelated whitespace changes.

Finally, inspect `git diff origin/staging -- packages/text-annotator/src` to
ensure it contains only intentional upstream changes.
