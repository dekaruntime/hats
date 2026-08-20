import { loadAndRunAllTests } from '../lib/build-tests.ts'

const { nativeAvailable, categories } = await loadAndRunAllTests()

console.log(`[hats] nativeAvailable=${nativeAvailable}`)

for (const category of categories) {
  for (const test of category.tests) {
    console.log(`[hats] ${test.slug}: overall=${test.overallStatus} wasm=${test.wasmMatches} native=${test.nativeMatches}`)
    console.log(`  wasm stage=${test.wasmResult.stage} ok=${test.wasmResult.ok} stdout=${JSON.stringify(test.wasmResult.stdout)} stderr=${JSON.stringify(test.wasmResult.stderr)}`)
    console.log(`  native stage=${test.nativeResult.stage} ok=${test.nativeResult.ok} stdout=${JSON.stringify(test.nativeResult.stdout)} stderr=${JSON.stringify(test.nativeResult.stderr)} error=${JSON.stringify(test.nativeResult.error)}`)
  }
}
