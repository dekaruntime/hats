import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import os from 'os'

const RELEASES_BASE = 'https://releases.deka.gg'

export interface NativeRunResult {
  ok: boolean
  stdout: string
  stderr: string
  error?: string
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

function createPrivateTempDir(baseDir: string): string {
  const dir = path.join(
    baseDir,
    'native-run-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2)
  )
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  return dir
}

export function runNativeCli(
  cliPath: string,
  source: string,
  baseDir: string
): NativeRunResult {
  const tmpDir = createPrivateTempDir(baseDir)
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
    return {
      ok: false,
      stdout: '',
      stderr: transpileError,
      error: 'native transpile failed',
    }
  }

  try {
    const runStdout = execSync('bun run test.js', {
      cwd: tmpDir,
      encoding: 'utf-8',
      timeout: 30000,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return {
      ok: true,
      stdout: runStdout,
      stderr: '',
    }
  } catch (err) {
    const stderr = String((err as { stderr?: string; stdout?: string }).stderr ?? '')
    const stdout = String((err as { stderr?: string; stdout?: string }).stdout ?? '')
    return {
      ok: false,
      stdout,
      stderr,
      error: 'native runtime failed',
    }
  }
}
