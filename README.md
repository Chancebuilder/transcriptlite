# TranscriptLite

TranscriptLite is the lightweight, privacy-first transcript planning MVP for The Degree Agency.

## Production

- Netlify: https://transcriptlite.netlify.app
- Repository: Chancebuilder/transcriptlite
- Default branch: main

## MVP features

- Manual coursework entry
- CSV coursework import
- Client-side validation
- Duplicate-course detection
- Deterministic course categorization
- Credit totals and category summaries
- Preliminary transfer-planning snapshot
- CSV export and print results
- Browser-local storage only

## Privacy and scope

This MVP does not use accounts, a backend database, PDF/OCR processing, or AI. Coursework is stored locally in the user's browser.

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
