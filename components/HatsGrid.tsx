'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import type { HatsCategoryWithResults, HatsTestWithBuildResult } from '@/lib/build-tests'

interface HatsGridProps {
  categories: HatsCategoryWithResults[]
  nativeAvailable: boolean
}

export function statusColor(status: 'pass' | 'fail' | 'divergent'): string {
  switch (status) {
    case 'pass':
      return 'bg-green-500'
    case 'divergent':
      return 'bg-pink-500'
    case 'fail':
      return 'bg-red-500'
  }
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

  const total = categories.flatMap((c) => c.tests).length
  const passing = categories.flatMap((c) => c.tests).filter((t) => t.overallStatus === 'pass').length
  const failing = categories.flatMap((c) => c.tests).filter((t) => t.overallStatus === 'fail').length
  const divergent = categories.flatMap((c) => c.tests).filter((t) => t.overallStatus === 'divergent').length
  const visibleCount = filteredCategories.flatMap((c) => c.tests).length

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-3">
        <h1 className="text-xl font-bold">deka test suite</h1>
        <div className="flex items-center gap-4">
          <p className="text-xs text-muted-foreground">
            {passing} passing · {failing} failing · {divergent} drift · {total} tests
            {!nativeAvailable && (
              <span className="ml-2 text-amber-500">native runtime unavailable</span>
            )}
          </p>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter tests…"
            className="w-48 rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
          />
        </div>
      </header>

      <main className="flex-1 overflow-auto p-6">
        {normalizedQuery !== '' && (
          <p className="mb-3 text-xs text-muted-foreground">
            {visibleCount} of {total} tests shown
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1">
          {filteredCategories.map((group) => (
            <span key={group.name} className="contents">
              <span className="mr-1 inline-flex items-center text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {group.name}
              </span>
              {group.tests.map((test) => (
                <Link
                  key={test.slug}
                  href={`/case/${test.slug}`}
                  title={`${test.title}\n${test.category} · wasm: ${test.wasmMatches ? 'match' : 'mismatch'} · native: ${test.nativeMatches ? 'match' : 'mismatch'}`}
                  className={`inline-flex size-4 rounded-sm transition-opacity hover:opacity-70 ${statusColor(test.overallStatus)}`}
                />
              ))}
              <a
                href={`https://github.com/dekaruntime/hats/new/main/tests/${group.name}`}
                target="_blank"
                rel="noopener noreferrer"
                title="Add a new test"
                className="inline-flex size-4 rounded-sm border border-dashed border-border bg-muted/50 transition-colors hover:bg-muted"
              />
            </span>
          ))}
          {filteredCategories.length === 0 && (
            <p className="text-muted-foreground">No tests match your filter.</p>
          )}
        </div>
      </main>
    </div>
  )
}
