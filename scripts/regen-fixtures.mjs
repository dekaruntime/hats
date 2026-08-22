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
    const ext = test.status === 'pass' ? 'pass.ds' : 'fail.ds'
    const sourcePath = path.join(testDir, `${baseName}.${ext}`)
    const source = fs.readFileSync(sourcePath, 'utf-8')

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
