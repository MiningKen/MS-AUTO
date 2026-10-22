# Repository Guidelines

## Project Structure & Module Organization

This repository is currently a clean starting point. Keep application code in `src/`, automated tests in `tests/`, and static or generated assets in `assets/`. Group related features in focused subdirectories (for example, `src/input/` or `src/automation/`) rather than placing unrelated files at the root. Keep root-level files limited to project configuration, documentation, and entry points.

## Build, Test, and Development Commands

Choose one reproducible toolchain and document its commands in `README.md` as it is introduced. Typical commands should include:

- `npm run dev` — start the local development workflow.
- `npm test` — run the complete automated test suite.
- `npm run lint` — check formatting and static-analysis rules.
- `npm run build` — produce a distributable build.

If another runtime is selected, provide equivalent commands and avoid committing machine-specific paths or local build outputs.

## Coding Style & Naming Conventions

Use the formatter and linter configured by the project; do not manually reformat unrelated code. Prefer 2-space indentation for JavaScript or TypeScript unless the adopted formatter specifies otherwise. Use `camelCase` for variables and functions, `PascalCase` for classes and components, and `kebab-case` for directories and non-component filenames. Name modules after their responsibility, such as `window-capture.ts`, rather than generic names like `utils.ts`.

Keep functions small, validate inputs at system boundaries, and isolate platform-specific behavior behind clear interfaces. Never commit credentials, personal paths, screenshots containing sensitive data, or generated binaries.

## Testing Guidelines

Place tests under `tests/` or adjacent to their source using `*.test.*`. Cover normal behavior, invalid input, and important failure paths. Run the relevant tests before opening a pull request; add regression coverage whenever fixing a defect.

## Commit & Pull Request Guidelines

No Git history exists yet. Use concise imperative commit subjects, preferably following Conventional Commits: `feat: add input capture`, `fix: handle missing window`, or `docs: add setup notes`. Keep commits focused.

Pull requests should explain the change and its motivation, list validation performed, link related issues, and include screenshots or recordings for visible behavior changes. Request review only when the branch is rebased or otherwise ready to merge.
