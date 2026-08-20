import { loadAndRunAllTests } from '../lib/build-tests.ts'

async function main() {
  const args = process.argv.slice(2)
  const categoryIdx = args.indexOf('--category')
  const categoryFilter = categoryIdx !== -1 ? args[categoryIdx + 1] : undefined
  const listMode = args.includes('--list')

  const start = Date.now()
  const results = await loadAndRunAllTests()
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  const categories = categoryFilter
    ? results.categories.filter((c) => c.name === categoryFilter)
    : results.categories

  if (listMode) {
    for (const category of categories) {
      console.log(category.name)
      for (const test of category.tests) {
        console.log(`  ${test.name} (${test.status} at ${test.stage}) [${test.overallStatus}]`)
      }
    }
    return
  }

  let overallPass = 0
  let overallFail = 0
  let overallDivergent = 0

  for (const category of categories) {
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

  if (!categoryFilter) {
    console.log('-'.repeat(60))
    console.log(
      `${'TOTAL'.padEnd(24)} | pass ${String(overallPass).padStart(3)} | fail ${String(overallFail).padStart(3)} | divergent ${String(overallDivergent).padStart(3)}`
    )
    console.log(`Native available: ${results.nativeAvailable}`)
  }
  console.log(`Elapsed: ${elapsed}s`)

  // List failures/divergences
  let hasIssues = false
  for (const category of categories) {
    for (const test of category.tests) {
      if (test.overallStatus !== 'pass') {
        if (!hasIssues) {
          console.log('\nFailures/divergences:')
          hasIssues = true
        }
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
