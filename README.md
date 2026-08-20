# HATS · Human Aided Test Suite

Public conformance tests for [DekaScript](https://deka.gg).

Live site: **https://hats.deka.gg**

## How it works

Each test is its own folder under `tests/<category>/<test-name>/`:

```
tests/parser/missing_semicolon/
  missing_semicolon.fail.ds      # source under test
  missing_semicolon.stdout       # exact expected stdout (optional)
  missing_semicolon.code         # exact expected formatter output (optional)
  missing_semicolon.json         # title, stage, diagnostic, notes (optional)
```

The filename of the `.ds` file states whether the test should **pass** or **fail**:

- `<name>.pass.ds`
- `<name>.fail.ds`

## Adding a test

1. Fork the repo.
2. Create a new folder under `tests/<category>/<test-name>/`.
3. Add the `.ds` source file.
4. If the test checks stdout, add a `.stdout` file with the exact expected output.
5. If the test checks formatter output, add a `.code` file with the exact expected code.
6. Open a pull request.

## Exact matching

HATS uses exact string comparison for both stdout and formatted code. Every character matters, including trailing newlines. This makes the suite suitable for validating formatter behavior.

## JSON metadata format

```json
{
  "title": "Missing semicolon between struct fields",
  "stage": "parse",
  "expectedDiagnosticContains": "expected ';'",
  "notes": "Regression for formatter/tour corruption."
}
```

Fields:

- `title` — human-readable name shown in the UI.
- `stage` — `parse`, `typecheck`, or `run`.
- `expectedDiagnosticContains` — substring the compiler diagnostic must contain for failing tests.
- `notes` — free-form notes.

## Local development

```bash
bun install
bun run dev
```

Build a static export:

```bash
bun run build
```

## Deployment

The site deploys via Cloudflare Workers Builds automatically on every push to `main`.

Dashboard settings:

| Setting | Value |
|---|---|
| Build command | `bun run build` |
| Deploy command | `npx wrangler deploy --assets dist` |
| Root directory | `/` |

`next.config.ts` uses `output: 'export'` and `distDir: 'dist'`, so the build produces a static `dist/` folder. Wrangler uploads that folder as static assets with no Worker code.
