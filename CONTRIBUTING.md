# Contributing

Thanks for helping improve Corebeasts RPG.

## Local Setup

1. Install Node.js 20+ and npm.
2. Install dependencies:

```bash
npm install
```

3. Start the game in dev mode:

```bash
npm run dev
```

4. Run quality checks before opening a PR:

```bash
npm run lint
npm run build
```

## Branch + PR Workflow

1. Create a feature branch from `main`.
2. Keep commits focused and small.
3. Open a PR with:

- What changed
- Why it changed
- How it was tested

## Scope Guidance

- Gameplay benchmark logic lives in `src/game`.
- Packaging and distribution tooling lives in `scripts/`, `.github/`, and `electron/`.
- Avoid bundling generated artifacts (`dist`, `release`, `output`) in commits.
