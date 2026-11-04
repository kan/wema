# tagpr-scripts

The scripts that let [tagpr](https://github.com/Songmu/tagpr) release an npm package whose
`CHANGELOG.md` is written by hand. Shared by [lily](https://github.com/kan/lily),
[wema](https://github.com/kan/wema) and [wema-kake](https://github.com/kan/wema-kake),
which pull this repository in with `git subtree` at `scripts/tagpr/`.

| File | Run by | Does |
|---|---|---|
| `release-prepare.mjs` | tagpr, as `postVersionCommand` | Turns `## [Unreleased]` into `## [X.Y.Z] - <date in JST>`, adds the version's link definition, and brings `package-lock.json` to the version tagpr put in `package.json` |
| `release-notes.mjs` | The publish workflow | Prints one section of `CHANGELOG.md`, to check that it exists before publishing and to use it as the GitHub release notes |
| `changelog.mjs` | (imported by both) | How a `CHANGELOG.md` is read. Written in one place so the release pull request and the publish never disagree |

**Only Node's built-in modules.** The tagpr job holds a token that can push to the
repository, so it runs no dependency code: no `npm ci`, nothing fetched at run time. That
is also why this is a subtree and not an npm package — the code is committed in each
repository and reviewed in its diffs.

Run both from the repository root: `CHANGELOG.md`, `package.json` and `package-lock.json`
(lockfile version 2 or later) are read from the working directory.

## What the CHANGELOG has to look like

[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), with these rules:

- Each pull request that changes what users get adds its line under `## [Unreleased]`.
  That section becomes the release notes word for word.
- A section ends at the next `## ` heading, or at the block of link definitions
  (`[x]: url`) at the end of the file. Headings inside code fences are not headings.
- Links inside entries are written inline. A reference link's definition sits outside the
  section, so it would not be a link in the release notes.
- Each release gets `[X.Y.Z]: https://github.com/<owner>/<repo>/releases/tag/vX.Y.Z` at
  the top of that final block, with `<owner>/<repo>` taken from `repository` in
  `package.json` (GitHub only). There is no `[Unreleased]: .../compare/...` link; nothing
  would keep it up to date.
- LF line endings.

`release-prepare.mjs` checks everything before it writes anything, and writes nothing when
it fails. It fails when:

- `## [Unreleased]` is missing, empty or duplicated. Right after a release this is
  expected, and every push to `main` gets a red tagpr run until a pull request adds an
  entry.
- **`## [X.Y.Z]` is already there.** tagpr rebuilds the release branch from `main` every
  time, so this means a release pull request was merged and its tag was never made —
  usually because the tagpr run of the merge commit was cancelled by a later push. Re-run
  that run. Merging a new release pull request would tag a later commit with changes the
  CHANGELOG does not list.
- `package.json` is not at the version tagpr proposes, or its `repository` is not GitHub.

tagpr still updates the release pull request when the command fails, so **do not merge a
release pull request whose tagpr run is red.**

## Using it

```bash
git subtree add --prefix=scripts/tagpr https://github.com/kan/tagpr-scripts.git main --squash
```

`.tagpr`:

```ini
[tagpr]
	releaseBranch = main
	vPrefix = true
	versionFile = package.json
	changelog = false
	release = false
	postVersionCommand = node scripts/tagpr/release-prepare.mjs
	minorLabels = enhancement
```

In the publish workflow, before `npm ci`:

```yaml
- name: Extract the CHANGELOG section
  env:
    TAG: ${{ github.ref_name }}
  run: node scripts/tagpr/release-notes.mjs "$TAG" > "$RUNNER_TEMP/release-notes.md"
```

and after `npm publish`, `gh release create "$TAG" --verify-tag --notes-file "$RUNNER_TEMP/release-notes.md"`.
[lily's workflows](https://github.com/kan/lily/tree/main/.github/workflows) are a complete
example: `tagpr.yml` starts `publish.yml` with `workflow_dispatch` on the new tag.

## Changing it

**Change this repository, never the copy in `scripts/tagpr/`.** Then, in each repository:

```bash
git subtree pull --prefix=scripts/tagpr https://github.com/kan/tagpr-scripts.git main --squash
```

**Merge that pull request with a merge commit, even in a repository that squashes
everything else.** `git subtree` finds the last import from the commits it made; a squash
merge folds them away and breaks the next pull.

The whole repository comes along, `.github/` included. In `scripts/tagpr/.github/` it is
inert — GitHub only reads the root's — and it stays so the copy matches this repository.

```bash
node --test 'test/*.node-test.mjs'
```

**The tests are not named `*.test.mjs`.** Vitest's default `include` would pick them up
in the repositories that pull this in, and fail on them as files with no Vitest suite.
