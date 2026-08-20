import fs from 'fs'
import path from 'path'
import { loadWasmCompiler, compileWithWasm, formatDsWithWasm } from '../lib/build-wasm.ts'
import { runDekaJsDirect } from '../lib/compiler/runtime.ts'

const category = process.argv[2]
const name = process.argv[3]
if (!category || !name) {
  console.error('usage: bun scripts/convert-to-pass.mjs <category> <name>')
  process.exit(1)
}

const testDir = path.join('tests', category, name)
const oldDs = path.join(testDir, `${name}.fail.ds`)
const newDs = path.join(testDir, `${name}.pass.ds`)

if (!fs.existsSync(oldDs)) {
  console.error(`File not found: ${oldDs}`)
  process.exit(1)
}

const source = fs.readFileSync(oldDs, 'utf-8')
const compiler = await loadWasmCompiler()
const compileResult = compileWithWasm(compiler, source, `${name}.ds`)
const formatResult = formatDsWithWasm(compiler, source)

if (!compileResult.ok || !compileResult.js) {
  console.error(`Compile failed for ${category}/${name}:`, compileResult.error)
  process.exit(1)
}

const runResult = await runDekaJsDirect(compileResult.js)
if (!runResult.ok) {
  console.error(`Runtime failed for ${category}/${name}:`, runResult.error)
  process.exit(1)
}

fs.renameSync(oldDs, newDs)
fs.writeFileSync(path.join(testDir, `${name}.stdout`), runResult.stdout)

const metadata = {
  title: name.replace(/_/g, ' '),
  stage: 'run',
  notes: '',
}
fs.writeFileSync(path.join(testDir, `${name}.json`), JSON.stringify(metadata, null, 2) + '\n')

if (formatResult.ok) {
  fs.writeFileSync(path.join(testDir, `${name}.code`), formatResult.code)
}

console.log(`[hats] converted ${category}/${name} to pass`)
console.log('stdout:', JSON.stringify(runResult.stdout))
