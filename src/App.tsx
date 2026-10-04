import {
  ChangeEvent,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  searchInstitutions,
  getEvaluatedPrograms,
  type Institution,
  type EvaluatedProgram,
} from "./educationDataCore";
import type { ParsedPdfCourse } from "./transcriptPdf";
import Papa from "papaparse";
import { z } from "zod";

type Course = {
  id: string;
  institution: string;
  code: string;
  title: string;
  credits: number;
  creditSystem: "semester" | "quarter";
  grade: string;
  term: string;
  category: string;
  reviewed?: boolean;
  edited?: boolean;
  classificationConfidence?: "high" | "medium" | "low";
};

const courseSchema = z.object({
  institution: z.string().trim().min(1, "Institution is required"),
  code: z.string().trim().min(1, "Course code is required"),
  title: z.string().trim().min(1, "Course title is required"),
  credits: z.coerce.number().positive().max(30),
  creditSystem: z.enum(["semester", "quarter"]).default("semester"),
  grade: z.string().trim().max(12).default(""),
  term: z.string().trim().max(40).default(""),
});

const starter = {
  institution: "",
  code: "",
  title: "",
  credits: "3",
  creditSystem: "semester" as "semester" | "quarter",
  grade: "",
  term: "",
};

const categories = [
  "Gen Ed — Written Communication",
  "Gen Ed — Oral Communication",
  "Gen Ed — Quantitative Reasoning",
  "Gen Ed — Natural Science",
  "Gen Ed — Social & Behavioral Science",
  "Gen Ed — Humanities",
  "Gen Ed — Arts",
  "Gen Ed — History/Civics",
  "Gen Ed — Diversity/Global",
  "Gen Ed — Information/Digital Literacy",
  "Business",
  "Cybersecurity",
  "Computer Science",
  "Data Science",
  "Technology",
  "Healthcare",
  "Criminal Justice",
  "Elective",
  "Other",
];
const degreeOptions = [
  "Business",
  "Cybersecurity",
  "Computer Science",
  "Data Science",
  "Healthcare Management",
  "Criminal Justice",
  "Information Technology",
  "Still deciding",
];

function categorize(title: string, code: string) {
  const value = (title + " " + code).toLowerCase();
  if (
    /composition|college writing|academic writing|english composition|rhetoric/.test(
      value,
    )
  )
    return "Gen Ed — Written Communication";
  if (
    /public speaking|oral communication|speech|interpersonal communication/.test(
      value,
    )
  )
    return "Gen Ed — Oral Communication";
  if (
    /statistics|algebra|calculus|quantitative|mathematics|finite math|college math|logic/.test(
      value,
    )
  )
    return "Gen Ed — Quantitative Reasoning";
  if (
    /biology|chemistry|physics|astronomy|geology|environmental science|anatomy|physiology|earth science/.test(
      value,
    )
  )
    return "Gen Ed — Natural Science";
  if (
    /psychology|sociology|anthropology|political science|economics|human geography|social science/.test(
      value,
    )
  )
    return "Gen Ed — Social & Behavioral Science";
  if (
    /philosophy|ethics|literature|humanities|religion|world civilization/.test(
      value,
    )
  )
    return "Gen Ed — Humanities";
  if (/art history|fine art|music|theatre|theater|dance|visual art/.test(value))
    return "Gen Ed — Arts";
  if (
    /u\.?s\.? history|american history|world history|government|civics|constitution/.test(
      value,
    )
  )
    return "Gen Ed — History/Civics";
  if (
    /diversity|global|culture|cultural|race|ethnic|gender studies|international/.test(
      value,
    )
  )
    return "Gen Ed — Diversity/Global";
  if (
    /information literacy|digital literacy|computer literacy|intro.*comput/.test(
      value,
    )
  )
    return "Gen Ed — Information/Digital Literacy";
  if (
    /cyber|information security|network security|ethical hack|digital forensics|security operations/.test(
      value,
    )
  )
    return "Cybersecurity";
  if (
    /computer science|programming|algorithm|data structure|software engineering|operating system/.test(
      value,
    )
  )
    return "Computer Science";
  if (
    /data science|machine learning|data analytics|data mining|big data|artificial intelligence/.test(
      value,
    )
  )
    return "Data Science";
  if (/business|account|finance|management|marketing|organiz/.test(value))
    return "Business";
  if (/computer|information technology|network|database|technology/.test(value))
    return "Technology";
  if (/health|nurs|medical|clinical/.test(value)) return "Healthcare";
  if (/criminal|justice|crimin|law enforcement|police|correction/.test(value))
    return "Criminal Justice";
  return "Elective";
}

function classificationConfidence(
  title: string,
  code: string,
  category: string,
) {
  const value = (title + " " + code).trim();
  if (category === "Elective" || category === "Other") return "low" as const;
  return value.split(/\s+/).length >= 3
    ? ("high" as const)
    : ("medium" as const);
}

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

const journey = [
  "Your goal",
  "Your education",
  "Review courses",
  "Credit picture",
  "Explore paths",
  "Your plan",
];
const goalChoices = [
  "Finish my bachelor’s degree",
  "Find the fastest route",
  "Find a lower-cost route",
  "Make the most of my credits",
  "Change careers",
  "Compare my options",
];
const bucketHelp: Record<string, string> = {
  "Gen Ed — Written Communication":
    "Writing, composition, and rhetoric: learning to express ideas clearly in writing.",
  "Gen Ed — Oral Communication":
    "Speaking, presentation, and interpersonal communication.",
  "Gen Ed — Quantitative Reasoning":
    "Mathematics, statistics, and using numbers to solve problems.",
  "Gen Ed — Natural Science":
    "Biology, chemistry, physics, and the study of the natural world. Schools may require laboratory credit separately.",
  "Gen Ed — Social & Behavioral Science":
    "Psychology, sociology, economics, and how people and societies behave.",
  "Gen Ed — Humanities":
    "Literature, philosophy, religion, and the study of human ideas and culture.",
  "Gen Ed — Arts": "Music, visual art, theatre, and creative expression.",
  "Gen Ed — History/Civics": "History, government, and civic life.",
  "Gen Ed — Diversity/Global": "Culture, diversity, and global perspectives.",
  "Gen Ed — Information/Digital Literacy":
    "Finding, evaluating, and using information and digital tools.",
  Business: "Business, accounting, finance, management, and marketing.",
  Cybersecurity: "Protecting information, networks, and systems.",
  "Computer Science":
    "Programming, algorithms, software, and computing theory.",
  "Data Science":
    "Data analysis, machine learning, and extracting meaning from data.",
  Technology:
    "Information technology, databases, networking, and technical systems.",
  Healthcare: "Health, nursing, and clinical or healthcare-related learning.",
  "Criminal Justice":
    "Justice systems, criminology, corrections, and public safety.",
  Elective:
    "A course that needs closer review. This label does not confirm that a school will accept it as elective credit.",
  Other:
    "Learning that needs more information before we can suggest a subject area.",
};
function readLocal<T>(key: string, fallback: T): T {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}
const initialJourney = () =>
  readLocal("transcriptlite:journey", {
    step: -1,
    goals: [] as string[],
    degree: "Still deciding",
    interests: [] as string[],
    school: null as Institution | null,
    program: "",
    hours: 8,
  });

export default function App() {
  const [courses, setCourses] = useState<Course[]>(() => {
    try {
      return JSON.parse(
        localStorage.getItem("transcriptlite:courses") || "[]",
      ).map((course: Course) => ({
        ...course,
        creditSystem: course.creditSystem || "semester",
      }));
    } catch {
      return [];
    }
  });
  const [form, setForm] = useState(starter);
  const [savedJourney] = useState(initialJourney);
  const [message, setMessage] = useState("");
  const [institutionMatches, setInstitutionMatches] = useState<Institution[]>(
    [],
  );
  const [pdfCourses, setPdfCourses] = useState<ParsedPdfCourse[]>([]);
  const [pdfInstitution, setPdfInstitution] = useState("");
  const [detectedInstitutions, setDetectedInstitutions] = useState<string[]>(
    [],
  );
  const [destinationQuery, setDestinationQuery] = useState("");
  const [destinationMatches, setDestinationMatches] = useState<Institution[]>(
    [],
  );
  const [destinationSchool, setDestinationSchool] =
    useState<Institution | null>(savedJourney.school);
  const [degreeGoal, setDegreeGoal] = useState(savedJourney.degree);
  const [step, setStep] = useState(
    Math.max(-1, Math.min(5, savedJourney.step)),
  );
  const [goals, setGoals] = useState<string[]>(savedJourney.goals);
  const [interests, setInterests] = useState<string[]>(
    savedJourney.interests || [],
  );
  const [hours, setHours] = useState(savedJourney.hours);
  const [saveStatus, setSaveStatus] = useState("Saved on this device");
  const [help, setHelp] = useState<{ title: string; text: string } | null>(
    null,
  );
  const [editing, setEditing] = useState<Course | null>(null);
  const [reviewFilter, setReviewFilter] = useState(false);
  const [referenceStatus, setReferenceStatus] = useState("");
  const helpRef = useRef<HTMLDialogElement>(null);
  const editRef = useRef<HTMLDialogElement>(null);
  const navigate = (next: number) => {
    if (pdfBusy) {
      setMessage(
        "Your transcript is still being read. Please wait before changing steps.",
      );
      return;
    }
    if (pdfCourses.length && next !== 1) {
      setMessage(
        "Please add or remove the pending transcript courses before leaving this step.",
      );
      return;
    }
    setStep(next);
    setMessage("");
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  useEffect(() => {
    if (help && !helpRef.current?.open) helpRef.current?.showModal();
  }, [help]);
  useEffect(() => {
    if (editing && !editRef.current?.open) editRef.current?.showModal();
  }, [editing]);
  const [evaluatedPrograms, setEvaluatedPrograms] = useState<
    EvaluatedProgram[]
  >([]);
  const [selectedProgramId, setSelectedProgramId] = useState(
    savedJourney.program,
  );
  const [programsBusy, setProgramsBusy] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [showNextSteps, setShowNextSteps] = useState(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      localStorage.setItem(
        "transcriptlite:journey",
        JSON.stringify({
          step,
          goals,
          degree: degreeGoal,
          interests,
          school: destinationSchool,
          program: selectedProgramId,
          hours,
        }),
      );
      setSaveStatus("Saved on this device");
    } catch {
      setSaveStatus(
        "Changes are only available until you leave. Download a copy to keep them.",
      );
    }
  }, [
    step,
    goals,
    degreeGoal,
    interests,
    destinationSchool,
    selectedProgramId,
    hours,
  ]);

  useEffect(() => {
    let active = true;
    if (!destinationSchool) {
      setEvaluatedPrograms([]);
      return;
    }
    setProgramsBusy(true);
    getEvaluatedPrograms(destinationSchool.id)
      .then((items) => {
        if (active) {
          setEvaluatedPrograms(items || []);
          setReferenceStatus("");
        }
      })
      .catch(() => {
        if (active) {
          setEvaluatedPrograms([]);
          setReferenceStatus(
            "We couldn’t retrieve programs for this school. Your coursework is still available; try again later.",
          );
        }
      })
      .finally(() => {
        if (active) setProgramsBusy(false);
      });
    return () => {
      active = false;
    };
  }, [destinationSchool]);

  useEffect(() => {
    let active = true;
    const query = destinationQuery.trim();
    if (query.length < 2) {
      setDestinationMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setReferenceStatus("Looking for schools…");
      searchInstitutions(query)
        .then((items) => {
          if (active) {
            setDestinationMatches(items);
            setReferenceStatus(
              items.length
                ? ""
                : "No schools found. Try another name or come back later.",
            );
          }
        })
        .catch(() => {
          if (active) {
            setDestinationMatches([]);
            setReferenceStatus(
              "School search is temporarily unavailable. Your local coursework is safe; you can continue with your credit picture.",
            );
          }
        });
    }, 250);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [destinationQuery]);

  useEffect(() => {
    let active = true;
    const query = form.institution.trim();
    if (query.length < 3) {
      setInstitutionMatches([]);
      return;
    }
    const timer = window.setTimeout(() => {
      searchInstitutions(query)
        .then((items) => {
          if (active) setInstitutionMatches(items);
        })
        .catch(() => {
          if (active) setInstitutionMatches([]);
        });
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [form.institution]);

  const save = (next: Course[]) => {
    setCourses(next);
    try {
      localStorage.setItem("transcriptlite:courses", JSON.stringify(next));
      setSaveStatus("Saved on this device");
    } catch {
      setSaveStatus(
        "Couldn’t save on this device. Download a copy before leaving.",
      );
    }
  };

  const addCourse = (event: FormEvent) => {
    event.preventDefault();
    const parsed = courseSchema.safeParse(form);
    if (!parsed.success) {
      setMessage(
        parsed.error.issues[0]?.message || "Please check the course details.",
      );
      return;
    }

    const duplicate = courses.some(
      (c) =>
        c.institution.toLowerCase() === parsed.data.institution.toLowerCase() &&
        c.code.toLowerCase() === parsed.data.code.toLowerCase(),
    );
    if (duplicate) {
      setMessage(
        "Possible duplicate: this institution and course code already exist.",
      );
      return;
    }

    const next: Course = {
      id: uid(),
      ...parsed.data,
      category: categorize(parsed.data.title, parsed.data.code),
      classificationConfidence: classificationConfidence(
        parsed.data.title,
        parsed.data.code,
        categorize(parsed.data.title, parsed.data.code),
      ),
    };
    save([...courses, next]);
    setForm(starter);
    setMessage("Course added.");
  };

  const onPdf = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.item(0);
    if (!file) {
      setMessage(
        "No PDF was selected. Please choose the transcript file again.",
      );
      return;
    }
    if (file.type !== "application/pdf" || file.size > 15_000_000) {
      setMessage("Please choose a PDF transcript under 15 MB.");
      input.value = "";
      return;
    }
    setPdfBusy(true);
    setMessage(`Reading ${file.name} locally…`);
    try {
      const { extractTranscriptPdf } = await import("./transcriptPdf");
      const result = await extractTranscriptPdf(file);
      setPdfCourses((previous) => [...previous, ...result.courses]);
      setDetectedInstitutions((previous) => [
        ...new Set([...previous, ...result.institutions]),
      ]);
      setMessage(
        result.courses.length
          ? `Read ${file.name}. Found ${result.courses.length} possible course${result.courses.length === 1 ? "" : "s"}. Review before adding.`
          : result.text.trim()
            ? `Read ${file.name}, but no course rows matched automatically. The PDF was processed locally and was not uploaded.`
            : `${file.name} contains no extractable text. It may be an image-only/scanned PDF.`,
      );
    } catch (error) {
      console.error("Local PDF import failed", error);
      setMessage(
        `Could not read ${file.name} locally. The file was not uploaded. Try another text-based PDF.`,
      );
    } finally {
      setPdfBusy(false);
    }
  };

  const addPdfCourses = () => {
    const merged = [...courses];
    let added = 0;
    for (const item of pdfCourses) {
      const course: Course = {
        id: uid(),
        ...item,
        creditSystem: "semester",
        institution:
          item.institution ||
          pdfInstitution.trim() ||
          "Institution needs review",
        category: categorize(item.title, item.code),
        classificationConfidence: classificationConfidence(
          item.title,
          item.code,
          categorize(item.title, item.code),
        ),
      };
      const duplicate = merged.some(
        (c) =>
          c.institution.toLowerCase() === course.institution.toLowerCase() &&
          c.code.toLowerCase() === course.code.toLowerCase(),
      );
      if (!duplicate) {
        merged.push(course);
        added += 1;
      }
    }
    if (
      pdfCourses.some(
        (item) =>
          !courseSchema.safeParse({
            ...item,
            institution: item.institution || pdfInstitution.trim(),
            creditSystem: "semester",
          }).success,
      )
    ) {
      setMessage(
        "Please check every school name, course code, title, and credit value before adding these courses.",
      );
      return;
    }
    save(merged);
    setPdfCourses([]);
    setPdfInstitution("");
    setDetectedInstitutions([]);
    setMessage(
      `Added ${added} reviewed course${added === 1 ? "" : "s"} from the locally processed PDF.`,
    );
    setShowNextSteps(true);
    setStep(2);
  };

  const onCsv = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setMessage("CSV is too large. Please use a file under 2 MB.");
      return;
    }

    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const imported: Course[] = [];
        for (const row of result.data.slice(0, 500)) {
          const candidate = {
            institution: row.institution || row.school || "",
            code: row.code || row.course_code || "",
            title: row.title || row.course_title || row.course || "",
            credits: row.credits || "",
            creditSystem:
              (
                row.credit_system ||
                row.creditSystem ||
                "semester"
              ).toLowerCase() === "quarter"
                ? "quarter"
                : "semester",
            grade: row.grade || "",
            term: row.term || row.semester || "",
          };
          const parsed = courseSchema.safeParse(candidate);
          if (!parsed.success) continue;
          imported.push({
            id: uid(),
            ...parsed.data,
            category: categorize(parsed.data.title, parsed.data.code),
            classificationConfidence: classificationConfidence(
              parsed.data.title,
              parsed.data.code,
              categorize(parsed.data.title, parsed.data.code),
            ),
          });
        }
        const merged = [...courses];
        let added = 0;
        for (const item of imported) {
          const duplicate = merged.some(
            (c) =>
              c.institution.toLowerCase() === item.institution.toLowerCase() &&
              c.code.toLowerCase() === item.code.toLowerCase(),
          );
          if (!duplicate) {
            merged.push(item);
            added += 1;
          }
        }
        save(merged);
        setMessage(
          `Added ${added} courses. ${result.data.length - imported.length} rows could not be read or were beyond the 500-row limit; ${imported.length - added} possible duplicates were skipped. Review the courses before using them.`,
        );
        event.target.value = "";
      },
      error: () => setMessage("Could not read that CSV file."),
    });
  };

  const generateReport = () => {
    setShowNextSteps(false);
    navigate(3);
  };

  const addMoreManually = () => {
    setShowNextSteps(false);
    navigate(1);
  };

  const semesterEquivalent = (course: Course) =>
    course.creditSystem === "quarter"
      ? (course.credits * 2) / 3
      : course.credits;
  const totalCredits = useMemo(
    () => courses.reduce((sum, c) => sum + semesterEquivalent(c), 0),
    [courses],
  );
  const quarterCredits = useMemo(
    () =>
      courses
        .filter((c) => c.creditSystem === "quarter")
        .reduce((sum, c) => sum + c.credits, 0),
    [courses],
  );
  const selectedProgram = evaluatedPrograms.find(
    (p) => (p.program_version_id || p.id) === selectedProgramId,
  );
  const categoryTotals = useMemo(() => {
    return courses.reduce<Record<string, number>>((acc, c) => {
      acc[c.category] = (acc[c.category] || 0) + semesterEquivalent(c);
      return acc;
    }, {});
  }, [courses]);

  const exportCsv = () => {
    const csv = Papa.unparse(
      courses.map(({ id, ...course }) => course),
      { escapeFormulae: true },
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "transcriptlite-results.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearAll = () => {
    if (!confirm("Clear all locally stored coursework?")) return;
    save([]);
    setMessage("All coursework cleared from this browser.");
  };

  const needingReview = courses.filter((c) => !c.reviewed).length;
  const schools = [...new Set(courses.map((c) => c.institution))];
  const visibleCourses = reviewFilter
    ? courses.filter((c) => !c.reviewed)
    : courses;
  const toggleGoal = (goal: string) =>
    setGoals((list) =>
      list.includes(goal) ? list.filter((g) => g !== goal) : [...list, goal],
    );
  const toggleInterest = (area: string) => {
    setInterests((list) =>
      list.includes(area) ? list.filter((g) => g !== area) : [...list, area],
    );
    setDegreeGoal(area);
  };
  const explain = (title: string, text: string) => setHelp({ title, text });
  const updateCourse = (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    const parsed = courseSchema.safeParse(editing);
    if (!parsed.success) {
      setMessage(parsed.error.issues[0]?.message || "Please check the course.");
      return;
    }
    save(
      courses.map((c) =>
        c.id === editing.id
          ? { ...editing, ...parsed.data, reviewed: true, edited: true }
          : c,
      ),
    );
    editRef.current?.close();
    setEditing(null);
    setMessage("Your corrections are saved. This course is marked reviewed.");
  };
  const nextAction = !courses.length
    ? 1
    : needingReview
      ? 2
      : !selectedProgram
        ? 4
        : 5;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <header className="topbar">
        <button
          className="brand"
          onClick={() => navigate(-1)}
          aria-label="Transcript Lite home"
        >
          <span className="brand-mark">
            t<span>↗</span>
          </span>
          <span>
            Transcript<span className="brand-lite">Lite</span>
            <small>BY THE DEGREE AGENCY</small>
          </span>
        </button>
        <div className="top-actions">
          <span className="save-status" role="status">
            {saveStatus}
          </span>
          <button
            className="text-button"
            onClick={() =>
              explain(
                "A little help, whenever you need it",
                "Start with your goal, then add a text-based PDF, CSV, or individual courses. Review every detail before exploring schools. Your work is saved in this browser, not an online account. You can download a copy from Your plan. For human help, use the contact options on degreedean.com.",
              )
            }
          >
            Need help? <span>↗</span>
          </button>
        </div>
      </header>
      {step >= 0 && (
        <nav className="journey" aria-label="Your degree journey">
          {journey.map((label, index) => (
            <button
              key={label}
              onClick={() => navigate(index)}
              className={step === index ? "current" : ""}
              aria-current={step === index ? "step" : undefined}
            >
              <span>{index + 1}</span>
              <b>{label}</b>
            </button>
          ))}
        </nav>
      )}
      <main id="main-content" tabIndex={-1}>
        {step === -1 && (
          <>
            <section className="welcome">
              <div className="welcome-copy">
                <span className="eyebrow">
                  YOUR EDUCATION. YOUR NEXT CHAPTER.
                </span>
                <h1>
                  You’ve earned the credits.
                  <br />
                  <em>Let’s find your direction.</em>
                </h1>
                <p>
                  See how your previous coursework could help you move toward a
                  degree. We’ll organize what you’ve learned, explain your
                  credit picture, and help you prepare for your next step.
                </p>
                <div className="hero-actions">
                  <button
                    className="primary"
                    onClick={() => navigate(courses.length ? nextAction : 0)}
                  >
                    {courses.length
                      ? "Continue my degree review"
                      : "Start my degree review"}{" "}
                    <span>→</span>
                  </button>
                  <button
                    onClick={() =>
                      document
                        .getElementById("how-it-works")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                  >
                    See how it works ↓
                  </button>
                </div>
                <div className="trust-line">
                  <span>✓ No account needed</span>
                  <span>✓ Your transcript stays on your device</span>
                </div>
              </div>
              <div
                className="welcome-art"
                aria-label="Your education journey: bring your credits, understand your learning, explore your next chapter"
              >
                <div className="art-orbit"></div>
                <div className="art-card art-one">
                  <span className="mini-icon">▤</span>
                  <small>YOUR STARTING POINT</small>
                  <strong>
                    The learning
                    <br />
                    you already have.
                  </strong>
                  <div className="art-lines">
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <div className="art-card art-two">
                  <span className="mini-icon mint">↗</span>
                  <small>YOUR NEXT CHAPTER</small>
                  <strong>
                    A clearer path
                    <br />
                    to what’s next.
                  </strong>
                  <div className="art-progress">
                    <i />
                  </div>
                  <span className="art-caption">One step at a time.</span>
                </div>
                <span className="art-note">Every credit has a story.</span>
              </div>
            </section>
            {courses.length > 0 && (
              <section className="return-card">
                <div>
                  <span className="eyebrow">WELCOME BACK</span>
                  <h2>Your education history is right here.</h2>
                  <p>
                    {courses.length} courses · {totalCredits.toFixed(1)} credits
                    identified · {needingReview} courses to review
                  </p>
                </div>
                <button
                  className="primary"
                  onClick={() => navigate(nextAction)}
                >
                  Pick up where I left off →
                </button>
              </section>
            )}
            <section className="benefits" id="how-it-works">
              {[
                [
                  "01",
                  "Bring your education",
                  "Add coursework from every school or learning provider you want to consider.",
                ],
                [
                  "02",
                  "Understand your credits",
                  "Review what we found and see your learning organized into clear subject areas.",
                ],
                [
                  "03",
                  "Explore your next step",
                  "Choose a school and a listed program, then prepare for an official transfer review.",
                ],
              ].map(([n, t, d]) => (
                <article key={n}>
                  <span className="eyebrow">{n} / THE JOURNEY</span>
                  <h2>{t}</h2>
                  <p>{d}</p>
                </article>
              ))}
            </section>
            <div className="privacy-strip">
              <span className="mini-icon">◇</span>
              <div>
                <strong>Your education history stays yours.</strong>
                <p>
                  PDFs are read on this device. Your coursework isn’t sent to
                  our school reference service.
                </p>
              </div>
              <button
                className="text-button"
                onClick={() =>
                  explain(
                    "How we use your transcript",
                    "Transcript Lite reads text-based PDFs in your browser and stores course entries on this device. Original PDF files are not retained by the app. Public school and program searches are sent to our reference service. There is no account or cloud backup: clearing browser data may remove your work. Use Download my coursework to keep a copy.",
                  )
                }
              >
                How it works ↗
              </button>
            </div>
          </>
        )}
        {step >= 0 && (
          <>
            <div className="page-heading">
              <span className="eyebrow">
                STEP {step + 1} OF 6 · YOUR DEGREE JOURNEY
              </span>
              <h1>
                {
                  [
                    "What would you like to accomplish?",
                    "Let’s bring your education together.",
                    "Make sure we got your story right.",
                    "Here’s the learning you’re bringing with you.",
                    "Where could your credits take you?",
                    "Your next chapter starts with a clear plan.",
                  ][step]
                }
              </h1>
              <p>
                {
                  [
                    "Tell us what matters to you. We’ll keep these priorities alongside your review, and you can change them anytime.",
                    "Add coursework from one school or several. We’ll keep the source of each course so you can see exactly where it came from.",
                    "Check the school, course details, and suggested subject area. A quick review now gives you a more reliable starting point.",
                    "Your coursework is now organized into subject areas. These are identified credits, ready for a school to evaluate.",
                    "Choose a receiving school and one of its listed degree programs. This is separate from the schools on your transcripts.",
                    "You have a starting point. Here’s what to review, what to ask your school, and what to keep for the next conversation.",
                  ][step]
                }
              </p>
            </div>
            {message && (
              <div className="message" role="status">
                {message}
              </div>
            )}
            {step === 0 && (
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>What matters most to you?</h2>
                    <p>Choose any that fit. There’s no wrong starting point.</p>
                  </div>
                  <span className="tag">You can change this later</span>
                </div>
                <div className="choice-grid">
                  {goalChoices.map((goal, index) => (
                    <button
                      key={goal}
                      aria-pressed={goals.includes(goal)}
                      className={
                        "choice " + (goals.includes(goal) ? "selected" : "")
                      }
                      onClick={() => toggleGoal(goal)}
                    >
                      <span className="choice-icon">
                        {["↗", "◷", "$", "▤", "✧", "⇄"][index]}
                      </span>
                      <strong>{goal}</strong>
                      <span className="choice-check">
                        {goals.includes(goal) ? "✓" : "+"}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="section-heading separated">
                  <div>
                    <h2>Do you have a degree area in mind?</h2>
                    <p>
                      Select one or more interests, or leave this open for now.
                    </p>
                  </div>
                </div>
                <div className="chips">
                  {[
                    ...degreeOptions.filter((d) => d !== "Still deciding"),
                    "Liberal / General Studies",
                  ].map((area) => (
                    <button
                      key={area}
                      className={interests.includes(area) ? "selected" : ""}
                      aria-pressed={interests.includes(area)}
                      onClick={() => toggleInterest(area)}
                    >
                      {interests.includes(area) ? "✓ " : ""}
                      {area}
                    </button>
                  ))}
                </div>
                <div className="info-note">
                  <strong>Why we ask</strong>
                  <p>
                    The same course may meet a major requirement in one degree
                    and count as an elective in another. Your interests don’t
                    change the course’s academic classification. School-specific
                    placement still needs confirmation.
                  </p>
                </div>
              </section>
            )}
            {step === 1 && (
              <div className="content-grid">
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Add a transcript</h2>
                      <p>
                        One school or several—we’ll help you bring it together.
                      </p>
                    </div>
                    <span className="tag">On-device processing</span>
                  </div>
                  <div className="upload-zone">
                    <span className="upload-icon">↑</span>
                    <h3>Your past coursework belongs here.</h3>
                    <p>
                      Choose a text-based PDF from your device.
                      <br />
                      Up to 15 MB per file. Add another whenever you’re ready.
                    </p>
                    <label
                      className="primary file-button"
                      htmlFor="transcript-pdf"
                    >
                      {pdfBusy
                        ? "Reading your transcript…"
                        : "Choose a transcript PDF"}{" "}
                      <span>+</span>
                    </label>
                    <input
                      className="visually-hidden"
                      ref={pdfInputRef}
                      id="transcript-pdf"
                      type="file"
                      accept=".pdf,application/pdf"
                      onClick={(e) => {
                        e.currentTarget.value = "";
                      }}
                      onChange={onPdf}
                      disabled={pdfBusy}
                    />
                  </div>
                  <button
                    className="text-button"
                    onClick={() =>
                      explain(
                        "Your transcript, your control",
                        "We read your PDF on this device; it is not uploaded to a server. Review and correct detected school names and courses before saving them. Image-only PDFs and photos cannot be read yet: use a text-based PDF or enter courses manually. Saved course entries remain in this browser, without an online backup.",
                      )
                    }
                  >
                    How we use your transcript ↗
                  </button>
                  {pdfBusy && (
                    <div className="processing" role="status">
                      <progress aria-label="Reading your transcript" />
                      <div>
                        <strong>Reading your courses and school names</strong>
                        <p>
                          Next, you’ll review the details before we add them.
                          We’ll suggest subject areas after import.
                        </p>
                      </div>
                    </div>
                  )}
                  {pdfCourses.length > 0 && (
                    <div className="pending-review">
                      <span className="eyebrow">READY FOR YOUR REVIEW</span>
                      <h3>We found {pdfCourses.length} possible courses.</h3>
                      <p>
                        School names are suggestions. Confirm or correct every
                        source below. These courses haven’t been saved yet.
                      </p>
                      {detectedInstitutions.length > 0 && (
                        <p>
                          <strong>Possible schools:</strong>{" "}
                          {detectedInstitutions.join(", ")}
                        </p>
                      )}
                      <div className="pending-list">
                        {pdfCourses.map((course, index) => (
                          <div className="pending-course" key={index}>
                            <strong>
                              {course.code} · {course.title}
                            </strong>
                            <div className="form-grid">
                              {(
                                [
                                  "institution",
                                  "code",
                                  "title",
                                  "credits",
                                  "grade",
                                  "term",
                                ] as const
                              ).map((field) => (
                                <label key={field}>
                                  {
                                    {
                                      institution: "Source school",
                                      code: "Course code",
                                      title: "Course title",
                                      credits: "Credits",
                                      grade: "Grade",
                                      term: "Term",
                                    }[field]
                                  }
                                  <input
                                    type={
                                      field === "credits" ? "number" : "text"
                                    }
                                    step="0.25"
                                    value={course[field]}
                                    onChange={(e) =>
                                      setPdfCourses((list) =>
                                        list.map((item, i) =>
                                          i === index
                                            ? {
                                                ...item,
                                                [field]:
                                                  field === "credits"
                                                    ? Number(e.target.value)
                                                    : e.target.value,
                                              }
                                            : item,
                                        ),
                                      )
                                    }
                                  />
                                </label>
                              ))}
                            </div>
                            <button
                              className="text-button danger"
                              onClick={() =>
                                setPdfCourses((list) =>
                                  list.filter((_, i) => i !== index),
                                )
                              }
                            >
                              Remove this row
                            </button>
                          </div>
                        ))}
                      </div>
                      <div className="actions">
                        <button onClick={() => pdfInputRef.current?.click()}>
                          Add another transcript
                        </button>
                        <button className="primary" onClick={addPdfCourses}>
                          Add these courses & review →
                        </button>
                      </div>
                    </div>
                  )}
                  <details className="entry-option" id="manual-course-form">
                    <summary>
                      Don’t have a readable PDF? Add a course manually{" "}
                      <span>+</span>
                    </summary>
                    <p>
                      Use the course information from your transcript. Missing a
                      grade or term? You can add it later.
                    </p>
                    <form onSubmit={addCourse}>
                      <div className="form-grid">
                        <label className="full-width">
                          Source school
                          <input
                            required
                            value={form.institution}
                            onChange={(e) =>
                              setForm({ ...form, institution: e.target.value })
                            }
                            placeholder="School or learning provider"
                          />
                          {institutionMatches.length > 0 && (
                            <div className="reference-matches">
                              {institutionMatches.map((item) => (
                                <button
                                  type="button"
                                  key={item.id}
                                  onClick={() => {
                                    setForm({
                                      ...form,
                                      institution: item.official_name,
                                    });
                                    setInstitutionMatches([]);
                                  }}
                                >
                                  {item.official_name}
                                </button>
                              ))}
                            </div>
                          )}
                        </label>
                        <label>
                          Course code
                          <input
                            required
                            value={form.code}
                            onChange={(e) =>
                              setForm({ ...form, code: e.target.value })
                            }
                            placeholder="ENG 101"
                          />
                        </label>
                        <label>
                          Course title
                          <input
                            required
                            value={form.title}
                            onChange={(e) =>
                              setForm({ ...form, title: e.target.value })
                            }
                            placeholder="English Composition I"
                          />
                        </label>
                        <label>
                          Credits
                          <input
                            required
                            type="number"
                            min="0.25"
                            max="30"
                            step="0.25"
                            value={form.credits}
                            onChange={(e) =>
                              setForm({ ...form, credits: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Credit system
                          <select
                            value={form.creditSystem}
                            onChange={(e) =>
                              setForm({
                                ...form,
                                creditSystem: e.target.value as
                                  "semester" | "quarter",
                              })
                            }
                          >
                            <option value="semester">Semester</option>
                            <option value="quarter">Quarter</option>
                          </select>
                        </label>
                        <label>
                          Grade (optional)
                          <input
                            value={form.grade}
                            onChange={(e) =>
                              setForm({ ...form, grade: e.target.value })
                            }
                            placeholder="A, P, CR…"
                          />
                        </label>
                        <label>
                          Term (optional)
                          <input
                            value={form.term}
                            onChange={(e) =>
                              setForm({ ...form, term: e.target.value })
                            }
                            placeholder="Fall 2025"
                          />
                        </label>
                      </div>
                      <button className="primary" type="submit">
                        Add my course +
                      </button>
                    </form>
                  </details>
                  <details className="entry-option">
                    <summary>
                      Already have a spreadsheet? Import a CSV <span>+</span>
                    </summary>
                    <p>
                      Include columns named institution, code, title, and
                      credits. Optional columns: credit_system (semester or
                      quarter), grade, and term. Up to 500 rows and 2 MB per
                      file.
                    </p>
                    <label>
                      Choose a CSV file
                      <input
                        type="file"
                        accept=".csv,text/csv"
                        onChange={onCsv}
                      />
                    </label>
                  </details>
                </section>
                <aside>
                  <div className="panel side-note">
                    <span className="eyebrow">WHAT YOU’LL GET</span>
                    <h2>
                      One education history.
                      <br />
                      Every school included.
                    </h2>
                    <p>
                      We’ll keep your course titles, credits, grades, and
                      original schools together, then help you check the
                      details.
                    </p>
                    <div className="info-note">
                      <strong>Have a photo or scanned transcript?</strong>
                      <p>
                        Image reading isn’t available in Lite yet. Add your
                        courses manually or request a text-based PDF from your
                        school.
                      </p>
                    </div>
                  </div>
                  <div className="panel">
                    <h3>Your education so far</h3>
                    {schools.map((school) => (
                      <div className="school-card" key={school}>
                        <span className="mini-icon">▤</span>
                        <div>
                          <strong>{school}</strong>
                          <p>
                            {
                              courses.filter((c) => c.institution === school)
                                .length
                            }{" "}
                            courses ·{" "}
                            {courses
                              .filter((c) => c.institution === school)
                              .reduce(
                                (sum, c) => sum + semesterEquivalent(c),
                                0,
                              )
                              .toFixed(1)}{" "}
                            credits
                          </p>
                        </div>
                      </div>
                    ))}
                    {!schools.length && (
                      <p>When you add courses, each school will appear here.</p>
                    )}
                  </div>
                </aside>
              </div>
            )}
            {step === 2 && (
              <section className="panel">
                <div className="section-heading">
                  <div>
                    <h2>Your coursework</h2>
                    <p>
                      {courses.length} courses · {needingReview} awaiting your
                      review
                    </p>
                  </div>
                  <div className="chips">
                    <button
                      className={reviewFilter ? "selected" : ""}
                      aria-pressed={reviewFilter}
                      onClick={() => setReviewFilter(!reviewFilter)}
                    >
                      Needs my review
                    </button>
                    <button
                      disabled={!courses.length}
                      onClick={() => {
                        save(courses.map((c) => ({ ...c, reviewed: true })));
                        setMessage(
                          "All courses marked reviewed. You can still correct them anytime.",
                        );
                      }}
                    >
                      I’ve checked all courses ✓
                    </button>
                  </div>
                </div>
                <div className="info-note">
                  <strong>Subject area and degree use are different.</strong>
                  <p>
                    “Mathematics” describes a course’s learning. Whether it
                    fulfills a specific degree requirement depends on the
                    receiving school. Our subject suggestions are inferred from
                    course names, not documented transfer decisions.
                  </p>
                </div>
                <div className="course-list">
                  {visibleCourses.map((course) => (
                    <article className="course-card" key={course.id}>
                      <div className="course-main">
                        <span className="course-code">{course.code}</span>
                        <h3>{course.title}</h3>
                        <p>
                          {course.institution}{" "}
                          {course.term && "· " + course.term}
                        </p>
                        <div className="course-meta">
                          <span>
                            {course.credits} {course.creditSystem} credits
                          </span>
                          <span>Grade: {course.grade || "Not provided"}</span>
                          {course.edited && <span>Edited by you</span>}
                        </div>
                      </div>
                      <div className="course-classification">
                        <span className="tag">
                          {course.reviewed
                            ? "✓ Reviewed by you"
                            : "Needs your review"}
                        </span>
                        <strong>
                          {course.category.replace("Gen Ed — ", "")}
                        </strong>
                        <small>
                          {course.edited
                            ? "User supplied"
                            : "Suggested subject area"}{" "}
                          ·{" "}
                          {course.classificationConfidence === "high"
                            ? "Higher confidence"
                            : "Please confirm"}
                        </small>
                      </div>
                      <div className="course-actions">
                        <button
                          onClick={() => {
                            setMessage("");
                            setEditing({ ...course });
                          }}
                        >
                          Edit details
                        </button>
                        {!course.reviewed && (
                          <button
                            onClick={() =>
                              save(
                                courses.map((c) =>
                                  c.id === course.id
                                    ? { ...c, reviewed: true }
                                    : c,
                                ),
                              )
                            }
                          >
                            Looks right ✓
                          </button>
                        )}
                        <button
                          className="text-button danger"
                          onClick={() => {
                            if (
                              confirm(
                                "Remove " + course.code + " from this device?",
                              )
                            )
                              save(courses.filter((c) => c.id !== course.id));
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
                {!visibleCourses.length && (
                  <div className="empty-state">
                    <span className="mini-icon">✓</span>
                    <h3>
                      {courses.length
                        ? "You’ve reviewed every course."
                        : "Your course review starts here."}
                    </h3>
                    <p>
                      {courses.length
                        ? "You can turn off the filter to view or edit your coursework."
                        : "Add your education first. Then we’ll help you check what we found."}
                    </p>
                    <button
                      onClick={() =>
                        courses.length ? setReviewFilter(false) : navigate(1)
                      }
                    >
                      {courses.length
                        ? "View all courses"
                        : "Add my education →"}
                    </button>
                  </div>
                )}
                {showNextSteps && (
                  <div className="actions">
                    <button className="primary" onClick={generateReport}>
                      See my credit picture →
                    </button>
                    <button onClick={addMoreManually}>
                      Add more education
                    </button>
                  </div>
                )}
              </section>
            )}
            {step === 3 && (
              <>
                <div className="credit-overview">
                  <section className="credit-highlight">
                    <span className="eyebrow">YOUR STARTING POINT</span>
                    <strong>
                      {totalCredits.toFixed(1)}
                      <small>credits identified</small>
                    </strong>
                    <p>
                      Across {courses.length} courses and {schools.length}{" "}
                      sources.
                      <br />
                      Ready to explore—not yet confirmed for transfer.
                    </p>
                    <span className="tag">Semester-equivalent credits</span>
                  </section>
                  <section className="panel">
                    <h2>Your next step</h2>
                    <h3>
                      {!courses.length
                        ? "Add the education you want us to review."
                        : needingReview
                          ? `Review ${needingReview} courses before exploring further.`
                          : "Choose a school and degree to explore."}
                    </h3>
                    <p>
                      {needingReview
                        ? "Check the details so your education history reflects what you actually completed."
                        : "Your receiving school decides what it accepts and how each credit fits its requirements."}
                    </p>
                    <button
                      className="primary"
                      onClick={() => navigate(nextAction)}
                    >
                      Continue my review →
                    </button>
                    {quarterCredits > 0 && (
                      <p className="small">
                        {quarterCredits.toFixed(1)} quarter credits are shown as{" "}
                        {((quarterCredits * 2) / 3).toFixed(1)} semester credits
                        for comparison.
                      </p>
                    )}
                  </section>
                </div>
                <section className="panel">
                  <div className="section-heading">
                    <div>
                      <h2>Your academic breakdown</h2>
                      <p>
                        Click a subject area to see what it means and which
                        courses we placed there.
                      </p>
                    </div>
                    <button
                      className="text-button"
                      onClick={() =>
                        explain(
                          "Understanding identified credits",
                          "This total adds the credit values in your course entries, including rows whose grades may need review. It is not a transferable or earned-credit total. Withdrawals, failed courses, repeats, credit age, school policies, and degree limits can affect what is ultimately accepted. Quarter credits are converted at two-thirds for this display.",
                        )
                      }
                    >
                      What does this total mean? ↗
                    </button>
                  </div>
                  {Object.entries(categoryTotals).map(([bucket, credits]) => (
                    <button
                      className="bucket-row"
                      key={bucket}
                      onClick={() =>
                        explain(
                          bucket.replace("Gen Ed — ", ""),
                          (bucketHelp[bucket] ||
                            "A subject area suggested from your course information.") +
                            " Courses placed here: " +
                            courses
                              .filter((c) => c.category === bucket)
                              .map((c) => c.code + " — " + c.title)
                              .join("; ") +
                            ". A school may classify these differently or require additional documentation.",
                        )
                      }
                    >
                      <span>{bucket.replace("Gen Ed — ", "")}</span>
                      <div className="bucket-track">
                        <i
                          style={{
                            width: `${totalCredits ? (credits / totalCredits) * 100 : 0}%`,
                          }}
                        />
                      </div>
                      <strong>
                        {credits.toFixed(1)} <small>cr</small>
                      </strong>
                      <span>↗</span>
                    </button>
                  ))}
                  {!courses.length && (
                    <div className="empty-state">
                      <h3>Your learning will take shape here.</h3>
                      <p>
                        Add courses to see your subject areas and identified
                        credits.
                      </p>
                      <button onClick={() => navigate(1)}>
                        Add my education →
                      </button>
                    </div>
                  )}
                </section>
              </>
            )}
            {step === 4 && (
              <div className="content-grid">
                <section className="panel">
                  <h2>Do you know where you want to transfer?</h2>
                  <p>
                    Search the schools in our reference collection. We focus on
                    schools we can identify in our records; inclusion alone
                    doesn’t confirm a transfer policy.
                  </p>
                  <label>
                    Receiving school
                    <input
                      value={destinationQuery}
                      onChange={(e) => {
                        setDestinationQuery(e.target.value);
                        setDestinationSchool(null);
                        setSelectedProgramId("");
                      }}
                      placeholder="Type at least two letters of a school name"
                    />
                  </label>
                  {referenceStatus && <p role="status">{referenceStatus}</p>}
                  {destinationMatches.length > 0 && (
                    <div className="reference-matches">
                      {destinationMatches.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            setDestinationSchool(item);
                            setDestinationQuery("");
                            setDestinationMatches([]);
                            setReferenceStatus("");
                            setSelectedProgramId("");
                          }}
                        >
                          {item.official_name} <span>→</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {destinationSchool && (
                    <div className="selected-school">
                      <span className="eyebrow">YOUR RECEIVING SCHOOL</span>
                      <h3>{destinationSchool.official_name}</h3>
                      <p>
                        Now choose a listed degree program to keep with your
                        coursework.
                      </p>
                      {programsBusy ? (
                        <p role="status">Finding listed programs…</p>
                      ) : evaluatedPrograms.length ? (
                        <label>
                          Degree program
                          <select
                            value={selectedProgramId}
                            onChange={(e) =>
                              setSelectedProgramId(e.target.value)
                            }
                          >
                            <option value="">Choose a degree program</option>
                            {evaluatedPrograms.map((program) => (
                              <option
                                key={program.program_version_id || program.id}
                                value={program.program_version_id || program.id}
                              >
                                {program.official_program_name ||
                                  program.official_program_family_name ||
                                  "Listed program"}
                                {program.academic_catalog_year
                                  ? " · " + program.academic_catalog_year
                                  : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : (
                        <div className="info-note">
                          <strong>
                            No listed programs available right now.
                          </strong>
                          <p>
                            You can choose another school or keep this school in
                            your plan and ask it directly about the degree you
                            want.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="separated">
                    <h3>Still deciding? That’s okay.</h3>
                    <p>
                      You can keep your coursework and come back to choose a
                      school. Lite doesn’t yet rank schools by speed, tuition,
                      or credit fit.
                    </p>
                    <button onClick={() => navigate(5)}>
                      Build my next-step checklist →
                    </button>
                  </div>
                </section>
                <aside className="panel side-note">
                  <span className="eyebrow">A CLEARER COMPARISON</span>
                  <h2>
                    Know what’s a fact.
                    <br />
                    Know what’s a possibility.
                  </h2>
                  <dl className="evidence-list">
                    <dt>Provided by you</dt>
                    <dd>
                      Your coursework, grades, school names, and corrections.
                    </dd>
                    <dt>Suggested by Transcript Lite</dt>
                    <dd>Academic subject areas inferred from course names.</dd>
                    <dt>Listed in our reference collection</dt>
                    <dd>
                      School and program names. A listing isn’t proof that your
                      credits will transfer.
                    </dd>
                    <dt>School confirmation required</dt>
                    <dd>
                      Acceptance, course equivalency, degree placement, and
                      remaining requirements.
                    </dd>
                  </dl>
                  <button
                    className="text-button"
                    onClick={() =>
                      explain(
                        "Why a course can count differently",
                        "Introduction to Programming describes computer science learning. It could fill a core requirement in a computer science degree, a supporting requirement in cybersecurity, or elective space elsewhere—but only when the receiving school’s requirements and policies support that use. Lite currently organizes the course subject; it does not perform that school-specific matching.",
                      )
                    }
                  >
                    Why can a course count differently? ↗
                  </button>
                </aside>
              </div>
            )}
            {step === 5 && (
              <>
                <section className="plan-banner">
                  <div>
                    <span className="eyebrow">
                      YOUR PERSONAL STARTING POINT
                    </span>
                    <h2>You have a path forward.</h2>
                    <p>
                      {courses.length
                        ? `${courses.length} courses and ${totalCredits.toFixed(1)} identified credits to bring into your next conversation.`
                        : "Start with the education you have, then take it one decision at a time."}
                    </p>
                  </div>
                  <button
                    className="primary"
                    onClick={() => navigate(nextAction === 5 ? 3 : nextAction)}
                  >
                    {!courses.length
                      ? "Add my education"
                      : needingReview
                        ? "Review my courses"
                        : !selectedProgram
                          ? "Explore a school"
                          : "Review my credit picture"}{" "}
                    →
                  </button>
                </section>
                <div className="content-grid">
                  <section className="panel">
                    <h2>Your next-step checklist</h2>
                    <ol className="checklist">
                      <li>
                        <span>{courses.length ? "✓" : "1"}</span>
                        <div>
                          <strong>Bring all of your education together</strong>
                          <p>
                            {schools.length
                              ? schools.join(" · ")
                              : "Add transcripts or individual courses from every source you want considered."}
                          </p>
                          <button
                            className="text-button"
                            onClick={() => navigate(1)}
                          >
                            Add or view education ↗
                          </button>
                        </div>
                      </li>
                      <li>
                        <span>
                          {courses.length && !needingReview ? "✓" : "2"}
                        </span>
                        <div>
                          <strong>Confirm your coursework</strong>
                          <p>
                            {courses.length
                              ? `${needingReview} courses still need your review. Check repeats, grades, credits, and school names.`
                              : "Review each course after adding your education."}
                          </p>
                          <button
                            className="text-button"
                            onClick={() => navigate(2)}
                          >
                            Review my courses ↗
                          </button>
                        </div>
                      </li>
                      <li>
                        <span>{selectedProgram ? "✓" : "3"}</span>
                        <div>
                          <strong>Choose your school and degree</strong>
                          <p>
                            {destinationSchool?.official_name ||
                              "Your receiving school is still open."}
                            <br />
                            {selectedProgram
                              ? selectedProgram.official_program_name ||
                                selectedProgram.official_program_family_name
                              : "Your degree program is still open."}
                          </p>
                          <button
                            className="text-button"
                            onClick={() => navigate(4)}
                          >
                            Explore my options ↗
                          </button>
                        </div>
                      </li>
                      <li>
                        <span>4</span>
                        <div>
                          <strong>Ask for the school’s official review</strong>
                          <p>
                            Ask which courses it accepts, where they apply,
                            minimum grades, credit-age limits, required credits
                            taken at the school, and what remains. Verify ACE or
                            NCCRS acceptance and degree placement separately
                            before buying a course.
                          </p>
                        </div>
                      </li>
                    </ol>
                  </section>
                  <aside>
                    <section className="panel">
                      <h2>Make room for your next chapter.</h2>
                      <p>
                        How much time could you set aside for studying each
                        week?
                      </p>
                      <label htmlFor="study-hours">
                        {hours} hours per week
                        <input
                          id="study-hours"
                          type="range"
                          min="1"
                          max="40"
                          value={hours}
                          onChange={(e) => setHours(Number(e.target.value))}
                        />
                      </label>
                      <p className="small">
                        This saves a planning preference. A completion date or
                        tuition estimate needs verified remaining requirements
                        and course schedules; Lite doesn’t calculate these yet.
                      </p>
                    </section>
                    <section className="panel">
                      <h3>Keep your starting point</h3>
                      <p>
                        Download your courses or print your credit picture and
                        checklist for a school advisor.
                      </p>
                      <div className="actions">
                        <button onClick={exportCsv} disabled={!courses.length}>
                          Download my coursework ↓
                        </button>
                        <button
                          onClick={() => window.print()}
                          disabled={!courses.length}
                        >
                          Print my review
                        </button>
                        <button
                          className="text-button danger"
                          onClick={clearAll}
                          disabled={!courses.length}
                        >
                          Clear coursework from this device
                        </button>
                      </div>
                    </section>
                  </aside>
                </div>
              </>
            )}
            <div className="step-navigation">
              <button onClick={() => navigate(step - 1)}>
                ← {step === 0 ? "Welcome" : "Back"}
              </button>
              <span>{step + 1} of 6</span>
              {step < 5 && (
                <button
                  className="primary"
                  onClick={() => navigate(step + 1)}
                  disabled={
                    (step === 1 &&
                      (!courses.length || pdfBusy || pdfCourses.length > 0)) ||
                    (step === 2 && !courses.length)
                  }
                >
                  {
                    [
                      "Continue to my education",
                      "Review my courses",
                      "See my credit picture",
                      "Explore degree paths",
                      "Build my next-step plan",
                    ][step]
                  }{" "}
                  →
                </button>
              )}
            </div>
          </>
        )}
        <section className="print-summary">
          <h2>My Transcript Lite review</h2>
          <p>
            {totalCredits.toFixed(1)} semester-equivalent credits identified
            across {courses.length} courses. {needingReview} courses await
            review. These totals are not confirmed transfer credit.
          </p>
          <p>
            Priorities: {goals.join(", ") || "Not selected"} · Interests:{" "}
            {interests.join(", ") || degreeGoal}
          </p>
          <p>
            School: {destinationSchool?.official_name || "Not selected"} ·
            Program:{" "}
            {selectedProgram?.official_program_name ||
              selectedProgram?.official_program_family_name ||
              "Not selected"}
          </p>
          <table>
            <thead>
              <tr>
                <th>School</th>
                <th>Course</th>
                <th>Credits</th>
                <th>Grade</th>
                <th>Subject</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td>{c.institution}</td>
                  <td>
                    {c.code} — {c.title}
                  </td>
                  <td>
                    {c.credits} {c.creditSystem}
                  </td>
                  <td>{c.grade}</td>
                  <td>{c.category}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
      <footer>
        <div className="footer-heading">
          <strong>
            Transcript Lite <span>by The Degree Agency</span>
          </strong>
          <button
            className="text-button"
            onClick={() =>
              explain(
                "Our commitment to a clear review",
                "You provide your education history. We organize course information, suggest academic subject areas, and show public school and program listings. We do not currently calculate documented equivalencies, degree matches, remaining credits, tuition, or completion dates. The receiving institution makes final admission, transfer, and graduation decisions. You can edit every course, download a copy, or remove local coursework. See the Privacy and Security pages for details.",
              )
            }
          >
            How our recommendations work ↗
          </button>
        </div>
        <p>
          Educational planning support. Final admission, transfer-credit
          acceptance, course equivalencies, degree applicability, and graduation
          requirements are determined by the receiving institution. The Degree
          Agency is not a college or an official transcript evaluator.
        </p>
        <nav className="legal-links" aria-label="Policies">
          {[
            ["privacy", "Privacy"],
            ["terms", "Terms"],
            ["cookies", "Cookies & local storage"],
            ["disclaimer", "Educational disclaimer"],
            ["accessibility", "Accessibility"],
            ["security", "Security"],
          ].map(([path, title]) => (
            <a key={path} href={"/" + path + ".html"}>
              {title}
            </a>
          ))}
          <a href="https://degreedean.com" target="_blank" rel="noreferrer">
            Contact Degree Agency ↗
          </a>
        </nav>
        <p className="small">
          Saved on this browser only. No account or cloud backup. Clearing
          browser data may remove your coursework.
        </p>
      </footer>
      {help && (
        <dialog
          ref={helpRef}
          className="help-dialog"
          aria-labelledby="explanation-title"
          onClose={() => setHelp(null)}
        >
          <div className="dialog-head">
            <span className="eyebrow">A LITTLE CLARITY</span>
            <button
              onClick={() => {
                helpRef.current?.close();
                setHelp(null);
              }}
              aria-label="Close explanation"
            >
              ×
            </button>
          </div>
          <h2 id="explanation-title">{help.title}</h2>
          <p>{help.text}</p>
          <button
            className="primary"
            onClick={() => {
              helpRef.current?.close();
              setHelp(null);
            }}
          >
            Got it
          </button>
        </dialog>
      )}
      {editing && (
        <dialog
          ref={editRef}
          className="edit-dialog"
          aria-labelledby="edit-title"
          onClose={() => setEditing(null)}
        >
          <div className="dialog-head">
            <span className="eyebrow">YOUR COURSES, YOUR CONTROL</span>
            <button
              onClick={() => {
                editRef.current?.close();
                setEditing(null);
              }}
              aria-label="Close course editor"
            >
              ×
            </button>
          </div>
          <h2 id="edit-title">Edit course details</h2>
          <p>Your corrections will be marked “Edited by you.”</p>
          <form onSubmit={updateCourse}>
            <div className="form-grid">
              {(
                [
                  "institution",
                  "code",
                  "title",
                  "credits",
                  "grade",
                  "term",
                ] as const
              ).map((field) => (
                <label key={field}>
                  {
                    {
                      institution: "Source school",
                      code: "Course code",
                      title: "Course title",
                      credits: "Credits",
                      grade: "Grade",
                      term: "Term",
                    }[field]
                  }
                  <input
                    required={[
                      "institution",
                      "code",
                      "title",
                      "credits",
                    ].includes(field)}
                    type={field === "credits" ? "number" : "text"}
                    min={field === "credits" ? "0.25" : undefined}
                    max={field === "credits" ? "30" : undefined}
                    step="0.25"
                    value={editing[field]}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        [field]:
                          field === "credits"
                            ? Number(e.target.value)
                            : e.target.value,
                      })
                    }
                  />
                </label>
              ))}
              <label>
                Credit system
                <select
                  value={editing.creditSystem}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      creditSystem: e.target.value as "semester" | "quarter",
                    })
                  }
                >
                  <option value="semester">Semester</option>
                  <option value="quarter">Quarter</option>
                </select>
              </label>
              <label>
                Academic classification
                <select
                  value={editing.category}
                  onChange={(e) =>
                    setEditing({ ...editing, category: e.target.value })
                  }
                >
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat.replace("Gen Ed — ", "")}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {message && <p role="alert">{message}</p>}
            <button className="primary" type="submit">
              Save corrections & mark reviewed ✓
            </button>
          </form>
        </dialog>
      )}
    </div>
  );
}
