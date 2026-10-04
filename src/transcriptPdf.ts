import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

export type ParsedPdfCourse = {
  institution: string
  code: string
  title: string
  credits: number
  grade: string
  term: string
}

const courseLine = /^([A-Z]{2,8})\s*[- ]?\s*(\d{2,4}[A-Z]?)\s+(.+?)\s+(\d+(?:\.\d+)?)\s+([A-F][+-]?|P|PASS|CR|S|U|W|WF)$/i

export async function extractTranscriptPdf(file: File): Promise<{ text: string; courses: ParsedPdfCourse[] }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data: bytes }).promise
  const pages: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    pages.push(content.items.map(item => ('str' in item ? item.str : '')).join(' '))
  }

  const text = pages.join('\n')
  const courses: ParsedPdfCourse[] = []
  for (const raw of text.split(/\n|\s{3,}/)) {
    const line = raw.trim()
    const match = line.match(courseLine)
    if (!match) continue
    courses.push({
      institution: '',
      code: `${match[1].toUpperCase()} ${match[2].toUpperCase()}`,
      title: match[3].trim(),
      credits: Number(match[4]),
      grade: match[5].toUpperCase(),
      term: '',
    })
  }
  return { text, courses }
}
