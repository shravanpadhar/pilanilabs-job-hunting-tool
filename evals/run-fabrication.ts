/**
 * Fabrication evaluation harness (spec section 9, "Evaluation before launch").
 *
 *   npm run eval:fabrication                # offline: checks the verifier against the labelled golden set (no AI, no keys)
 *   npm run eval:fabrication -- --live      # also drafts with the configured real model for each profile and checks the output
 *
 * Exit code is non-zero when the target is missed: the verifier must classify EVERY golden case correctly, and (in --live mode)
 * the model's drafts must produce ZERO fabrication after the verifier loop. Grow `golden/fabrication.golden.json` towards ~200
 * human-reviewed pairs; run this on every prompt or model change (regression suite).
 */
import fs from "node:fs";
import path from "node:path";
import { resumeSchema } from "../lib/resume/schema";
import { verifyMessage, type MessageViolation, type VerifyContext } from "../lib/outreach/verify-message";

export interface GoldenCase {
  id: string;
  profile: string;
  expect: "clean" | "violations";
  kinds?: string[];
  text: string;
  target?: VerifyContext["target"];
}
export interface Golden {
  profiles: Record<string, unknown>;
  job: VerifyContext["job"];
  target: VerifyContext["target"];
  cases: GoldenCase[];
}

export interface CaseResult {
  id: string;
  ok: boolean;
  expected: string;
  found: MessageViolation[];
  note?: string;
}

export function loadGolden(file = path.join(__dirname, "golden", "fabrication.golden.json")): Golden {
  return JSON.parse(fs.readFileSync(file, "utf8")) as Golden;
}

/** Offline mode: does the verifier agree with every human label? */
export function checkVerifier(g: Golden): CaseResult[] {
  return g.cases.map((c) => {
    const resume = resumeSchema.parse(g.profiles[c.profile]);
    const ctx: VerifyContext = { resume, job: g.job, target: c.target ?? g.target, senderName: resume.contact.name ?? "" };
    const found = verifyMessage(c.text, ctx);
    if (c.expect === "clean") return { id: c.id, ok: found.length === 0, expected: "no violations", found };
    const kinds = new Set(found.map((v) => v.kind));
    const missing = (c.kinds ?? []).filter((k) => !kinds.has(k as MessageViolation["kind"]));
    return { id: c.id, ok: found.length > 0 && missing.length === 0, expected: `violations: ${(c.kinds ?? []).join(", ")}`, found, note: missing.length ? `missed: ${missing.join(", ")}` : undefined };
  });
}

/** Live mode: draft with the real model and require zero fabrication in what would actually be shown to the candidate. */
async function checkLive(g: Golden): Promise<CaseResult[]> {
  const { generateDraftSet } = await import("../lib/outreach/draft");
  const out: CaseResult[] = [];
  for (const [name, raw] of Object.entries(g.profiles)) {
    const resume = resumeSchema.parse(raw);
    const ctx: VerifyContext = { resume, job: g.job, target: g.target, senderName: resume.contact.name ?? "" };
    const gen = await generateDraftSet("eval", ctx, { fullName: g.target.fullName, title: g.target.title, roleType: "HIRING_MANAGER" });
    const texts = [...gen.set.email.map((e) => `${e.subject}\n${e.body}`), gen.set.linkedinNote, gen.set.linkedinMessage];
    const found = texts.flatMap((t) => verifyMessage(t, ctx));
    out.push({ id: `live:${name}:${gen.source}`, ok: found.length === 0, expected: "zero fabrication", found, note: gen.source === "fallback" ? "model draft rejected; safe template used" : undefined });
  }
  return out;
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const golden = loadGolden();
  const results = checkVerifier(golden);
  if (argv.includes("--live")) results.push(...(await checkLive(golden)));
  const failed = results.filter((r) => !r.ok);
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id}${r.note ? `  (${r.note})` : ""}${r.ok ? "" : `  expected ${r.expected}, found ${JSON.stringify(r.found)}`}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed. Fabrication target: zero.`);
  return failed.length ? 1 : 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code));
}
