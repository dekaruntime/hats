<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Release workflow

Every code change that should go live on https://testsuite.deka.gg must be merged to
`main` through a pull request. Direct pushes to `main` do not trigger a deploy.

1. Create a branch: `git checkout -b agent/<name>/<topic>`.
2. Make the change and run `bun run build` locally.
3. Commit and push the branch.
4. Open a PR against `main` with `gh pr create --base main`.
5. Merge the PR with `gh pr merge <n> --merge`.
6. The `Deploy deka test suite` action runs automatically on `main`; watch it with
   `gh run watch <id>`.
7. Verify the change at https://testsuite.deka.gg after the action succeeds.
