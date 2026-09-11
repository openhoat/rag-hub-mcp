# Contributing

Contributions are welcome. This project is small and opinionated — if you plan a larger change, open an issue or a discussion first.

## Development setup

```bash
npm install
npm run qa          # lint + typecheck + test
npm run validate    # qa + build
npm start           # start the server
```

Uses **Biome** for linting/formatting and **vitest** for unit tests.

## Process

1. Fork the repo and create a branch (`feat/your-feature` or `fix/your-fix`).
2. Make your change, add tests where relevant.
3. Run `npm run validate` — the project gate (lint + typecheck + test + build) must pass.
4. Open a pull request.

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) in English.

The [KANBAN.md](https://github.com/openhoat/rag-hub-mcp/blob/main/KANBAN.md) board tracks the backlog — pick an item or propose yours.
