import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadWasmCompiler, compileWithWasm, formatDsWithWasm } from '../lib/build-wasm.ts'
import { runJsInNode } from '../lib/run-js.ts'
import { loadAllTests } from '../lib/tests.ts'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const testsDir = path.join(__dirname, '..', 'tests')

const filters = process.argv.slice(2)

function slugMatches(slug) {
  if (filters.length === 0) return true
  return filters.some((f) => slug.includes(f))
}

const compiler = await loadWasmCompiler()
const skipped = []

function readJson(testDir, name) {
  const p = path.join(testDir, `${name}.json`)
  if (!fs.existsSync(p)) return {}
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch {
    return {}
  }
}

function writeJson(testDir, name, meta) {
  fs.writeFileSync(path.join(testDir, `${name}.json`), JSON.stringify(meta, null, 2) + '\n')
}

for (const category of loadAllTests()) {
  for (const test of category.tests) {
    if (!slugMatches(test.slug)) continue

    const testDir = path.join(testsDir, test.category, test.name)
    const baseName = test.name

    // Use the entry the loader already resolved. Multi-file tests (the whole
    // `modules` category) have an entry named main.pass.ds rather than
    // <dirname>.pass.ds, so constructing the filename from the directory name
    // is wrong for them -- and because this loop used to throw on the first
    // such directory, every category sorting after `modules` (parser, types,
    // unsafe, ...) was silently never regenerated. A stale fixture is worse
    // than a loud failure, so this both resolves correctly and refuses to die
    // on one bad directory.
    const ext = test.status === 'pass' ? 'pass.ds' : 'fail.ds'
    const sourcePath = test.entryPath
      ? path.join(testDir, test.entryPath)
      : path.join(testDir, `${baseName}.${ext}`)
    let source
    try {
      source = fs.readFileSync(sourcePath, 'utf-8')
    } catch (err) {
      console.log(`[regen] ${test.slug}: SKIPPED, cannot read ${path.relative(testsDir, sourcePath)}`)
      skipped.push(test.slug)
      continue
    }

    const compileResult = compileWithWasm(compiler, source, `${baseName}.ds`)
    const formatResult = formatDsWithWasm(compiler, source)

    const meta = readJson(testDir, baseName)
    meta.title = meta.title || baseName.replace(/_/g, ' ')

    if (test.status === 'pass') {
      if (!compileResult.ok || !compileResult.js) {
        console.log(`[regen] ${test.slug}: PASS test failed to compile: ${compileResult.error}`)
        meta.stage = 'parse'
        if (compileResult.error) {
          meta.expectedDiagnosticContains = compileResult.error
        }
        writeJson(testDir, baseName, meta)
        continue
      }
      const runResult = runJsInNode(compileResult.js)
      if (!runResult.ok) {
        console.log(`[regen] ${test.slug}: PASS test failed at runtime: ${runResult.error}`)
        meta.stage = 'run'
        if (runResult.error) {
          meta.expectedDiagnosticContains = runResult.error
        }
        writeJson(testDir, baseName, meta)
        continue
      }

      fs.writeFileSync(path.join(testDir, `${baseName}.stdout`), runResult.stdout)
      if (formatResult.ok && formatResult.code) {
        fs.writeFileSync(path.join(testDir, `${baseName}.code`), formatResult.code)
      }
      delete meta.expectedDiagnosticContains
      meta.stage = 'run'
      console.log(`[regen] ${test.slug}: stdout+code updated`)
    } else {
      // Fail test: capture the first error diagnostic.
      const firstError = compileResult.diagnostics.find((d) => d.severity === 'error')
      if (firstError) {
        meta.expectedDiagnosticContains = firstError.message
        meta.stage = 'parse'
      } else if (compileResult.error) {
        meta.expectedDiagnosticContains = compileResult.error
        meta.stage = 'parse'
      }
      console.log(`[regen] ${test.slug}: diagnostic updated`)
    }

    writeJson(testDir, baseName, meta)
  }
}

if (skipped.length > 0) {
  console.log(`\n[regen] ${skipped.length} test(s) skipped: ${skipped.join(', ')}`)
}
