import { AMBIGUOUS_SKILLS, SKILLS, SKILL_ALIASES } from "@/config/skills";

export const STOPWORDS = new Set(
  (
    "a an the and or of to in on for with at by from as is are be been being this that these those it its we you your our their they he she " +
    "will can may must should would could have has had do does did not no yes but if then than so such into over under about across per via " +
    "etc eg ie new use used using work working works team teams role roles job jobs company candidate candidates ability strong good great " +
    "excellent years year experience experienced required requirements preferred plus including include includes responsibilities responsible " +
    "looking join help ensure make build building develop developing within across able also well more most other any all each both own " +
    "who what which when where how why while only just very high highly day days time one two three based related knowledge understanding " +
    "skills skill qualifications qualification position opportunity apply applicant benefits salary full part remote hybrid onsite office " +
    "us who's what's i'm you'll we're"
  ).split(/\s+/),
);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Lowercase, collapse whitespace, keep tech characters (+ # . / -). */
export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+#./\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type SkillMatcher = { canonical: string; re: RegExp };

function buildMatchers(): SkillMatcher[] {
  const forms = new Map<string, string>(); // surface form → canonical
  for (const s of SKILLS) forms.set(s, s);
  for (const [alias, canonical] of Object.entries(SKILL_ALIASES)) forms.set(alias, canonical);
  const out: SkillMatcher[] = [];
  for (const [form, canonical] of forms) {
    if (AMBIGUOUS_SKILLS.has(form)) continue; // handled separately
    out.push({ canonical, re: new RegExp(`(?<![a-z0-9+#.])${escapeRe(form)}(?![a-z0-9+#]|\\.[a-z0-9])`, "i") });
  }
  return out;
}

let MATCHERS: SkillMatcher[] | null = null;

/** Canonical skills mentioned in free text. */
export function extractSkills(text: string): string[] {
  MATCHERS ??= buildMatchers();
  const norm = text.replace(/\s+/g, " ");
  const found = new Set<string>();
  for (const m of MATCHERS) if (m.re.test(norm)) found.add(m.canonical);

  // Ambiguous single words only count when they appear in a list-like line (e.g. "Python, Go, SQL").
  for (const line of text.split(/\n|\. /)) {
    const separators = (line.match(/[,;|•/]/g) ?? []).length;
    if (separators < 2) continue;
    if (/(?:^|[\s,;(|/•])Go(?=[\s,;)|/•.]|$)/.test(line)) found.add("go");
    if (/(?:^|[\s,;(|/•])R(?=[\s,;)|/•.]|$)/.test(line)) found.add("r");
    if (/(?:^|[\s,;(|/•])C(?=[\s,;)|/•.]|$)/.test(line)) found.add("c");
    for (const amb of ["swift", "excel", "spring", "express", "rag", "sales", "pricing", "growth", "lean"]) {
      if (new RegExp(`(?:^|[\\s,;(|/•])${amb}(?=[\\s,;)|/•.]|$)`, "i").test(line)) found.add(amb);
    }
  }
  if (/\bgolang\b/i.test(text)) found.add("go");
  return Array.from(found);
}

/** Does `text` contain the (canonical or alias) skill? */
export function textHasSkill(text: string, skill: string): boolean {
  return extractSkills(text).includes(skill.toLowerCase());
}

export function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(" ")
    .map((t) => t.replace(/^[.\-/]+|[.\-/]+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t) && !/^\d+$/.test(t));
}

/** Jaccard-style overlap of the token sets, biased toward the smaller set. */
export function tokenOverlap(a: string, b: string): number {
  const A = new Set(tokenize(a));
  const B = new Set(tokenize(b));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / Math.min(A.size, B.size);
}

/** Most important non-skill terms in a job description (bigrams and unigrams repeated or in requirement lines). */
export function keyTerms(text: string, limit = 15): string[] {
  const tokens = tokenize(text);
  const counts = new Map<string, number>();
  const bump = (k: string, w: number) => counts.set(k, (counts.get(k) ?? 0) + w);
  for (let i = 0; i < tokens.length; i++) {
    bump(tokens[i], 1);
    if (i + 1 < tokens.length) bump(`${tokens[i]} ${tokens[i + 1]}`, 1.5);
  }
  const skillWords = new Set(SKILLS.flatMap((s) => s.split(" ")));
  return Array.from(counts.entries())
    .filter(([k, c]) => c >= 2 && !skillWords.has(k) && k.length > 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([k]) => k);
}
