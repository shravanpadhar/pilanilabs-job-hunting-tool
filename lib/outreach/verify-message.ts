import type { ResumeData } from "@/lib/resume/schema";

/**
 * Message verifier (spec section 9): names, employers, schools, numbers and links in a draft must exist in the
 * candidate's profile or in the data we hold about the job and the recipient. It is the same idea as the resume
 * no-fabrication guard (lib/resume/verify.ts), applied to prose. It never trusts the model: a draft that fails is
 * corrected once, then replaced by a deterministic template that passes by construction.
 */
export interface MessageViolation {
  kind: "number" | "name" | "link" | "mutual_connection" | "flattery" | "pressure" | "length";
  value: string;
}

export interface VerifyContext {
  resume: ResumeData;
  job: { title: string; company: string; location: string | null; description: string; requirements: string[] };
  target: { fullName: string; title: string | null; company: string; warmEvidence: { kind: "school" | "employer"; value: string } | null };
  senderName: string;
}

const norm = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9+#.]+/g, " ").replace(/\.(?=\s|$)/g, "").replace(/\s+/g, " ").trim();

/** Everything a message is allowed to mention, normalised into one searchable string. */
export function allowedCorpus(ctx: VerifyContext): string {
  const parts = [
    JSON.stringify(ctx.resume), ctx.job.title, ctx.job.company, ctx.job.location ?? "", ctx.job.description, ...ctx.job.requirements,
    ctx.target.fullName, ctx.target.title ?? "", ctx.target.company, ctx.senderName, ctx.target.warmEvidence?.value ?? "",
  ];
  return ` ${norm(parts.join(" \n "))} `;
}

const WORD = (s: string) => (s.match(/\S+/g) ?? []).length;
export const wordCount = WORD;

const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;
const numbers = (s: string) => (s.match(NUMBER_RE) ?? []).map((n) => n.replace(/,/g, "").replace(/^0+(?=\d)/, ""));

const COMMON_CAPS = new Set([
  "i", "i'm", "i'd", "i'll", "i've", "hi", "hello", "dear", "thanks", "thank", "best", "regards", "sincerely", "cheers", "kind", "warm", "yours", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december",
  "linkedin", "gmail", "pdf", "cv", "ok", "ps", "p.s", "ai", "ml", "ui", "ux", "qa", "hr", "it", "api", "sql", "css", "html", "aws", "gcp", "sdk", "saas", "b2b", "b2c",
]);

const SENTENCE_STARTERS = new Set(["at", "in", "on", "my", "the", "as", "for", "with", "we", "our", "this", "that", "these", "it", "so", "if", "when", "after", "before", "since", "also", "currently", "previously", "recently", "over", "during", "while", "by", "from", "to", "and", "but", "or", "your", "their", "his", "her", "its", "while", "being", "having", "working", "based"]);

/** Candidate proper-noun phrases: runs of Capitalised / ALLCAPS tokens that are not just a sentence's first word. */
export function properNounPhrases(text: string): string[] {
  const out: string[] = [];
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    const tokens = sentence.split(/\s+/).map((t) => t.replace(/^[("'“]+|[)"'”,;:!?]+$/g, "").replace(/'s$/i, "")).filter(Boolean);
    let run: string[] = [];
    const flush = (startsSentence: boolean) => {
      // "At Initech I ..." : a sentence-opening function word is capitalised only by grammar, so drop it from the phrase.
      if (startsSentence && run.length > 1 && SENTENCE_STARTERS.has(run[0].toLowerCase())) {
        run = run.slice(1);
        startsSentence = false;
      }
      // A single capitalised word that merely starts a sentence is ordinary grammar, not a name.
      if (run.length > 1 || (run.length === 1 && !startsSentence)) out.push(run.join(" "));
      run = [];
    };
    let runStartsSentence = false;
    tokens.forEach((tok, idx) => {
      const clean = tok.replace(/\.$/, "");
      const isCap = /^[A-Z][A-Za-z0-9&.+#'-]*$/.test(clean) && !COMMON_CAPS.has(clean.toLowerCase());
      if (isCap) {
        if (run.length === 0) runStartsSentence = idx === 0;
        run.push(clean);
      } else flush(runStartsSentence);
    });
    flush(runStartsSentence);
  }
  return out;
}

const MUTUAL = [
  /\bmutual (connection|friend|contact|acquaintance)s?\b/i,
  /\b(we|you and i) (both|share|have in common|met|know each other|know the same|worked together|go way back)\b/i,
  /\b(fellow|same) (alum|alumn[ai]|alumnus|college|school|university|institute|batch)\b/i,
  /\b(former|ex)[- ]colleagues?\b/i,
  /\b(common|shared) (connection|background|friend|contact|network)s?\b/i,
  /\b(referred|recommended|introduced) (to you )?by\b/i,
  /\b\w+ (suggested|told me|mentioned) (that )?i (should )?(reach|contact|write|get in touch)/i,
];
const FLATTERY = /\b(amazing|incredible|inspiring|world[- ]class|huge fan|big fan|love your work|admire your|blown away|legendary|rockstar|visionary|best in the (world|industry))\b/i;
const PRESSURE = /\b(urgent(ly)?|asap|immediately|last chance|act now|time[- ]sensitive|must reply|you must|don'?t miss|final warning|right away)\b/i;

export function verifyMessage(text: string, ctx: VerifyContext): MessageViolation[] {
  const out: MessageViolation[] = [];
  const corpus = allowedCorpus(ctx);
  const have = (phrase: string) => corpus.includes(` ${norm(phrase)} `);

  // Numbers: only figures present in the profile, the job or the recipient data.
  const allowedNumbers = new Set(numbers(corpus));
  for (const n of numbers(text)) if (!allowedNumbers.has(n)) out.push({ kind: "number", value: n });

  // Names, employers, schools and products: every proper-noun phrase must exist in what we know.
  for (const phrase of properNounPhrases(text)) {
    if (!have(phrase)) out.push({ kind: "name", value: phrase });
  }

  // Links and addresses: only links the candidate already lists on their resume.
  const links = new Set(ctx.resume.contact.links.map((l) => l.url.toLowerCase().replace(/\/+$/, "")));
  for (const m of text.matchAll(/\b(?:https?:\/\/|www\.)[^\s)>"']+/gi)) {
    if (!links.has(m[0].toLowerCase().replace(/[.,;]+$/, "").replace(/\/+$/, ""))) out.push({ kind: "link", value: m[0] });
  }
  for (const m of text.matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi)) {
    if (m[0].toLowerCase() !== (ctx.resume.contact.email ?? "").toLowerCase()) out.push({ kind: "link", value: m[0] });
  }

  // Claimed relationships: allowed only for a real warm path, and only by naming the shared school or employer.
  const warm = ctx.target.warmEvidence;
  for (const re of MUTUAL) {
    const hit = text.match(re);
    if (hit && !(warm && text.toLowerCase().includes(warm.value.toLowerCase()) && have(warm.value))) out.push({ kind: "mutual_connection", value: hit[0] });
  }
  const flat = text.match(FLATTERY);
  if (flat) out.push({ kind: "flattery", value: flat[0] });
  const press = text.match(PRESSURE);
  if (press) out.push({ kind: "pressure", value: press[0] });
  return out;
}

export function describeViolations(v: MessageViolation[]): string {
  return v.map((x) => `${x.kind}: "${x.value}"`).join("; ");
}
