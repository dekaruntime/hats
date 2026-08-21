import fs from 'fs'
import path from 'path'
import { loadAndRunAllTests } from '../lib/build-tests.ts'

const { nativeAvailable, version, categories } = await loadAndRunAllTests()

console.log(`[hats] nativeAvailable=${nativeAvailable} version=${version}`)

for (const category of categories) {
  for (const test of category.tests) {
    console.log(`[hats] ${test.slug}: overall=${test.overallStatus} wasm=${test.wasmMatches} native=${test.nativeMatches}`)
    console.log(`  wasm stage=${test.wasmResult.stage} ok=${test.wasmResult.ok} stdout=${JSON.stringify(test.wasmResult.stdout)} stderr=${JSON.stringify(test.wasmResult.stderr)}`)
    console.log(`  native stage=${test.nativeResult.stage} ok=${test.nativeResult.ok} stdout=${JSON.stringify(test.nativeResult.stdout)} stderr=${JSON.stringify(test.nativeResult.stderr)} error=${JSON.stringify(test.nativeResult.error)}`)
  }
}

// Persist results so the static export can read them without re-running the
// full conformance suite inside the Next.js SSG environment.
const outPath = path.join(process.cwd(), 'public', 'hats-results.json')
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, JSON.stringify({ nativeAvailable, version, categories }, null, 2))
console.log(`[hats] wrote ${outPath}`)
