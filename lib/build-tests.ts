import fs from 'fs'
import path from 'path'
import { loadWasmCompiler, compileWithWasm, formatDsWithWasm } from './build-wasm'
import { prepareNativeCli, runNativeCli } from './build-native'
import { runDekaJsDirect, runDekaProject } from '@dekaruntime/web-ide-kit/runtime'
import { loadAllTests, type HatsCategory, type HatsTest, type HatsTestStage } from './tests'

export type RuntimeStatus = 'pass' | 'fail'

export interface RuntimeResult {
  ok: boolean
  stage: HatsTestStage
  stdout: string
  stderr: string
  formattedCode?: string
  error?: string
  diagnostics: Array<{
    severity: 'error' | 'warning' | 'info'
    message: string
    line?: number
    column?: number
  }>
}

export interface HatsTestWithBuildResult extends HatsTest {
  wasmResult: RuntimeResult
  nativeResult: RuntimeResult
  wasmMatches: boolean
  nativeMatches: boolean
  overallStatus: 'pass' | 'fail' | 'divergent'
}

export interface HatsCategoryWithResults extends HatsCategory {
  tests: HatsTestWithBuildResult[]
}

function determineStage(
  ok: boolean,
  js?: string,
  error?: string,
  diagnostics?: RuntimeResult['diagnostics']
): HatsTestStage {
  if (ok) return 'run'
  if (error && error.length > 0 && (!js || js.length === 0)) return 'parse'
  const hasErrors = (diagnostics ?? []).some((d) => d.severity === 'error')
  if (hasErrors) return !js || js.length === 0 ? 'parse' : 'typecheck'
  return 'parse'
}

function exactMatch(actual: string, expected: string): boolean {
  return actual === expected
}

function runtimeMatchesExpectation(
  test: HatsTest,
  result: RuntimeResult,
  options: { ignoreCode?: boolean } = {}
): boolean {
  if ((result.ok ? 'pass' : 'fail') !== test.status) return false
  if (result.stage !== test.stage) return false

  if (test.expectedStdout !== undefined) {
    if (!exactMatch(result.stdout, test.expectedStdout)) return false
  }

  if (!options.ignoreCode && test.expectedCode !== undefined) {
    if (!exactMatch(result.formattedCode ?? '', test.expectedCode)) return false
  }

  if (test.expectedDiagnosticContains) {
    const hasDiagnostic = result.diagnostics.some((d) =>
      d.message.toLowerCase().includes(test.expectedDiagnosticContains!.toLowerCase())
    )
    if (!hasDiagnostic) return false
  }

  return true
}

async function runWasmTest(
  source: string,
  slug: string,
  files?: Record<string, string>,
  entryPath?: string
): Promise<RuntimeResult> {
  const isProject = files && entryPath

  if (isProject) {
    const projectFiles = { [entryPath]: source, ...files }
    const runResult = await runDekaProject(entryPath, projectFiles)
    const compileResult = runResult.compileResult
    const formatResult = formatDsWithWasm(globalHatsCompiler, source)

    if (!compileResult.ok) {
      return {
        ok: false,
        stage: determineStage(false, undefined, compileResult.diagnostics.find((d) => d.severity === 'error')?.message, compileResult.diagnostics),
        stdout: '',
        stderr: '',
        formattedCode: formatResult.ok ? formatResult.code : undefined,
        error: compileResult.diagnostics.find((d) => d.severity === 'error')?.message,
        diagnostics: compileResult.diagnostics,
      }
    }

    const diagnostics = compileResult.diagnostics.slice()
    if (!runResult.ok && runResult.error) {
      diagnostics.push({ severity: 'error', message: runResult.error })
    }
    return {
      ok: runResult.ok,
      stage: 'run',
      stdout: runResult.stdout,
      stderr: runResult.stderr,
      formattedCode: formatResult.ok ? formatResult.code : undefined,
      error: runResult.error,
      diagnostics,
    }
  }

  const compileResult = compileWithWasm(globalHatsCompiler, source, `${slug}.ds`)
  const formatResult = formatDsWithWasm(globalHatsCompiler, source)

  if (!compileResult.ok || !compileResult.js) {
    return {
      ok: false,
      stage: determineStage(false, compileResult.js, compileResult.error, compileResult.diagnostics),
      stdout: '',
      stderr: '',
      formattedCode: formatResult.ok ? formatResult.code : undefined,
      error: compileResult.error,
      diagnostics: compileResult.diagnostics,
    }
  }

  const runResult = await runDekaJsDirect(compileResult.js)
  const diagnostics = compileResult.diagnostics.slice()
  if (!runResult.ok && runResult.error) {
    diagnostics.push({ severity: 'error', message: runResult.error })
  }
  return {
    ok: runResult.ok,
    stage: 'run',
    stdout: runResult.stdout,
    stderr: runResult.stderr,
    formattedCode: formatResult.ok ? formatResult.code : undefined,
    error: runResult.error,
    diagnostics,
  }
}

async function runNativeTest(
  cliPath: string,
  source: string,
  slug: string
): Promise<RuntimeResult> {
  const nativeResult = await runNativeCli(cliPath, source)

  // Native transpile does not expose per-stage diagnostics the same way as wasm.
  // If transpilation produced emitted JS, any remaining failure is a runtime
  // failure. If transpilation itself failed, the error is a parse/type error.
  const stage: HatsTestStage = nativeResult.transpileFailed ? 'parse' : 'run'

  return {
    ok: nativeResult.ok,
    stage,
    stdout: nativeResult.stdout,
    stderr: nativeResult.stderr,
    error: nativeResult.error,
    diagnostics: nativeResult.diagnostics,
  }
}

function computeOverallStatus(
  wasmMatches: boolean,
  nativeMatches: boolean,
  nativeAvailable: boolean
): 'pass' | 'fail' | 'divergent' {
  if (!nativeAvailable) {
    return wasmMatches ? 'pass' : 'fail'
  }
  if (wasmMatches && nativeMatches) return 'pass'
  if (!wasmMatches && !nativeMatches) return 'fail'
  return 'divergent'
}

function emptyNativeResult(): RuntimeResult {
  return {
    ok: false,
    stage: 'parse',
    stdout: '',
    stderr: '',
    diagnostics: [],
  }
}

let globalHatsCompiler: Awaited<ReturnType<typeof loadWasmCompiler>>
let loadAndRunPromise: Promise<HatsBuildResults> | null = null

export interface HatsBuildResults {
  nativeAvailable: boolean
  categories: HatsCategoryWithResults[]
}

async function runAllTestsOnce(): Promise<HatsBuildResults> {
  globalHatsCompiler = await loadWasmCompiler()
  const wasmManifest = (await (await fetch('https://wasm.deka.gg/latest/deka-compiler-artifact.json')).json()) as {
    compiler: { version: string }
  }
  console.log(`[hats build] wasm compiler version=${wasmManifest.compiler.version}`)
  const nativeCliPath = await prepareNativeCli(wasmManifest.compiler.version)

  const categories = loadAllTests()

  const results: HatsCategoryWithResults[] = []
  const nativeAvailable = nativeCliPath !== null

  for (const category of categories) {
    const tests: HatsTestWithBuildResult[] = []
    for (const test of category.tests) {
      const wasmResult = await runWasmTest(test.source, test.slug, test.files, test.entryPath)
      const nativeResult = nativeCliPath
        ? await runNativeTest(nativeCliPath, test.source, test.slug)
        : emptyNativeResult()

      const wasmMatches = runtimeMatchesExpectation(test, wasmResult)
      const nativeMatches = runtimeMatchesExpectation(test, nativeResult, { ignoreCode: true })

      tests.push({
        ...test,
        wasmResult,
        nativeResult,
        wasmMatches,
        nativeMatches,
        overallStatus: computeOverallStatus(wasmMatches, nativeMatches, nativeAvailable),
      })
    }
    results.push({ ...category, tests })
  }

  return { nativeAvailable, categories: results }
}

export async function loadAndRunAllTests(): Promise<HatsBuildResults> {
  if (!loadAndRunPromise) {
    loadAndRunPromise = runAllTestsOnce()
  }
  return loadAndRunPromise
}

/**
 * Load pre-computed conformance results from `public/hats-results.json`.
 * Falls back to running the suite directly when the file is missing (e.g. local
 * `bun run dev` before the first dump).
 */
export async function loadBuildResults(): Promise<HatsBuildResults> {
  const resultsPath = path.join(process.cwd(), 'public', 'hats-results.json')
  if (fs.existsSync(resultsPath)) {
    const raw = JSON.parse(fs.readFileSync(resultsPath, 'utf-8'))
    return { nativeAvailable: raw.nativeAvailable, categories: raw.categories }
  }
  return loadAndRunAllTests()
}
