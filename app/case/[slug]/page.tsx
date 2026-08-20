import { notFound } from 'next/navigation'
import { loadTestBySlug, getAllSlugs, loadAllTests } from '@/lib/tests'
import { CaseRunner } from '@/components/CaseRunner'

interface CasePageProps {
  params: Promise<{ slug: string }>
}

export async function generateStaticParams() {
  return getAllSlugs().map((slug) => ({ slug }))
}

export default async function CasePage({ params }: CasePageProps) {
  const { slug } = await params
  const test = loadTestBySlug(slug)

  if (!test) {
    notFound()
  }

  const categories = loadAllTests()

  return <CaseRunner test={test} categories={categories} />
}
