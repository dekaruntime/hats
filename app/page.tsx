import { loadAndRunAllTests } from '@/lib/build-tests'
import { HatsGrid } from '@/components/HatsGrid'

export default async function HomePage() {
  const categories = await loadAndRunAllTests()
  return <HatsGrid categories={categories} />
}
