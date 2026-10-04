# TranscriptLite

TranscriptLite is the lightweight, privacy-first transcript planning MVP for The Degree Agency.

## Production

- Netlify: https://transcriptlite.netlify.app
- Repository: Chancebuilder/transcriptlite
- Default branch: main

## MVP features

- Manual coursework entry
- CSV coursework import
- Local-only PDF transcript text extraction and review (text-based PDFs; no server upload)
- Client-side validation
- Duplicate-course detection
- Deterministic course categorization
- Credit totals and category summaries
- Preliminary transfer-planning snapshot
- CSV export and print results
- Browser-local storage only

## Privacy and scope

This MVP does not use accounts, a transcript backend database, server-side PDF processing, OCR, or AI. Text-based transcript PDFs are read locally with PDF.js and coursework is stored locally in the user's browser. PDF contents and coursework are not sent to Education Data Core.

TranscriptLite provides preliminary planning support only. It is not an official transfer-credit evaluation and does not guarantee that a receiving institution will accept or apply any course.

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

Netlify is configured by `netlify.toml` to publish the Vite `dist` directory.

## Guided customer experience

The redesign adds Welcome → Goal → Education → Review → Credit picture → Explore paths → Plan.

- Goals and multiple degree interests explain why the information matters.
- All course identity fields, school names, credits, credit systems, and academic classifications can be corrected.
- Courses have explicit reviewed and edited-by-user states. Existing local coursework is preserved.
- Credit totals have no arbitrary transfer cap. Quarter credits convert to semester equivalents for display.
- Subject-area explanations identify the courses in each bucket and distinguish classification from degree applicability.
- School/program listings are retained with local progress. API errors explain how to continue.
- Progress, goals, study-time preference, school and program selections persist on this browser only; saving failures are surfaced.
- Download and print actions provide a portable starting point for school advisors.
- Responsive course cards, labeled controls, native modal dialogs, focus styles, reduced-motion support, and clear next actions support accessible use.

### Capability boundary

Lite currently organizes coursework and retrieves school/program listings. It does not calculate institution-specific equivalencies, accepted or applicable credit, ranked program matches, remaining requirements, tuition estimates, or completion dates. The UI makes this distinction explicit. Program names alone must not be treated as evidence of transfer acceptance. Original PDF files are not saved, and pending extraction rows need to be added before navigating away.

The public legal pages remain in `public/`. No student coursework is sent to reference APIs. CSV exports escape formula-like values.
