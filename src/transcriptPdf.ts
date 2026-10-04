import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = workerUrl;

export type ParsedPdfCourse = {
  institution: string;
  code: string;
  title: string;
  credits: number;
  grade: string;
  term: string;
};

type PdfTextItem = { str: string; transform: number[]; hasEOL?: boolean };

const codePattern =
  /^(?:TRN\s*)?([A-Z]{2,8})\s*[- ]?\s*(\d{2,4}[A-Z]?)\b\s*(.*)$/i;
const gradePattern =
  /^(A[+-]?|B[+-]?|C[+-]?|D[+-]?|F|P|PASS|CR|TR|NC|I|W|WF|AU|S|U)$/i;
const levelPattern = /^(UG|UL|LL|GR|G)$/i;
const numberPattern = /^\d+(?:\.\d+)?$/;
const noisePattern =
  /^(course|title|level|attempted|earned|grade|quality|points|status:|academic history|cumulative summary|record notes)/i;

function pageLines(items: PdfTextItem[]) {
  const rows = new Map<number, Array<{ x: number; text: string }>>();
  for (const item of items) {
    const text = item.str.trim();
    if (!text) continue;
    const x = item.transform[4];
    const y = Math.round(item.transform[5] / 2) * 2;
    const row = rows.get(y) || [];
    row.push({ x, text });
    rows.set(y, row);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, row]) =>
      row
        .sort((a, b) => a.x - b.x)
        .map((v) => v.text)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function detectInstitutions(lines: string[]) {
  const names = new Set<string>();
  for (const line of lines) {
    const cleaned = line.replace(/\s*\(fictional\)\s*/gi, "").trim();
    if (
      /\b(university|college|institute|school)\b/i.test(cleaned) &&
      cleaned.length < 100 &&
      !/student|course|transcript|record|transfer work|academic/i.test(cleaned)
    )
      names.add(cleaned);
  }
  return [...names];
}

function institutionForLine(
  lines: string[],
  index: number,
  institutions: string[],
) {
  for (let i = index; i >= Math.max(0, index - 20); i -= 1) {
    const hit = institutions.find((name) =>
      lines[i].toLowerCase().includes(name.toLowerCase()),
    );
    if (hit) return hit;
  }
  return institutions[0] || "";
}

function parseCourses(
  lines: string[],
  institutions: string[],
): ParsedPdfCourse[] {
  const courses: ParsedPdfCourse[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const start = lines[i].match(codePattern);
    if (!start || noisePattern.test(lines[i])) continue;

    const code = `${start[1].toUpperCase()} ${start[2].toUpperCase()}`;
    let title = start[3].trim();
    const window = lines.slice(i, Math.min(lines.length, i + 6));
    const tokens = window.join(" ").split(/\s+/);
    // A title such as "Composition I" is not an incomplete grade. Grade
    // columns follow numeric credit values in the supported transcript layout.
    const gradeIndex = tokens.findIndex((t, index) =>
      gradePattern.test(t) && index > 2 && numberPattern.test(tokens[index - 1]),
    );
    if (gradeIndex < 0) continue;

    const grade = tokens[gradeIndex].toUpperCase();
    const beforeGrade = tokens.slice(0, gradeIndex);
    const numeric = beforeGrade
      .filter((t) => numberPattern.test(t))
      .map(Number);
    const credits = numeric.length ? numeric[numeric.length - 1] : NaN;
    if (!Number.isFinite(credits) || credits <= 0 || credits > 20) continue;

    if (!title) {
      const titleTokens = beforeGrade
        .slice(2)
        .filter((t) => !levelPattern.test(t) && !numberPattern.test(t));
      title = titleTokens.join(" ");
    } else {
      title = title.replace(/\b(UG|UL|LL|GR|G)\b.*$/i, "").trim();
    }
    if (!title || title.length < 2) continue;

    courses.push({
      institution: institutionForLine(lines, i, institutions),
      code,
      title,
      credits,
      grade,
      term: "",
    });
  }

  const seen = new Set<string>();
  return courses.filter((course) => {
    const key = [
      course.institution,
      course.code,
      course.title,
      course.credits,
      course.grade,
    ]
      .join("|")
      .toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function extractTranscriptPdf(
  file: File,
): Promise<{
  text: string;
  courses: ParsedPdfCourse[];
  institutions: string[];
}> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data: bytes }).promise;
  const lines: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const textItems: PdfTextItem[] = content.items.flatMap((item) =>
      "str" in item
        ? [{ str: item.str, transform: item.transform, hasEOL: item.hasEOL }]
        : [],
    );
    lines.push(...pageLines(textItems));
  }

  const text = lines.join("\n");
  const institutions = detectInstitutions(lines);
  return { text, courses: parseCourses(lines, institutions), institutions };
}
