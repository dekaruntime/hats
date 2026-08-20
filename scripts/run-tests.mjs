import { loadAndRunAllTests } from '../lib/build-tests.ts'

async function main() {
  const start = Date.now()
  const results = await loadAndRunAllTests()
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  let overallPass = 0
  let overallFail = 0
  let overallDivergent = 0

  for (const category of results.categories) {
    let catPass = 0
    let catFail = 0
    let catDivergent = 0
    for (const test of category.tests) {
      if (test.overallStatus === 'pass') catPass++
      else if (test.overallStatus === 'fail') catFail++
      else catDivergent++
    }
    overallPass += catPass
    overallFail += catFail
    overallDivergent += catDivergent
    console.log(
      `${category.name.padEnd(24)} | pass ${String(catPass).padStart(3)} | fail ${String(catFail).padStart(3)} | divergent ${String(catDivergent).padStart(3)}`
    )
  }

  console.log('-'.repeat(60))
  console.log(
    `${'TOTAL'.padEnd(24)} | pass ${String(overallPass).padStart(3)} | fail ${String(overallFail).padStart(3)} | divergent ${String(overallDivergent).padStart(3)}`
  )
  console.log(`Native available: ${results.nativeAvailable}`)
  console.log(`Elapsed: ${elapsed}s`)

  // List failures
  console.log('\nFailures/divergences:')
  for (const category of results.categories) {
    for (const test of category.tests) {
      if (test.overallStatus !== 'pass') {
        console.log(
          `  ${test.category}/${test.name}: expected ${test.status} at ${test.stage}, got ${test.overallStatus}`
        )
        if (test.wasmResult.error) {
          console.log(`    wasm: ${test.wasmResult.error.split('\n')[0]}`)
        }
        if (test.nativeResult.error) {
          console.log(`    native: ${test.nativeResult.error.split('\n')[0]}`)
        }
      }
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
