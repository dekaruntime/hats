import Link from 'next/link'
import type { HatsCategoryWithResults, HatsTestWithBuildResult } from '@/lib/build-tests'

interface HatsGridProps {
  categories: HatsCategoryWithResults[]
  nativeAvailable: boolean
}

function statusColor(status: 'pass' | 'fail' | 'divergent'): string {
  switch (status) {
    case 'pass':
      return 'bg-green-500'
    case 'divergent':
      return 'bg-pink-500'
    case 'fail':
      return 'bg-red-500'
  }
}

function TestLink({ test }: { test: HatsTestWithBuildResult }) {
  return (
    <Link
      href={`/case/${test.slug}`}
      className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent"
    >
      <span className={`size-2.5 rounded-sm ${statusColor(test.overallStatus)}`} />
      <span className="truncate">{test.title}</span>
      <span className="ml-auto text-[10px] text-muted-foreground">
        {test.overallStatus === 'pass' ? 'both' : test.overallStatus === 'fail' ? 'both fail' : 'drift'}
      </span>
    </Link>
  )
}

export function HatsGrid({ categories, nativeAvailable }: HatsGridProps) {
  const allTests = categories.flatMap((c) => c.tests)
  const total = allTests.length
  const passing = allTests.filter((t) => t.overallStatus === 'pass').length
  const failing = allTests.filter((t) => t.overallStatus === 'fail').length
  const divergent = allTests.filter((t) => t.overallStatus === 'divergent').length

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Contents sidebar */}
      <aside className="w-64 border-r border-border p-4">
        <h2 className="mb-4 text-lg font-bold">HATS</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          {passing} passing · {failing} failing · {divergent} drift · {total} tests
          {!nativeAvailable && (
            <span className="block mt-1 text-amber-500">native runtime unavailable</span>
          )}
        </p>
        <div className="space-y-4">
          {categories.map((group) => (
            <div key={group.name}>
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {group.name}
                </h3>
                <span className="text-[10px] text-muted-foreground">
                  {group.tests.filter((t) => t.overallStatus === 'pass').length}/{group.tests.length}
                </span>
              </div>
              <div className="space-y-0.5">
                {group.tests.map((test) => (
                  <TestLink key={test.slug} test={test} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main grid */}
      <main className="flex-1 p-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Conformance</h1>
          <p className="text-sm text-muted-foreground">
            Each square is a test. Green = both runtimes agree on pass. Red = both agree on fail. Pink = wasm/native drift.
            {!nativeAvailable && ' Native runtime is unavailable in this build environment, so drift detection is disabled.'}
          </p>
        </div>

        <div className="space-y-8">
          {categories.map((group) => (
            <section key={group.name}>
              <div className="mb-2 flex items-center gap-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {group.name}
                </h2>
                <span className="text-xs text-muted-foreground">
                  {group.tests.filter((t) => t.overallStatus === 'pass').length}/{group.tests.length}
                </span>
              </div>
              <div className="flex flex-wrap gap-1">
                {group.tests.map((test) => (
                  <Link
                    key={test.slug}
                    href={`/case/${test.slug}`}
                    title={`${test.title}\n${test.category} · wasm: ${test.wasmMatches ? 'match' : 'mismatch'} · native: ${test.nativeMatches ? 'match' : 'mismatch'}`}
                    className={`size-3.5 rounded-sm transition-opacity hover:opacity-70 ${statusColor(test.overallStatus)}`}
                  />
                ))}
                <a
                  href={`https://github.com/dekaruntime/hats/new/main/tests/${group.name}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Add a new test"
                  className="size-3.5 rounded-sm border border-dashed border-border bg-muted/50 transition-colors hover:bg-muted"
                />
              </div>
            </section>
          ))}
        </div>
      </main>
    </div>
  )
}
