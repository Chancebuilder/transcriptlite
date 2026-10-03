import { ChangeEvent, FormEvent, useMemo, useState } from 'react'
import Papa from 'papaparse'
import { z } from 'zod'

type Course = {
  id: string
  institution: string
  code: string
  title: string
  credits: number
  grade: string
  term: string
  category: string
}

const courseSchema = z.object({
  institution: z.string().trim().min(1, 'Institution is required'),
  code: z.string().trim().min(1, 'Course code is required'),
  title: z.string().trim().min(1, 'Course title is required'),
  credits: z.coerce.number().positive().max(20),
  grade: z.string().trim().max(12).default(''),
  term: z.string().trim().max(40).default(''),
})

const starter = {
  institution: '',
  code: '',
  title: '',
  credits: '3',
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
      return JSON.parse(localStorage.getItem('transcriptlite:courses') || '[]')
    } catch {
      return []
    }
  })
  const [form, setForm] = useState(starter)
  const [message, setMessage] = useState('')

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

  const totalCredits = useMemo(() => courses.reduce((sum, c) => sum + c.credits, 0), [courses])
  const categoryTotals = useMemo(() => {
    return courses.reduce<Record<string, number>>((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + c.credits
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
          <span>Local-first</span><span>No account</span><span>No transcript upload required</span>
        </div>
      </header>

      <main>
        <section className="panel privacy">
          <div>
            <h2>Privacy-first by design</h2>
            <p>TranscriptLite stores your entries locally in your browser. This MVP does not send coursework to a server.</p>
          </div>
          <strong>Preliminary planning only — not an official transfer evaluation.</strong>
        </section>

        <section className="grid">
          <div className="panel">
            <h2>Add coursework</h2>
            <form onSubmit={addCourse} className="course-form">
              <label>Institution<input value={form.institution} onChange={e => setForm({...form, institution:e.target.value})} placeholder="Example University" /></label>
              <div className="two">
                <label>Course code<input value={form.code} onChange={e => setForm({...form, code:e.target.value})} placeholder="ENG 101" /></label>
                <label>Credits<input type="number" min="0.5" max="20" step="0.5" value={form.credits} onChange={e => setForm({...form, credits:e.target.value})} /></label>
              </div>
              <label>Course title<input value={form.title} onChange={e => setForm({...form, title:e.target.value})} placeholder="English Composition I" /></label>
              <div className="two">
                <label>Grade<input value={form.grade} onChange={e => setForm({...form, grade:e.target.value})} placeholder="A / P / CR" /></label>
                <label>Term<input value={form.term} onChange={e => setForm({...form, term:e.target.value})} placeholder="Fall 2025" /></label>
              </div>
              <button className="primary" type="submit">Add course</button>
            </form>

            <div className="import">
              <h3>Or import a CSV</h3>
              <p>Headers supported: institution, code, title, credits, grade, term.</p>
              <input type="file" accept=".csv,text/csv" onChange={onCsv} />
            </div>
            {message && <div className="message" role="status">{message}</div>}
          </div>

          <aside className="panel summary">
            <h2>Credit snapshot</h2>
            <div className="metric"><span>Total courses</span><strong>{courses.length}</strong></div>
            <div className="metric"><span>Total credits entered</span><strong>{totalCredits}</strong></div>
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
              <thead><tr><th>Institution</th><th>Course</th><th>Title</th><th>Credits</th><th>Grade</th><th>Category</th><th></th></tr></thead>
              <tbody>
                {courses.map(course => (
                  <tr key={course.id}>
                    <td>{course.institution}</td>
                    <td>{course.code}</td>
                    <td>{course.title}</td>
                    <td>{course.credits}</td>
                    <td>{course.grade || '—'}</td>
                    <td>
                      <select value={course.category} onChange={e => save(courses.map(c => c.id === course.id ? {...c, category:e.target.value} : c))}>
                        {categories.map(cat => <option key={cat}>{cat}</option>)}
                      </select>
                    </td>
                    <td><button className="link" onClick={() => save(courses.filter(c => c.id !== course.id))}>Remove</button></td>
                  </tr>
                ))}
                {!courses.length && <tr><td colSpan={7} className="empty">No coursework added yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="panel opportunities">
          <h2>Preliminary transfer opportunities</h2>
          <p>
            TranscriptLite helps you organize potentially transferable credit and prepare for comparison against transfer-friendly
            institutions. Actual transferability, equivalency, degree applicability, residency requirements, grade minimums,
            course age limits, and institutional policy must be verified with the receiving school.
          </p>
          <div className="opportunity-grid">
            <div><strong>{Math.min(totalCredits, 90)}</strong><span>Credits to review for possible transfer</span></div>
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
