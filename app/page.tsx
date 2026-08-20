import { loadAllTests } from '@/lib/tests'
import { HatsGrid } from '@/components/HatsGrid'

export default function HomePage() {
  const categories = loadAllTests()
  return <HatsGrid categories={categories} />
}
