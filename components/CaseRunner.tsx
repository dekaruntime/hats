'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, List, XCircle } from 'lucide-react'
import { EditorPanel } from './EditorPanel'
import { HatsContents } from './HatsContents'
import { TourOutputPanel } from './TourOutputPanel'
import { ResizableSplitter } from './ResizableSplitter'
import { Button } from '@/components/ui/button'
import {
  compileDeka,
  runDekaJs,
  formatDekaDs,
  formatDekaJs,
  formatRawJs,
  type CompilerDiagnostic,
} from '@/lib/compiler/runtime'
import { terminateSharedSandbox } from '@/lib/compiler/sandbox'
import type { HatsCategory, HatsTest } from '@/lib/tests'

interface RunResult {
  ok: boolean
  stdout: string
  stderr: string
  js?: string
  error?: string
  diagnostics: CompilerDiagnostic[]
}

const LEFT_WIDTH_KEY = 'deka.hats.leftWidth'
const OUTPUT_HEIGHT_KEY = 'deka.hats.outputHeight'
const AUTORUN_DEBOUNCE_MS = 350
const MIN_LEFT_WIDTH = 280
const MIN_MIDDLE_WIDTH = 320
const MIN_EDITOR_HEIGHT = 160
const MIN_OUTPUT_HEIGHT = 120

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function exactMatch(actual: string, expected: string): boolean {
  return actual === expected
}

function determineStage(js: string | undefined, diagnostics: CompilerDiagnostic[]): 'parse' | 'typecheck' | 'run' {
  if (!js || js.length === 0) return 'parse'
  const hasErrors = diagnostics.some((d) => d.severity === 'error')
  if (hasErrors) return 'typecheck'
  return 'run'
}

function matchesExpectation(test: HatsTest, result: RunResult, stage: 'parse' | 'typecheck' | 'run', formattedCode?: string): boolean {
  if ((result.ok ? 'pass' : 'fail') !== test.status) return false
  if (stage !== test.stage) return false

  if (test.expectedStdout !== undefined) {
    if (!exactMatch(result.stdout, test.expectedStdout)) return false
  }

  if (test.expectedCode !== undefined) {
    if (!exactMatch(formattedCode ?? '', test.expectedCode)) return false
  }

  if (test.expectedDiagnosticContains) {
    const hasDiagnostic = result.diagnostics.some((d) =>
      d.message.toLowerCase().includes(test.expectedDiagnosticContains!.toLowerCase())
    )
    if (!hasDiagnostic) return false
  }

  return true
}

export function CaseRunner({ test, categories }: { test: HatsTest; categories: HatsCategory[] }) {
  const [source, setSource] = useState(test.source)
  const [contentsOpen, setContentsOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [output, setOutput] = useState<{ stdout: string; stderr: string; error?: string }>({
    stdout: '',
    stderr: '',
  })
  const [compileState, setCompileState] = useState<{
    js?: string
    displayJs?: string
    error?: string
    diagnostics?: CompilerDiagnostic[]
    isCompiling: boolean
    compiler?: { name: string; version: string; sourceCommit: string }
  }>({ isCompiling: false })

  const containerRef = useRef<HTMLDivElement>(null)
  const middlePaneRef = useRef<HTMLDivElement>(null)
  const runRef = useRef<Promise<void> | null>(null)
  const autorunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rerunRequestedRef = useRef(false)
  const latestSourceRef = useRef(source)
  const sourceVersionRef = useRef(0)
  const isMountedRef = useRef(true)

  latestSourceRef.current = source

  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof window === 'undefined') return 360
    return clamp(Number(localStorage.getItem(LEFT_WIDTH_KEY)) || 360, MIN_LEFT_WIDTH, 520)
  })
  const [outputHeight, setOutputHeight] = useState(() => {
    if (typeof window === 'undefined') return 0.4
    const saved = Number(localStorage.getItem(OUTPUT_HEIGHT_KEY))
    return Number.isFinite(saved) && saved > 0 && saved < 1 ? saved : 0.4
  })

  const executeRun = useCallback(async () => {
    if (runRef.current) {
      rerunRequestedRef.current = true
      return
    }

    const runOnce = async () => {
      rerunRequestedRef.current = false
      const currentSource = latestSourceRef.current
      const sourceVersion = sourceVersionRef.current
      const isCurrentSource = () => isMountedRef.current && sourceVersion === sourceVersionRef.current

      setIsRunning(true)
      setCompileState({ isCompiling: true })
      setOutput((prev) => ({ ...prev, error: undefined }))

      try {
        const compileResult = await compileDeka(currentSource, `${test.slug}.ds`)
        if (!isCurrentSource()) return

        if (!compileResult.ok || !compileResult.js) {
          setCompileState({
            isCompiling: false,
            error: compileResult.error || 'Compilation failed with no error message.',
            diagnostics: compileResult.diagnostics,
            compiler: compileResult.compiler
              ? {
                  name: compileResult.compiler.name ?? 'deka',
                  version: compileResult.compiler.version ?? '0.0.0',
                  sourceCommit: compileResult.compiler.sourceCommit ?? '',
                }
              : undefined,
          })
          setOutput({
            stdout: '',
            stderr: '',
            error: compileResult.error || 'Compilation failed with no error message.',
          })
          return
        }

        // Option A: only format source when the compiler has accepted it.
        const dsFormatResult = await formatDekaDs(currentSource)
        if (dsFormatResult.ok && dsFormatResult.code && dsFormatResult.code !== currentSource) {
          setSource(dsFormatResult.code)
        }

        const strippedJs = formatRawJs(compileResult.js)
        const formatResult = await formatDekaJs(strippedJs)
        setCompileState({
          js: compileResult.js,
          displayJs: formatResult.ok && formatResult.code ? formatResult.code : strippedJs,
          isCompiling: false,
          diagnostics: compileResult.diagnostics,
          compiler: compileResult.compiler
            ? {
                name: compileResult.compiler.name ?? 'deka',
                version: compileResult.compiler.version ?? '0.0.0',
                sourceCommit: compileResult.compiler.sourceCommit ?? '',
              }
            : undefined,
        })

        const runResult = await runDekaJs(compileResult.js, {
          cwd: '/hats',
          env: {},
        })

        if (!isCurrentSource()) return

        setOutput({
          stdout: runResult.stdout,
          stderr: runResult.stderr,
          error: runResult.error,
        })
      } catch (err) {
        if (!isCurrentSource()) return
        setCompileState((prev) => ({
          ...prev,
          isCompiling: false,
          error: err instanceof Error ? err.message : String(err),
          diagnostics: [],
        }))
        setOutput({
          stdout: '',
          stderr: '',
          error: err instanceof Error ? err.message : String(err),
        })
      } finally {
        if (isCurrentSource()) {
          setIsRunning(false)
        }
      }
    }

    const runPromise = (async () => {
      do {
        await runOnce()
      } while (rerunRequestedRef.current)
    })()

    runRef.current = runPromise
    await runPromise
    runRef.current = null
  }, [test.slug])

  const scheduleAutorun = useCallback(() => {
    if (autorunTimerRef.current) {
      clearTimeout(autorunTimerRef.current)
    }
    rerunRequestedRef.current = true
    autorunTimerRef.current = setTimeout(() => {
      autorunTimerRef.current = null
      void executeRun()
    }, AUTORUN_DEBOUNCE_MS)
  }, [executeRun])

  const handleSourceChange = useCallback(
    (value: string) => {
      sourceVersionRef.current += 1
      setSource(value)
      setCompileState({ isCompiling: true })
      scheduleAutorun()
    },
    [scheduleAutorun]
  )

  const handleClear = useCallback(() => {
    setOutput({ stdout: '', stderr: '' })
  }, [])

  useEffect(() => {
    isMountedRef.current = true
    setSource(test.source)
    sourceVersionRef.current += 1
    setOutput({ stdout: '', stderr: '' })
    setCompileState({ isCompiling: true })
    const timer = setTimeout(() => {
      void executeRun()
    }, 50)
    return () => {
      isMountedRef.current = false
      clearTimeout(timer)
      if (autorunTimerRef.current) {
        clearTimeout(autorunTimerRef.current)
      }
    }
  }, [test.slug, test.source, executeRun])

  useEffect(() => {
    return () => {
      terminateSharedSandbox()
    }
  }, [])

  const stage = determineStage(compileState.js, compileState.diagnostics ?? [])

  const result: RunResult = {
    ok: compileState.error === undefined && output.error === undefined && compileState.js !== undefined,
    stdout: output.stdout,
    stderr: output.stderr,
    js: compileState.js,
    error: output.error ?? compileState.error,
    diagnostics: compileState.diagnostics ?? [],
  }

  const expectationMet = matchesExpectation(test, result, stage, source)

  const handleLeftResize = useCallback(
    (delta: number) => {
      if (!containerRef.current) return
      const total = containerRef.current.clientWidth
      const minTotal = MIN_LEFT_WIDTH + MIN_MIDDLE_WIDTH + 4
      if (total <= minTotal) return
      const newWidth = clamp(leftWidth + delta, MIN_LEFT_WIDTH, total - MIN_MIDDLE_WIDTH - 4)
      setLeftWidth(newWidth)
      localStorage.setItem(LEFT_WIDTH_KEY, String(newWidth))
    },
    [leftWidth]
  )

  const handleVerticalResize = useCallback(
    (delta: number) => {
      if (!middlePaneRef.current) return
      const total = middlePaneRef.current.clientHeight
      if (total <= MIN_EDITOR_HEIGHT + MIN_OUTPUT_HEIGHT + 4) return
      const currentOutputPx = outputHeight * total
      const newOutputPx = clamp(currentOutputPx - delta, MIN_OUTPUT_HEIGHT, total - MIN_EDITOR_HEIGHT - 4)
      const newRatio = newOutputPx / total
      setOutputHeight(newRatio)
      localStorage.setItem(OUTPUT_HEIGHT_KEY, String(newRatio))
    },
    [outputHeight]
  )

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background text-foreground">
      <header className="border-b border-border px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </Link>
          <div>
            <h1 className="text-lg font-bold">{test.title}</h1>
            <p className="text-xs text-muted-foreground">
              {test.category} · expected {test.status} at {test.stage}
            </p>
          </div>
        </div>
      </header>

      <div
        ref={containerRef}
        className="grid flex-1 overflow-hidden"
        style={{ gridTemplateColumns: `${leftWidth}px 4px 1fr`, gridTemplateRows: '1fr' }}
      >
        {/* Left pane: test metadata and expectations */}
        <aside className="flex h-full min-w-0 flex-col border-r border-border bg-card">
          {contentsOpen ? (
            <HatsContents
              categories={categories}
              currentSlug={test.slug}
              onSelect={() => setContentsOpen(false)}
              onClose={() => setContentsOpen(false)}
            />
          ) : (
            <>
              <div className="flex-1 space-y-4 overflow-auto p-4">
                {compileState.isCompiling ? null : (
                  <div
                    className={`rounded-lg border p-3 ${
                      expectationMet
                        ? 'border-green-500/50 bg-green-500/10'
                        : 'border-red-500/50 bg-red-500/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      {expectationMet ? (
                        <>
                          <CheckCircle2 className="size-4 text-green-600 dark:text-green-400" />
                          <span>Matches expectation</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="size-4 text-red-600 dark:text-red-400" />
                          <span>Does not match</span>
                        </>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Got {result.ok ? 'pass' : 'fail'} at {stage}
                    </div>
                  </div>
                )}

                <div>
                  <h2 className="mb-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">Expected</h2>
                  <dl className="space-y-2 text-sm">
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Status:</dt>
                      <dd className="font-medium">{test.status}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground">Stage:</dt>
                      <dd className="font-medium">{test.stage}</dd>
                    </div>
                    {test.expectedStdout !== undefined && (
                      <div className="flex flex-col gap-1">
                        <dt className="text-muted-foreground">Stdout:</dt>
                        <dd className="rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">{test.expectedStdout}</dd>
                      </div>
                    )}
                    {test.expectedCode !== undefined && (
                      <div className="flex flex-col gap-1">
                        <dt className="text-muted-foreground">Formatted code:</dt>
                        <dd className="rounded bg-muted p-2 font-mono text-xs whitespace-pre-wrap">{test.expectedCode}</dd>
                      </div>
                    )}
                    {test.expectedDiagnosticContains && (
                      <div className="flex flex-col gap-1">
                        <dt className="text-muted-foreground">Diagnostic contains:</dt>
                        <dd className="rounded bg-muted p-2 font-mono text-xs">{test.expectedDiagnosticContains}</dd>
                      </div>
                    )}
                    {test.notes && (
                      <div className="flex flex-col gap-1">
                        <dt className="text-muted-foreground">Notes:</dt>
                        <dd className="text-muted-foreground">{test.notes}</dd>
                      </div>
                    )}
                  </dl>
                </div>
              </div>

              <div className="sticky bottom-0 z-10 border-t border-border bg-card/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-card/80">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setContentsOpen(true)}
                  className="w-full gap-1.5"
                >
                  <List className="h-4 w-4" />
                  Contents
                </Button>
              </div>
            </>
          )}
        </aside>

        <ResizableSplitter direction="vertical" onResize={handleLeftResize} />

        {/* Middle pane: editor + output */}
        <div
          ref={middlePaneRef}
          className="grid h-full min-w-0 flex-col overflow-hidden"
          style={{
            gridTemplateRows: `minmax(0, ${1 - outputHeight}fr) 4px minmax(0, ${outputHeight}fr)`,
          }}
        >
          <div className="min-h-0 overflow-hidden">
            <EditorPanel
              source={source}
              filename={`${test.slug}.ds`}
              onChange={handleSourceChange}
              onRun={executeRun}
              isRunning={isRunning}
              compiler={compileState.compiler}
              formatOnKeystroke={false}
            />
          </div>

          <ResizableSplitter direction="horizontal" onResize={handleVerticalResize} />

          <div className="min-h-0 overflow-hidden">
            <TourOutputPanel
              stdout={output.stdout}
              stderr={output.stderr}
              error={output.error}
              diagnostics={compileState.diagnostics}
              onClear={handleClear}
              displayJs={compileState.displayJs}
              compileError={compileState.error}
              isCompiling={compileState.isCompiling}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
