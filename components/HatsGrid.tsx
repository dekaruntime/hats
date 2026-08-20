'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { Play, CheckCircle2, XCircle, Loader2, Plus } from 'lucide-react'
import { compileDeka, runDekaJs, formatDekaDs } from '@/lib/compiler/runtime'
import type { HatsCategory, HatsTest, HatsTestStage } from '@/lib/tests'

interface RunResult {
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

interface HatsTestWithResult extends HatsTest {
  result?: RunResult
  matchesExpectation: boolean
  isRunning?: boolean
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
    formattedCode,
    error: runResult.error,
    diagnostics: compileResult.diagnostics,
  }
}

function exactMatch(actual: string, expected: string): boolean {
  return actual === expected
}

function testMatchesExpectation(test: HatsTest, result: RunResult): boolean {
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

interface HatsGridProps {
  categories: HatsCategory[]
}

export function HatsGrid({ categories }: HatsGridProps) {
  const [tests, setTests] = useState<HatsTestWithResult[]>(() =>
    categories.flatMap((c) => c.tests.map((t) => ({ ...t, matchesExpectation: false })))
  )
  const [runningAll, setRunningAll] = useState(false)

  const runOne = useCallback(async (test: HatsTestWithResult) => {
    setTests((prev) => prev.map((t) => (t.slug === test.slug ? { ...t, isRunning: true } : t)))
    const result = await runTest(test)
    const matches = testMatchesExpectation(test, result)
    setTests((prev) =>
      prev.map((t) =>
        t.slug === test.slug ? { ...t, result, matchesExpectation: matches, isRunning: false } : t
      )
    )
  }, [])

  const runAll = useCallback(async () => {
    setRunningAll(true)
    for (const test of tests) {
      await runOne(test)
    }
    setRunningAll(false)
  }, [tests, runOne])

  const grouped = useMemo(() => {
    const groups = new Map<string, HatsTestWithResult[]>()
    for (const test of tests) {
      if (!groups.has(test.category)) groups.set(test.category, [])
      groups.get(test.category)!.push(test)
    }
    return categories
      .map((c) => ({ name: c.name, tests: groups.get(c.name) ?? [] }))
      .filter((g) => g.tests.length > 0)
  }, [tests, categories])

  const summary = useMemo(() => {
    const run = tests.filter((t) => t.result).length
    const passing = tests.filter((t) => t.result && t.matchesExpectation).length
    const failing = tests.filter((t) => t.result && !t.matchesExpectation).length
    return { run, passing, failing, total: tests.length }
  }, [tests])

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">HATS</h1>
            <p className="text-sm text-muted-foreground">Human Aided Test Suite for DekaScript</p>
          </div>
          <div className="flex items-center gap-4">
            {summary.run > 0 && (
              <div className="flex gap-3 text-sm">
                <span className="text-green-600 dark:text-green-400">{summary.passing} passing</span>
                <span className="text-red-600 dark:text-red-400">{summary.failing} failing</span>
                <span className="text-muted-foreground">{summary.run}/{summary.total} run</span>
              </div>
            )}
            <button
              onClick={runAll}
              disabled={runningAll}
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {runningAll ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Play className="size-4" />
              )}
              Run all
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="space-y-10">
          {grouped.map((group) => (
            <section key={group.name}>
              <div className="mb-4 flex items-center gap-3">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                  {group.name}
                </h2>
                <a
                  href={`https://github.com/dekaruntime/hats/tree/main/tests/${group.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  edit on github
                </a>
              </div>
              <div className="flex flex-wrap gap-2">
                {group.tests.map((test) => (
                  <Link
                    key={test.slug}
                    href={`/case/${test.slug}`}
                    title={test.title}
                    className={`
                      flex size-14 items-center justify-center rounded-lg border transition-all hover:scale-105
                      ${
                        test.result
                          ? test.matchesExpectation
                            ? 'border-green-500/50 bg-green-500/15'
                            : 'border-red-500/50 bg-red-500/15'
                          : 'border-border bg-muted'
                      }
                    `}
                  >
                    {test.isRunning ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : test.result ? (
                      test.matchesExpectation ? (
                        <CheckCircle2 className="size-6 text-green-600 dark:text-green-400" />
                      ) : (
                        <XCircle className="size-6 text-red-600 dark:text-red-400" />
                      )
                    ) : (
                      <span className="text-[10px] font-medium uppercase text-muted-foreground">
                        {test.status}
                      </span>
                    )}
                  </Link>
                ))}
                <a
                  href={`https://github.com/dekaruntime/hats/new/main/tests/${group.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex size-14 items-center justify-center rounded-lg border border-dashed border-border bg-muted/50 text-muted-foreground transition-colors hover:bg-muted"
                >
                  <Plus className="size-5" />
                </a>
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
