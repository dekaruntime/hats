'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Play, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { compileDeka, runDekaJs, formatDekaDs } from '@/lib/compiler/runtime'
import type { HatsTest, HatsTestStage } from '@/lib/tests'

interface RunResult {
  ok: boolean
  stage: HatsTestStage
  stdout: string
  stderr: string
  js?: string
  formattedCode?: string
  error?: string
  diagnostics: Array<{
    severity: 'error' | 'warning' | 'info'
    message: string
    line?: number
    column?: number
  }>
}

function determineStage(ok: boolean, js?: string, error?: string, diagnostics?: RunResult['diagnostics']): HatsTestStage {
  if (ok) return 'run'
  if (error && error.length > 0 && (!js || js.length === 0)) return 'parse'
  const hasErrors = (diagnostics ?? []).some((d) => d.severity === 'error')
  if (hasErrors) return !js || js.length === 0 ? 'parse' : 'typecheck'
  return 'parse'
}

async function runTest(test: HatsTest): Promise<RunResult> {
  const [compileResult, formatted] = await Promise.all([
    compileDeka(test.source, `${test.slug}.ds`),
    formatDekaDs(test.source),
  ])

  const formattedCode = formatted.ok ? formatted.code : undefined

  if (!compileResult.ok || !compileResult.js) {
    return {
      ok: false,
      stage: determineStage(false, compileResult.js, compileResult.error, compileResult.diagnostics),
      stdout: '',
      stderr: '',
      formattedCode,
      error: compileResult.error,
      diagnostics: compileResult.diagnostics,
    }
  }

  const runResult = await runDekaJs(compileResult.js)
  return {
    ok: runResult.ok,
    stage: 'run',
    stdout: runResult.stdout,
    stderr: runResult.stderr,
    js: compileResult.js,
    formattedCode,
    error: runResult.error,
    diagnostics: compileResult.diagnostics,
  }
}

function exactMatch(actual: string, expected: string): boolean {
  return actual === expected
}

function matchesExpectation(test: HatsTest, result: RunResult): boolean {
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

interface CaseRunnerProps {
  test: HatsTest
}

export function CaseRunner({ test }: CaseRunnerProps) {
  const [source, setSource] = useState(test.source)
  const [result, setResult] = useState<RunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [rawVisible, setRawVisible] = useState(false)

  useEffect(() => {
    setSource(test.source)
    setResult(null)
  }, [test])

  const handleRun = useCallback(async () => {
    setRunning(true)
    const res = await runTest({ ...test, source })
    setResult(res)
    setRunning(false)
  }, [test, source])

  const handleFormat = useCallback(async () => {
    const formatted = await formatDekaDs(source)
    if (formatted.ok && formatted.code) {
      setSource(formatted.code)
    }
  }, [source])

  const expectationMet = result ? matchesExpectation({ ...test, source }, result) : null

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{test.title}</h1>
            <p className="text-sm text-muted-foreground">
              {test.category} · expected {test.status} at {test.stage}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-7xl gap-6 px-6 py-6 lg:grid-cols-2">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Source</h2>
            <div className="flex gap-2">
              <button
                onClick={handleFormat}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
              >
                Format
              </button>
              <button
                onClick={handleRun}
                disabled={running}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {running ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                Run
              </button>
            </div>
          </div>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            rows={24}
            className="w-full rounded-md border border-input bg-background p-4 font-mono text-sm"
          />
        </div>

        <div className="space-y-4">
          {result && (
            <div
              className={`rounded-lg border p-4 ${
                expectationMet
                  ? 'border-green-500/50 bg-green-500/10'
                  : 'border-red-500/50 bg-red-500/10'
              }`}
            >
              <div className="flex items-center gap-2 font-semibold">
                {expectationMet ? (
                  <>
                    <CheckCircle2 className="size-5 text-green-600 dark:text-green-400" />
                    <span>Matches expectation</span>
                  </>
                ) : (
                  <>
                    <XCircle className="size-5 text-red-600 dark:text-red-400" />
                    <span>Does not match expectation</span>
                  </>
                )}
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                Got {result.ok ? 'pass' : 'fail'} at {result.stage}
              </div>
            </div>
          )}

          <div>
            <h3 className="mb-2 font-semibold">Expected</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Status:</dt>
                <dd>{test.status}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="text-muted-foreground">Stage:</dt>
                <dd>{test.stage}</dd>
              </div>
              {test.expectedStdout !== undefined && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Stdout:</dt>
                  <dd className="font-mono">{JSON.stringify(test.expectedStdout)}</dd>
                </div>
              )}
              {test.expectedCode !== undefined && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Code:</dt>
                  <dd className="font-mono">{JSON.stringify(test.expectedCode)}</dd>
                </div>
              )}
              {test.expectedDiagnosticContains && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Diagnostic:</dt>
                  <dd className="font-mono">{test.expectedDiagnosticContains}</dd>
                </div>
              )}
              {test.notes && (
                <div className="flex gap-2">
                  <dt className="text-muted-foreground">Notes:</dt>
                  <dd>{test.notes}</dd>
                </div>
              )}
            </dl>
          </div>

          {result && (
            <>
              <div>
                <h3 className="mb-2 font-semibold">Output</h3>
                {result.stdout ? (
                  <pre className="rounded-md bg-muted p-3 text-sm">{result.stdout}</pre>
                ) : (
                  <p className="text-sm text-muted-foreground">(no stdout)</p>
                )}
                {result.error && (
                  <p className="mt-2 text-sm text-destructive">{result.error}</p>
                )}
              </div>

              {result.diagnostics.length > 0 && (
                <div>
                  <h3 className="mb-2 font-semibold">Diagnostics</h3>
                  <div className="space-y-1">
                    {result.diagnostics.map((d, i) => (
                      <div key={i} className="rounded-md bg-muted p-2 text-sm">
                        <span className="font-semibold">{d.severity}</span>: {d.message}
                        {d.line && (
                          <span className="text-muted-foreground">
                            {' '}
                            at {d.line}:{d.column}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {result.formattedCode !== undefined && (
                <div>
                  <h3 className="mb-2 font-semibold">Formatted code</h3>
                  <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                    {result.formattedCode}
                  </pre>
                </div>
              )}

              {result.js && (
                <div>
                  <button
                    onClick={() => setRawVisible((v) => !v)}
                    className="mb-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
                  >
                    {rawVisible ? 'Hide' : 'Show'} emitted JS
                  </button>
                  {rawVisible && (
                    <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
                      {result.js}
                    </pre>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}
