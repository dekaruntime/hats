import { loadBuildResults } from '@/lib/build-tests'
import { HatsGrid } from '@/components/HatsGrid'

export default async function HomePage() {
  const { nativeAvailable, categories } = await loadBuildResults()
  return <HatsGrid categories={categories} nativeAvailable={nativeAvailable} />
}
