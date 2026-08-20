import { loadAndRunAllTests } from '@/lib/build-tests'
import { HatsGrid } from '@/components/HatsGrid'

export default async function HomePage() {
  const { nativeAvailable, categories } = await loadAndRunAllTests()

  // Build-time diagnostics: log any test that does not match its expectation
  // so Cloudflare Workers Build logs show exactly why a test is failing.
  for (const category of categories) {
    for (const test of category.tests) {
      if (test.overallStatus !== 'pass') {
        console.warn(
          `[hats build] ${test.slug}: expected ${test.status} at ${test.stage}, got ${test.overallStatus}`
        )
        console.warn(`  wasm ok=${test.wasmResult.ok} stage=${test.wasmResult.stage} error=${JSON.stringify(test.wasmResult.error)}`)
        console.warn(`  native ok=${test.nativeResult.ok} stage=${test.nativeResult.stage} error=${JSON.stringify(test.nativeResult.error)}`)
      }
    }
  }

  return <HatsGrid categories={categories} nativeAvailable={nativeAvailable} />
}
