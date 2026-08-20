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

### Helper scripts

Run one-off snippets against the live wasm compiler:

```bash
printf 'console.log("hello")\n' | bun scripts/quick-test.mjs
```

Dump the full build-time conformance report locally:

```bash
bun scripts/dump-results.mjs
```

Generate/regenerate the snapshot-style test fixtures from the definitions in `scripts/generate-tests.mjs`:

```bash
bun scripts/generate-tests.mjs
```

## Native-vs-wasm drift detection

HATS can compare the wasm compiler against the matching native CLI downloaded from `releases.deka.gg`. On Cloudflare Workers Builds the linux-x64 binary currently fails with a `GLIBC_2.43` mismatch, so native drift detection is disabled in that environment and the site falls back to wasm-only results. See [dekaruntime/hats#1](https://github.com/dekaruntime/hats/issues/1).

Current suite snapshot (runtime v0.23.3):

- 311 tests across 11 categories
- 309 passing
- 2 native/wasm divergences tracked in dekaruntime/deka#174, #175, #176

## Deployment

The site deploys via Cloudflare Workers Builds automatically on every push to `main`.

Dashboard settings:

| Setting | Value |
|---|---|
| Build command | `bun run build` |
| Deploy command | `npx wrangler deploy --assets dist` |
| Root directory | `/` |

`next.config.ts` uses `output: 'export'` and `distDir: 'dist'`, so the build produces a static `dist/` folder. Wrangler uploads that folder as static assets with no Worker code.
