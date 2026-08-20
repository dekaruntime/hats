import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import os from 'os'
import { runDekaJsDirect } from './compiler/runtime'

const RELEASES_BASE = 'https://releases.deka.gg'

export interface NativeRunResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
  transpileFailed: boolean
  diagnostics: Array<{
    severity: 'error' | 'warning' | 'info'
    message: string
    line?: number
    column?: number
  }>
}

let nativeCliPath: string | null = null

function getPlatformBinaryName(): string | null {
  const platform = os.platform()
  const arch = os.arch()
  if (platform === 'linux' && arch === 'x64') return 'deka-linux-x64'
  if (platform === 'darwin' && arch === 'x64') return 'deka-darwin-x64'
  if (platform === 'darwin' && arch === 'arm64') return 'deka-darwin-arm64'
  return null
}

export async function prepareNativeCli(version: string): Promise<string | null> {
  if (nativeCliPath) return nativeCliPath

  const binaryName = getPlatformBinaryName()
  if (!binaryName) {
    console.warn(`[hats] native CLI not available for ${os.platform()}-${os.arch()}; skipping native drift checks`)
    return null
  }

  const downloadUrl = `${RELEASES_BASE}/${version}/${binaryName}`
  const cacheDir = path.join(process.cwd(), '.cache', 'deka-cli')
  fs.mkdirSync(cacheDir, { recursive: true })
  const binaryPath = path.join(cacheDir, binaryName)

  if (!fs.existsSync(binaryPath)) {
    console.log(`[hats] downloading native CLI ${downloadUrl}`)
    const res = await fetch(downloadUrl)
    if (!res.ok) {
      throw new Error(`Failed to download native CLI ${downloadUrl}: ${res.status}`)
    }
    const bytes = Buffer.from(await res.arrayBuffer())
    fs.writeFileSync(binaryPath, bytes)
  }

  fs.chmodSync(binaryPath, 0o755)

  // Verify the binary actually executes in this environment (glibc compatibility, etc.).
  try {
    execSync(`"${binaryPath}" --version`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
  } catch (err) {
    const stderr = String((err as { stderr?: string }).stderr ?? '')
    console.warn(`[hats] native CLI ${binaryPath} failed to run: ${stderr.trim()}`)
    console.warn('[hats] native drift detection disabled; falling back to wasm-only results')
    return null
  }

  nativeCliPath = binaryPath
  return binaryPath
}

function parseNativeDiagnostics(stderr: string): NativeRunResult['diagnostics'] {
  const diagnostics: NativeRunResult['diagnostics'] = []
  const lines = stderr.split('\n')

  let message: string | undefined
  let line: number | undefined
  let column: number | undefined

  for (let i = 0; i < lines.length; i++) {
    const current = lines[i]
    // Header line: ┌─ /path/to/file.ds:LINE:COLUMN
    const headerMatch = current.match(/^┌─\s+\S+:(\d+):(\d+)\s*$/)
    if (headerMatch) {
      line = Number(headerMatch[1])
      column = Number(headerMatch[2])
      continue
    }
    // Message line: │   ^ MESSAGE
    const messageMatch = current.match(/\^\s+(.+)$/)
    if (messageMatch) {
      message = messageMatch[1].trim()
      if (message) {
        diagnostics.push({ severity: 'error', message, line, column })
      }
      message = undefined
      line = undefined
      column = undefined
    }
  }

  // Fallback: if no rich diagnostic was parsed, treat the first non-empty,
  // non-bracketed line as a single-line diagnostic. This covers simple parser
  // errors like "Missing semicolon" or "DekaScript parameters require a type
  // annotation" that the native CLI emits without position annotations.
  if (diagnostics.length === 0) {
    const firstLine = lines.find((l) => {
      const trimmed = l.trim()
      return trimmed.length > 0 && !trimmed.startsWith('[') && !trimmed.startsWith('Validation') && !trimmed.startsWith('❌')
    })
    if (firstLine) {
      diagnostics.push({ severity: 'error', message: firstLine.trim() })
    }
  }

  return diagnostics
}

function createPrivateTempDir(): string {
  const prefix = path.join(os.tmpdir(), 'hats-native-run-')
  const dir = fs.mkdtempSync(prefix)
  fs.chmodSync(dir, 0o700)
  return dir
}

function removeTempDir(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // Best-effort cleanup; don't let temp-dir removal mask the real result.
  }
}

export async function runNativeCli(
  cliPath: string,
  source: string,
  _baseDir?: string
): Promise<NativeRunResult> {
  const tmpDir = createPrivateTempDir()

  try {
    const inputPath = path.join(tmpDir, 'test.ds')
    const outputPath = path.join(tmpDir, 'test.js')

    fs.writeFileSync(inputPath, source)

    // Ensure bun/node treat the emitted JS as an ES module, matching how wasm runs it.
    fs.writeFileSync(path.join(tmpDir, 'package.json'), JSON.stringify({ type: 'module' }))

    let transpileOk = false
    let transpileError = ''

    try {
      execSync(`"${cliPath}" transpile "${inputPath}" --out "${outputPath}"`, {
        cwd: tmpDir,
        encoding: 'utf-8',
        timeout: 30000,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      transpileOk = true
    } catch (err) {
      transpileError = String((err as { stderr?: string; stdout?: string }).stderr ?? '')
    }

    if (!transpileOk || !fs.existsSync(outputPath)) {
      const diagnostics = parseNativeDiagnostics(transpileError)
      const firstError = diagnostics[0]?.message ?? transpileError.split('\n').find((l) => l.trim()) ?? 'native transpile failed'
      return {
        ok: false,
        stdout: '',
        stderr: transpileError,
        error: firstError,
        transpileFailed: true,
        diagnostics,
      }
    }

    const jsCode = fs.readFileSync(outputPath, 'utf-8')
    const runResult = await runDekaJsDirect(jsCode, { cwd: '/hats', env: {} })

    return {
      ok: runResult.ok,
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      error: runResult.error,
      transpileFailed: false,
      diagnostics: runResult.error ? [{ severity: 'error', message: runResult.error }] : [],
    }
  } finally {
    removeTempDir(tmpDir)
  }
}
