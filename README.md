# HATS · Human Aided Test Suite

Public conformance tests for [DekaScript](https://deka.gg).

Live site: **https://hats.deka.gg**

## How it works

- Tests are plain `.ds` files under `tests/<category>/`.
- The filename states whether the test should **pass** or **fail**:
  - `my_test.pass.ds`
  - `my_test.fail.ds`
- Optional metadata lives in a matching `.json` file:
  - `my_test.pass.json`
- Expected stdout can also be declared inside the `.ds` file with comments:

```deka
// expected stdout:
// hello world
console.log("hello world")
```

## Adding a test

1. Fork the repo.
2. Add your `.ds` file under the right `tests/<category>/` directory.
3. If you need metadata (title, stage, expected diagnostic, notes), add a matching `.json` file.
4. Open a pull request.

## JSON metadata format

```json
{
  "title": "Optional field omitted defaults to None",
  "stage": "run",
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

The site deploys to Cloudflare Pages automatically on every push to `main`.

Required GitHub secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PAGES_TOKEN`
