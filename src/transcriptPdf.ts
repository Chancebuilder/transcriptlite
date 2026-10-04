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

type PdfTextItem = { str: string; transform: number[]; hasEOL?: boolean }

function pageLines(items: PdfTextItem[]) {
  const lines: string[] = []
  let current: string[] = []
  let lastY: number | null = null

  const flush = () => {
    const line = current.join(' ').replace(/\s+/g, ' ').trim()
    if (line) lines.push(line)
    current = []
  }

  for (const item of items) {
    const y = item.transform[5]
    if (lastY !== null && Math.abs(y - lastY) > 2) flush()
    if (item.str.trim()) current.push(item.str.trim())
    if (item.hasEOL) flush()
    lastY = y
  }
  flush()
  return lines
}

export async function extractTranscriptPdf(file: File): Promise<{ text: string; courses: ParsedPdfCourse[] }> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data: bytes }).promise
  const lines: string[] = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    lines.push(...pageLines(content.items.filter((item): item is PdfTextItem => 'str' in item)))
  }

  const text = lines.join('\n')
  const courses: ParsedPdfCourse[] = []
  for (const line of lines) {
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
