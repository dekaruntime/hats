import fs from 'fs'
import { loadWasmCompiler, compileWithWasm, formatDsWithWasm } from '../lib/build-wasm.ts'
import { runDekaJsDirect } from '../lib/compiler/runtime.ts'

const source = process.argv[2]
  ? fs.readFileSync(process.argv[2], 'utf-8')
  : (await new Promise((resolve) => {
      let data = ''
      process.stdin.on('data', (chunk) => (data += chunk))
      process.stdin.on('end', () => resolve(data))
    }))

const compiler = await loadWasmCompiler()
const compileResult = compileWithWasm(compiler, source, 'quick-test.ds')
const formatResult = formatDsWithWasm(compiler, source)

console.log('=== COMPILE ===')
console.log('ok:', compileResult.ok)
if (compileResult.error) console.log('error:', compileResult.error)
console.log('diagnostics:', JSON.stringify(compileResult.diagnostics, null, 2))
if (compileResult.js) {
  console.log('=== JS ===')
  console.log(compileResult.js)
  const runResult = await runDekaJsDirect(compileResult.js)
  console.log('=== RUN ===')
  console.log('ok:', runResult.ok)
  console.log('stdout:', JSON.stringify(runResult.stdout))
  console.log('stderr:', JSON.stringify(runResult.stderr))
  if (runResult.error) console.log('run error:', runResult.error)
}
if (formatResult.ok) {
  console.log('=== FORMATTED DS ===')
  console.log(formatResult.code)
} else {
  console.log('=== FORMAT ERROR ===')
  console.log(formatResult.error)
}
