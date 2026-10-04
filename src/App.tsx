import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import { getCoreHealth, searchInstitutions, type Institution } from './educationDataCore'
import { extractTranscriptPdf, type ParsedPdfCourse } from './transcriptPdf'
import Papa from 'papaparse'
import { z } from 'zod'

type Course = {
  id: string
  institution: string
  code: string
  title: string
  credits: number
  creditSystem: 'semester' | 'quarter'
  grade: string
  term: string
  category: string
}

const courseSchema = z.object({
  institution: z.string().trim().min(1, 'Institution is required'),
  code: z.string().trim().min(1, 'Course code is required'),
  title: z.string().trim().min(1, 'Course title is required'),
  credits: z.coerce.number().positive().max(30),
  creditSystem: z.enum(['semester', 'quarter']).default('semester'),
  grade: z.string().trim().max(12).default(''),
  term: z.string().trim().max(40).default(''),
})

const starter = {
  institution: '',
  code: '',
  title: '',
  credits: '3',
  creditSystem: 'semester' as const,
  grade: '',
  term: '',
}

const categories = ['General Education', 'Business', 'Technology', 'Healthcare', 'Criminal Justice', 'Elective', 'Other']

function categorize(title: string, code: string) {
  const value = (title + ' ' + code).toLowerCase()
  if (/english|writing|composition|math|algebra|statistics|history|psych|sociology|biology|science|humanit/.test(value)) return 'General Education'
  if (/business|account|finance|management|marketing|econom|organiz/.test(value)) return 'Business'
  if (/computer|information|cyber|network|program|software|database|technology/.test(value)) return 'Technology'
  if (/health|nurs|anatomy|physiology|medical|clinical/.test(value)) return 'Healthcare'
  if (/criminal|justice|crimin|law|police|correction/.test(value)) return 'Criminal Justice'
  return 'Elective'
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export default function App() {
  const [courses, setCourses] = useState<Course[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('transcriptlite:courses') || '[]').map((course: Course) => ({ ...course, creditSystem: course.creditSystem || 'semester' }))
    } catch {
      return []
    }
  })
  const [form, setForm] = useState(starter)
  const [message, setMessage] = useState('')
  const [coreOnline, setCoreOnline] = useState(false)
  const [institutionMatches, setInstitutionMatches] = useState<Institution[]>([])
  const [pdfCourses, setPdfCourses] = useState<ParsedPdfCourse[]>([])
  const [pdfInstitution, setPdfInstitution] = useState('')
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfFileName, setPdfFileName] = useState('')
  const [showNextSteps, setShowNextSteps] = useState(false)
  const pdfInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getCoreHealth().then(result => setCoreOnline(result.ok)).catch(() => setCoreOnline(false))
  }, [])

  useEffect(() => {
    const query = form.institution.trim()
    if (query.length < 3) { setInstitutionMatches([]); return }
    const timer = window.setTimeout(() => {
      searchInstitutions(query).then(setInstitutionMatches).catch(() => setInstitutionMatches([]))
    }, 300)
    return () => window.clearTimeout(timer)
  }, [form.institution])

  const save = (next: Course[]) => {
    setCourses(next)
    localStorage.setItem('transcriptlite:courses', JSON.stringify(next))
  }

  const addCourse = (event: FormEvent) => {
    event.preventDefault()
    const parsed = courseSchema.safeParse(form)
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message || 'Please check the course details.')
      return
    }

    const duplicate = courses.some(
      c => c.institution.toLowerCase() === parsed.data.institution.toLowerCase() &&
           c.code.toLowerCase() === parsed.data.code.toLowerCase()
    )
    if (duplicate) {
      setMessage('Possible duplicate: this institution and course code already exist.')
      return
    }

    const next: Course = {
      id: uid(),
      ...parsed.data,
      category: categorize(parsed.data.title, parsed.data.code),
    }
    save([...courses, next])
    setForm(starter)
    setMessage('Course added.')
  }

  const onPdf = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget
    const file = input.files?.item(0)
    if (!file) {
      setPdfFileName('')
      setMessage('No PDF was selected. Please choose the transcript file again.')
      return
    }
    setPdfFileName(file.name)
    if (file.type !== 'application/pdf' || file.size > 15_000_000) {
      setMessage('Please choose a PDF transcript under 15 MB.')
      input.value = ''
      setPdfFileName('')
      return
    }
    setPdfBusy(true)
    setPdfCourses([])
    setMessage(`Reading ${file.name} locally…`)
    try {
      const result = await extractTranscriptPdf(file)
      setPdfCourses(result.courses)
      setMessage(result.courses.length
        ? `Read ${file.name}. Found ${result.courses.length} possible course${result.courses.length === 1 ? '' : 's'}. Review before adding.`
        : result.text.trim()
          ? `Read ${file.name}, but no course rows matched automatically. The PDF was processed locally and was not uploaded.`
          : `${file.name} contains no extractable text. It may be an image-only/scanned PDF.`)
    } catch (error) {
      console.error('Local PDF import failed', error)
      setMessage(`Could not read ${file.name} locally. The file was not uploaded. Try another text-based PDF.`)
    } finally {
      setPdfBusy(false)
    }
  }

  const addPdfCourses = () => {
    if (!pdfInstitution.trim()) {
      setMessage('Enter the institution shown on the transcript before adding extracted courses.')
      return
    }
    const merged = [...courses]
    let added = 0
    for (const item of pdfCourses) {
      const course: Course = { id: uid(), ...item, creditSystem: 'semester', institution: pdfInstitution.trim(), category: categorize(item.title, item.code) }
      const duplicate = merged.some(c => c.institution.toLowerCase() === course.institution.toLowerCase() && c.code.toLowerCase() === course.code.toLowerCase())
      if (!duplicate) { merged.push(course); added += 1 }
    }
    save(merged)
    setPdfCourses([])
    setPdfInstitution('')
    setMessage(`Added ${added} reviewed course${added === 1 ? '' : 's'} from the locally processed PDF.`)
    setShowNextSteps(true)
  }

  const onCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 2_000_000) {
      setMessage('CSV is too large. Please use a file under 2 MB.')
      return
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: result => {
        const imported: Course[] = []
        for (const row of result.data.slice(0, 500)) {
          const candidate = {
            institution: row.institution || row.school || '',
            code: row.code || row.course_code || '',
            title: row.title || row.course_title || row.course || '',
            credits: row.credits || '',
            creditSystem: (row.credit_system || row.creditSystem || 'semester').toLowerCase() === 'quarter' ? 'quarter' : 'semester',
            grade: row.grade || '',
            term: row.term || row.semester || '',
          }
          const parsed = courseSchema.safeParse(candidate)
          if (!parsed.success) continue
          imported.push({
            id: uid(),
            ...parsed.data,
            category: categorize(parsed.data.title, parsed.data.code),
          })
        }
        const merged = [...courses]
        let added = 0
        for (const item of imported) {
          const duplicate = merged.some(
            c => c.institution.toLowerCase() === item.institution.toLowerCase() &&
                 c.code.toLowerCase() === item.code.toLowerCase()
          )
          if (!duplicate) {
            merged.push(item)
            added += 1
          }
        }
        save(merged)
        setMessage(`Imported ${added} course${added === 1 ? '' : 's'}.`)
        event.target.value = ''
      },
      error: () => setMessage('Could not read that CSV file.'),
    })
  }

  const generateReport = () => {
    setShowNextSteps(false)
    document.getElementById('report')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const addMoreManually = () => {
    setShowNextSteps(false)
    document.getElementById('manual-course-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const semesterEquivalent = (course: Course) => course.creditSystem === 'quarter' ? course.credits * 2 / 3 : course.credits
  const totalCredits = useMemo(() => courses.reduce((sum, c) => sum + semesterEquivalent(c), 0), [courses])
  const quarterCredits = useMemo(() => courses.filter(c => c.creditSystem === 'quarter').reduce((sum, c) => sum + c.credits, 0), [courses])
  const categoryTotals = useMemo(() => {
    return courses.reduce<Record<string, number>>((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + semesterEquivalent(c)
      return acc
    }, {})
  }, [courses])

  const exportCsv = () => {
    const csv = Papa.unparse(courses.map(({ id, ...course }) => course))
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'transcriptlite-results.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  const clearAll = () => {
    if (!confirm('Clear all locally stored coursework?')) return
    save([])
    setMessage('All coursework cleared from this browser.')
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="brand">TranscriptLite</div>
        <h1>Turn prior coursework into a clear starting point.</h1>
        <p>
          Enter or import completed courses, review your credit picture, and identify preliminary transfer opportunities.
          Your coursework stays in this browser.
        </p>
        <div className="badges">
          <span>Local-first</span><span>No account</span><span>No transcript upload required</span><span>{coreOnline ? 'Education Data Core connected' : 'Reference data offline'}</span>
        </div>
      </header>

      <main>
        <section className="panel privacy">
          <div>
            <h2>Privacy-first by design</h2>
            <p>TranscriptLite stores your entries locally in your browser. Coursework is not sent to the Education Data Core. PDFs and coursework are processed and stored on this device. Only public reference-data searches, such as institution names, are requested from the Core.</p>
          </div>
          <strong>Preliminary planning only — not an official transfer evaluation.</strong>
        </section>

        <section className="grid">
          <div className="panel" id="manual-course-form">
            <h2>Add coursework</h2>
            <form onSubmit={addCourse} className="course-form">
              <label>Institution<input value={form.institution} onChange={e => setForm({...form, institution:e.target.value})} placeholder="Example University" />
                {institutionMatches.length > 0 && <div className="reference-matches" aria-label="Institution reference matches">
                  {institutionMatches.map(item => <button type="button" key={item.id} onClick={() => { setForm({...form, institution:item.official_name}); setInstitutionMatches([]) }}>{item.official_name}</button>)}
                </div>}
              </label>
              <div className="two">
                <label>Course code<input value={form.code} onChange={e => setForm({...form, code:e.target.value})} placeholder="ENG 101" /></label>
                <label>Credits<input type="number" min="0.5" max="30" step="0.25" value={form.credits} onChange={e => setForm({...form, credits:e.target.value})} /></label>
                <label>Credit type<select value={form.creditSystem} onChange={e => setForm({...form, creditSystem:e.target.value as 'semester' | 'quarter'})}><option value="semester">Semester credits</option><option value="quarter">Quarter credits</option></select></label>
              </div>
              <label>Course title<input value={form.title} onChange={e => setForm({...form, title:e.target.value})} placeholder="English Composition I" /></label>
              <div className="two">
                <label>Grade<input value={form.grade} onChange={e => setForm({...form, grade:e.target.value})} placeholder="A / P / CR" /></label>
                <label>Term<input value={form.term} onChange={e => setForm({...form, term:e.target.value})} placeholder="Fall 2025" /></label>
              </div>
              <button className="primary" type="submit">Add course</button>
            </form>

            <div className="import">
              <h3>Or read a transcript PDF on this device</h3>
              <p>The PDF is processed in your browser and is never uploaded. Text-based PDFs work best; image-only scans are not yet supported.</p>
              <input
                ref={pdfInputRef}
                id="transcript-pdf"
                type="file"
                accept=".pdf,application/pdf"
                onClick={event => { event.currentTarget.value = '' }}
                onChange={onPdf}
                disabled={pdfBusy}
              />
              <p className="muted" aria-live="polite">
                {pdfBusy ? `Reading ${pdfFileName || 'PDF'} locally…` : pdfFileName ? `Selected: ${pdfFileName}` : 'No PDF selected yet.'}
              </p>
              {pdfCourses.length > 0 && <div className="pdf-review">
                <label>Transcript institution<input value={pdfInstitution} onChange={e => setPdfInstitution(e.target.value)} placeholder="Institution shown on transcript" /></label>
                <strong>{pdfCourses.length} possible courses found</strong>
                <div className="pdf-course-list">{pdfCourses.map((course, index) => <div key={index}><span>{course.code} · {course.title}</span><span>{course.credits} cr · {course.grade}</span></div>)}</div>
                <button type="button" className="primary" onClick={addPdfCourses}>Add reviewed courses</button>
              </div>}
            </div>

            <div className="import">
              <h3>Or import a CSV</h3>
              <p>Headers supported: institution, code, title, credits, credit_system (semester or quarter), grade, term.</p>
              <input type="file" accept=".csv,text/csv" onChange={onCsv} />
            </div>
            {message && <div className="message" role="status">{message}</div>}
            {showNextSteps && (
              <div className="next-steps" role="region" aria-label="Next steps">
                <h3>What would you like to do next?</h3>
                <p>Your PDF courses have been added. Generate your preliminary report now, or add more coursework first.</p>
                <div className="actions">
                  <button type="button" className="primary" onClick={generateReport}>Generate report</button>
                  <button type="button" onClick={addMoreManually}>Add additional courses manually</button>
                </div>
              </div>
            )}
          </div>

          <aside className="panel summary">
            <h2>Credit snapshot</h2>
            <div className="metric"><span>Total courses</span><strong>{courses.length}</strong></div>
            <div className="metric"><span>Semester-equivalent credits</span><strong>{totalCredits.toFixed(2)}</strong></div>
            {quarterCredits > 0 && <div className="metric small"><span>Quarter credits entered</span><strong>{quarterCredits.toFixed(2)} → {(quarterCredits * 2 / 3).toFixed(2)} semester</strong></div>}
            <hr />
            <h3>By category</h3>
            {categories.filter(c => categoryTotals[c]).map(c => (
              <div className="metric small" key={c}><span>{c}</span><strong>{categoryTotals[c]}</strong></div>
            ))}
            {!courses.length && <p className="muted">Add coursework to see your snapshot.</p>}
            <div className="actions">
              <button onClick={exportCsv} disabled={!courses.length}>Download CSV</button>
              <button onClick={() => window.print()} disabled={!courses.length}>Print results</button>
              <button className="danger" onClick={clearAll} disabled={!courses.length}>Clear</button>
            </div>
          </aside>
        </section>

        <section className="panel">
          <div className="section-head">
            <div><h2>Course review</h2><p>Confirm your entries before using them for degree planning.</p></div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Institution</th><th>Course</th><th>Title</th><th>Credits</th><th>Credit type</th><th>Semester equiv.</th><th>Grade</th><th>Category</th><th></th></tr></thead>
              <tbody>
                {courses.map(course => (
                  <tr key={course.id}>
                    <td>{course.institution}</td>
                    <td>{course.code}</td>
                    <td>{course.title}</td>
                    <td>{course.credits}</td>
                    <td><select value={course.creditSystem || 'semester'} onChange={e => save(courses.map(c => c.id === course.id ? {...c, creditSystem:e.target.value as 'semester' | 'quarter'} : c))}><option value="semester">Semester</option><option value="quarter">Quarter</option></select></td>
                    <td>{semesterEquivalent(course).toFixed(2)}</td>
                    <td>{course.grade || '—'}</td>
                    <td>
                      <select value={course.category} onChange={e => save(courses.map(c => c.id === course.id ? {...c, category:e.target.value} : c))}>
                        {categories.map(cat => <option key={cat}>{cat}</option>)}
                      </select>
                    </td>
                    <td><button className="link" onClick={() => save(courses.filter(c => c.id !== course.id))}>Remove</button></td>
                  </tr>
                ))}
                {!courses.length && <tr><td colSpan={9} className="empty">No coursework added yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel opportunities" id="report">
          <h2>Preliminary TranscriptLite report</h2>
          <p>
            TranscriptLite helps you organize potentially transferable credit and prepare for comparison against transfer-friendly
            institutions. Actual transferability, equivalency, degree applicability, residency requirements, grade minimums,
            course age limits, and institutional policy must be verified with the receiving school.
          </p>
          <div className="opportunity-grid">
            <div><strong>{Math.min(totalCredits, 90).toFixed(2)}</strong><span>Credits to review for possible transfer</span></div>
            <div><strong>{Object.keys(categoryTotals).length}</strong><span>Academic categories represented</span></div>
            <div><strong>{courses.length ? 'Ready' : 'Not ready'}</strong><span>For a preliminary degree-path comparison</span></div>
          </div>
        </section>
      </main>

      <footer>
        <strong>TranscriptLite</strong> by The Degree Agency · Planning support only. Not a college, registrar, accreditor, or official transcript evaluator.
      </footer>
    </div>
  )
}
