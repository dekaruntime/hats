import fs from 'fs'
import path from 'path'

export type HatsTestStatus = 'pass' | 'fail'

export type HatsTestStage = 'parse' | 'typecheck' | 'run'

export interface HatsTest {
  slug: string
  category: string
  status: HatsTestStatus
  filename: string
  source: string
  title: string
  stage: HatsTestStage
  expectedOutput?: string
  expectedDiagnosticContains?: string
  notes?: string
}

export interface HatsCategory {
  name: string
  tests: HatsTest[]
}

const TESTS_DIR = path.join(process.cwd(), 'tests')

function parseStatusFromFilename(filename: string): HatsTestStatus | null {
  if (filename.endsWith('.pass.ds')) return 'pass'
  if (filename.endsWith('.fail.ds')) return 'fail'
  return null
}

function baseNameFromFilename(filename: string): string {
  return filename.replace(/\.(pass|fail)\.ds$/, '')
}

function slugFromParts(category: string, baseName: string): string {
  return `${category}-${baseName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-')
}

function extractExpectedOutputFromComments(source: string): string | undefined {
  const lines = source.split('\n')
  let collecting = false
  const outputLines: string[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.toLowerCase().startsWith('// expected stdout:')) {
      collecting = true
      const remainder = trimmed.slice('// expected stdout:'.length).trim()
      if (remainder.length > 0) {
        outputLines.push(remainder)
      }
      continue
    }
    if (collecting) {
      if (trimmed.startsWith('//')) {
        const content = trimmed.slice(2).trimStart()
        outputLines.push(content)
      } else if (trimmed === '') {
        // Preserve blank lines inside the expected output block.
        outputLines.push('')
      } else {
        break
      }
    }
  }

  if (outputLines.length === 0) return undefined
  return outputLines.join('\n').trimEnd() + '\n'
}

function readMetadata(
  dir: string,
  baseName: string,
  status: HatsTestStatus,
  source: string
): Partial<HatsTest> {
  const jsonPath = path.join(dir, `${baseName}.${status}.json`)
  const fromComments = extractExpectedOutputFromComments(source)
  const fromJson: Partial<HatsTest> = {}

  if (fs.existsSync(jsonPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
      fromJson.title = typeof raw.title === 'string' ? raw.title : undefined
      fromJson.stage = ['parse', 'typecheck', 'run'].includes(raw.stage) ? raw.stage : undefined
      fromJson.expectedOutput =
        typeof raw.expectedOutput === 'string' ? raw.expectedOutput : undefined
      fromJson.expectedDiagnosticContains =
        typeof raw.expectedDiagnosticContains === 'string' ? raw.expectedDiagnosticContains : undefined
      fromJson.notes = typeof raw.notes === 'string' ? raw.notes : undefined
    } catch {
      // ignore malformed JSON
    }
  }

  return {
    title: fromJson.title,
    stage: fromJson.stage,
    expectedOutput: fromComments ?? fromJson.expectedOutput,
    expectedDiagnosticContains: fromJson.expectedDiagnosticContains,
    notes: fromJson.notes,
  }
}

export function loadAllTests(): HatsCategory[] {
  if (!fs.existsSync(TESTS_DIR)) return []

  const categories: HatsCategory[] = []
  const entries = fs.readdirSync(TESTS_DIR, { withFileTypes: true })

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const categoryName = entry.name
    const categoryDir = path.join(TESTS_DIR, categoryName)
    const files = fs.readdirSync(categoryDir)

    const tests: HatsTest[] = []
    for (const file of files) {
      const status = parseStatusFromFilename(file)
      if (!status) continue
      const baseName = baseNameFromFilename(file)
      const sourcePath = path.join(categoryDir, file)
      const source = fs.readFileSync(sourcePath, 'utf-8')
      const metadata = readMetadata(categoryDir, baseName, status, source)

      tests.push({
        slug: slugFromParts(categoryName, baseName),
        category: categoryName,
        status,
        filename: file,
        source,
        title: metadata.title ?? baseName.replace(/_/g, ' '),
        stage: metadata.stage ?? 'run',
        expectedOutput: metadata.expectedOutput,
        expectedDiagnosticContains: metadata.expectedDiagnosticContains,
        notes: metadata.notes,
      })
    }

    if (tests.length > 0) {
      tests.sort((a, b) => a.filename.localeCompare(b.filename))
      categories.push({ name: categoryName, tests })
    }
  }

  categories.sort((a, b) => a.name.localeCompare(b.name))
  return categories
}

export function loadTestBySlug(slug: string): HatsTest | undefined {
  for (const category of loadAllTests()) {
    const test = category.tests.find((t) => t.slug === slug)
    if (test) return test
  }
  return undefined
}

export function getAllSlugs(): string[] {
  return loadAllTests().flatMap((c) => c.tests.map((t) => t.slug))
}
