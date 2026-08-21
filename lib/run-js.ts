import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { tmpdir } from 'os'

export interface NodeRunResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
}

/**
 * Execute emitted DekaScript JS in a fresh Node process.
 *
 * Both the native CLI and the wasm compiler emit self-contained JS with the
 * deka runtime prelude installed. Running it under Node matches how end users
 * run the native CLI, and gives the wasm compiler a fair baseline for drift
 * detection (both compilers target the same JS runtime, so differences are
 * compiler differences, not JS engine differences).
 */
export function runJsInNode(jsCode: string): NodeRunResult {
  const tmpDir = fs.mkdtempSync(path.join(tmpdir(), 'hats-node-run-'))
  const outputPath = path.join(tmpDir, 'test.js')
  // The compiler emits `const {URL, fetch, ...} = unsafe;` inside unsafe blocks.
  // In the browser the site provides this object; in Node we alias it to the
  // global object so the same browser APIs are available.
  fs.writeFileSync(outputPath, `globalThis.unsafe = globalThis;\n${jsCode}`)
  fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))

  try {
    const stdout = execSync('node test.js', {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { ok: true, stdout, stderr: '' }
  } catch (error) {
    const stdout = String((error as { stdout?: string }).stdout ?? '')
    const stderr = String((error as { stderr?: string }).stderr ?? '')
    const message = error instanceof Error ? error.message : String(error)
    return {
      ok: false,
      stdout,
      stderr,
      error: stderr.trim() || message,
    }
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true })
    } catch {
      // Best-effort cleanup.
    }
  }
}
