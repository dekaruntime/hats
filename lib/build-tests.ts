import { loadWasmCompiler, compileWithWasm, formatDsWithWasm } from './build-wasm'
import { runDekaJsDirect } from './compiler/runtime'
import { loadAllTests, type HatsCategory, type HatsTest, type HatsTestStage } from './tests'

export interface BuildTestResult {
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
  result: BuildTestResult
  matchesExpectation: boolean
}

export interface HatsCategoryWithResults extends HatsCategory {
  tests: HatsTestWithBuildResult[]
}

function determineStage(
  ok: boolean,
  js?: string,
  error?: string,
  diagnostics?: BuildTestResult['diagnostics']
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

function matchesExpectation(test: HatsTest, result: BuildTestResult): boolean {
  if ((result.ok ? 'pass' : 'fail') !== test.status) return false
  if (result.stage !== test.stage) return false

  if (test.expectedStdout !== undefined) {
    if (!exactMatch(result.stdout, test.expectedStdout)) return false
  }

  if (test.expectedCode !== undefined) {
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

async function runTestSource(
  source: string,
  slug: string
): Promise<BuildTestResult> {
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
  return {
    ok: runResult.ok,
    stage: 'run',
    stdout: runResult.stdout,
    stderr: runResult.stderr,
    formattedCode: formatResult.ok ? formatResult.code : undefined,
    error: runResult.error,
    diagnostics: compileResult.diagnostics,
  }
}

let globalHatsCompiler: Awaited<ReturnType<typeof loadWasmCompiler>>

export async function loadAndRunAllTests(): Promise<HatsCategoryWithResults[]> {
  globalHatsCompiler = await loadWasmCompiler()
  const categories = loadAllTests()

  const results: HatsCategoryWithResults[] = []
  for (const category of categories) {
    const tests: HatsTestWithBuildResult[] = []
    for (const test of category.tests) {
      const result = await runTestSource(test.source, test.slug)
      tests.push({
        ...test,
        result,
        matchesExpectation: matchesExpectation(test, result),
      })
    }
    results.push({ ...category, tests })
  }

  return results
}
