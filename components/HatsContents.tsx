'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { HatsCategory } from '@/lib/tests'

interface HatsContentsProps {
  categories: HatsCategory[]
  currentSlug: string
  onSelect?: () => void
  onClose?: () => void
}

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim()
}

export function HatsContents({ categories, currentSlug, onSelect, onClose }: HatsContentsProps) {
  const [query, setQuery] = useState('')
  const normalizedQuery = normalize(query)

  const filteredCategories = useMemo(() => {
    if (normalizedQuery === '') return categories
    return categories
      .map((group) => ({
        ...group,
        tests: group.tests.filter(
          (test) =>
            test.title.toLowerCase().includes(normalizedQuery) ||
            test.slug.toLowerCase().includes(normalizedQuery) ||
            test.category.toLowerCase().includes(normalizedQuery)
        ),
      }))
      .filter((group) => group.tests.length > 0)
  }, [categories, normalizedQuery])

  const visibleCount = filteredCategories.reduce((sum, group) => sum + group.tests.length, 0)
  const totalCount = categories.reduce((sum, group) => sum + group.tests.length, 0)

  return (
    <div className="flex h-full flex-col bg-card text-card-foreground">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="text-lg font-semibold">Contents</h2>
        {onClose && (
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close contents">
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      <div className="border-b border-border p-4">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter tests…"
          className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm outline-none focus:border-ring focus:ring-1 focus:ring-ring"
        />
        {normalizedQuery !== '' && (
          <p className="mt-2 text-xs text-muted-foreground">
            {visibleCount} of {totalCount} tests shown
          </p>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <div className="space-y-5">
          {filteredCategories.map((group) => (
            <div key={group.name}>
              <h3 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {group.name}
              </h3>
              <ul className="space-y-0.5">
                {group.tests.map((test) => {
                  const active = test.slug === currentSlug
                  return (
                    <li key={test.slug}>
                      <Link
                        href={`/case/${test.slug}`}
                        onClick={onSelect}
                        className={`block rounded-md px-3 py-1.5 text-sm transition-colors ${
                          active
                            ? 'bg-primary text-primary-foreground'
                            : 'hover:bg-muted'
                        }`}
                      >
                        {test.title}
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          {filteredCategories.length === 0 && (
            <p className="text-sm text-muted-foreground">No tests match your filter.</p>
          )}
        </div>
      </div>
    </div>
  )
}
