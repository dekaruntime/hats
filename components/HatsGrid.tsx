'use client'

import { useMemo, useState } from 'react'
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

function normalizeSearch(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

function testMatches(query: string, test: HatsTestWithBuildResult): boolean {
  if (query === '') return true
  return (
    test.title.toLowerCase().includes(query) ||
    test.slug.toLowerCase().includes(query) ||
    test.category.toLowerCase().includes(query)
  )
}

export function HatsGrid({ categories, nativeAvailable }: HatsGridProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = normalizeSearch(query)

  const filteredCategories = useMemo(() => {
    if (normalizedQuery === '') return categories
    return categories
      .map((group) => ({
        ...group,
        tests: group.tests.filter((test) => testMatches(normalizedQuery, test)),
      }))
      .filter((group) => group.tests.length > 0)
  }, [categories, normalizedQuery])

  const allTests = categories.flatMap((c) => c.tests)
  const visibleTests = filteredCategories.flatMap((c) => c.tests)
  const total = allTests.length
  const passing = allTests.filter((t) => t.overallStatus === 'pass').length
  const failing = allTests.filter((t) => t.overallStatus === 'fail').length
  const divergent = allTests.filter((t) => t.overallStatus === 'divergent').length

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      {/* Contents sidebar */}
      <aside className="flex w-64 flex-col border-r border-border">
        <div className="border-b border-border p-4">
          <h2 className="mb-2 text-lg font-bold">HATS</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            {passing} passing · {failing} failing · {divergent} drift · {total} tests
            {!nativeAvailable && (
              <span className="block mt-1 text-amber-500">native runtime unavailable</span>
            )}
          </p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tests…"
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
          {normalizedQuery !== '' && (
            <p className="mt-2 text-xs text-muted-foreground">
              {visibleTests.length} of {total} tests shown
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="space-y-4">
            {filteredCategories.map((group) => (
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
            {filteredCategories.length === 0 && (
              <p className="text-sm text-muted-foreground">No tests match your filter.</p>
            )}
          </div>
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
          {filteredCategories.map((group) => (
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
          {filteredCategories.length === 0 && (
            <p className="text-muted-foreground">No tests match your filter.</p>
          )}
        </div>
      </main>
    </div>
  )
}
