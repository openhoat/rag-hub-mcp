# Contributing

Thanks for considering contributing to `rag-hub-mcp`.

## Workflow

`main` is the production branch: every commit on it is deployable and should be
tagged on release. Work happens on feature branches, then lands on `main` through
a pull request with a **rebase merge**.

### Branch naming

- `feat/...` — new feature or evolution
- `fix/...` — bug fix
- `refactor/...` — refactoring
- `docs/...` — documentation
- `chore/...` — maintenance / configuration

### Flow

1. Branch off `main` (keep it up to date with the latest `main`).
2. Make your changes. Commits must follow [Conventional Commits](https://www.conventionalcommits.org/) in English (see below).
3. Rebase your branch on `main` before opening the PR, and keep it linear.
4. Open a pull request against `main`. Refer to a related issue with `Closes #N` when applicable.
5. Ensure the `Build & validate` check passes (lint + typecheck + tests + build).
6. Merge with **rebase** (merge commits are disabled on the repository).

## Commit messages

- English, Conventional Commits format: `<type>(<scope>): <subject>`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `revert`
- Imperative mood, start with a capital letter, no trailing period

Example:

```text
feat: add configurable chunk size
```

## Local validation

Always run the full gate before pushing:

```bash
npm run validate
```

This runs the linter, type checker, unit + e2e tests, and the build.

## Releases

Releases are cut from `main` (version bump, `CHANGELOG.md` regeneration, tag and
push). `main` stays aligned with the deployed, tagged state.
