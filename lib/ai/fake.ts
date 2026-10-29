import type { AiFeature } from "@/config/ai";
import type { ChatResult } from "@/lib/ai/openrouter";
import { AppError } from "@/lib/errors";

/**
 * Offline "model" used when AI_PROVIDER=fake (tests, local development, e2e). It is deterministic and only
 * covers the outreach features; every handler reads the structured <input>…</input> JSON block (or the
 * <page> text) that the real prompts also contain, so prompts and fake stay in step.
 * It is refused in production by the startup check.
 */
type Handler = (user: string) => unknown;

function block(user: string, tag: string): string {
  const m = user.match(new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`));
  return m ? m[1] : "";
}
const input = (user: string) => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return JSON.parse(block(user, "input")) as Record<string, any>;
  } catch {
    return {};
  }
};


const HANDLERS: Partial<Record<AiFeature, Handler>> = {
  extract_job: (user) => {
    const page = block(user, "page");
    const lines = page.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const title = lines[0]?.replace(/^(title|job title)\s*:\s*/i, "") ?? "Untitled role";
    const company =
      lines.map((l) => l.match(/^(?:company|employer)\s*:\s*(.+)$/i)?.[1]).find(Boolean) ??
      lines.map((l) => l.match(/\bat\s+([A-Z][\w&.\- ]{1,40})$/)?.[1]).find(Boolean) ??
      "Unknown company";
    const location = lines.map((l) => l.match(/^location\s*:\s*(.+)$/i)?.[1]).find(Boolean) ?? null;
    const requirements = lines.filter((l) => /^[-•*]\s+/.test(l)).map((l) => l.replace(/^[-•*]\s+/, "")).slice(0, 12);
    return { title: title.slice(0, 200), company: company.trim().slice(0, 150), location, description: page.slice(0, 8000), requirements };
  },

  rank_targets: (user) => {
    const people: Array<{ id: string }> = input(user).people ?? [];
    return { order: people.map((p) => p.id).sort() };
  },

  draft_outreach: (user) => {
    const i = input(user);
    const first = String(i.profile?.firstName ?? "").trim() || "there";
    const role = i.job?.title ?? "the role";
    const company = i.job?.company ?? "your company";
    const skill = (i.profile?.topSkills ?? []).slice(0, 2).join(" and ");
    const fact = i.profile?.headline ? `I am currently ${i.profile.headline}.` : "";
    const greet = String(i.target?.firstName ?? "").trim() ? `Hi ${i.target.firstName},` : "Hi there,";
    const bodyFor = (step: number) =>
      step === 1
        ? `${greet}\n\nI came across the ${role} opening at ${company} and wanted to reach out. ${fact} ${skill ? `My work centres on ${skill}.` : ""} If it is not a bother, could you point me to the right person for this role, or share how the team hires? Happy to send my resume.\n\nThank you,\n${first}`
        : step === 2
          ? `${greet}\n\nA quick follow-up on my note about the ${role} role at ${company}. If now is not a good time, no problem at all.\n\nThank you,\n${first}`
          : `${greet}\n\nLast note from me about the ${role} role at ${company}. I will not follow up again, and wish the team well.\n\nThank you,\n${first}`;
    const subjects: Record<number, string> = { 1: `Question about the ${role} role`, 2: `Following up: ${role}`, 3: `Closing the loop: ${role}` };
    const steps: number[] = i.steps ?? [1, 2, 3];
    return {
      email: steps.map((step) => ({ step, subject: subjects[step].slice(0, 80), body: bodyFor(step).replace(/ +/g, " ") })),
      linkedinNote: `Hi ${i.target?.firstName || "there"}, I am interested in the ${role} role at ${company}. ${skill ? `I work with ${skill}. ` : ""}Would be glad to connect.`.slice(0, 290),
      linkedinMessage: `Thanks for connecting, ${i.target?.firstName || "there"}. I am applying for the ${role} role at ${company}. Would you be open to sharing a quick pointer on how the team hires? No pressure at all.`,
    };
  },

  classify_reply: (user) => {
    const t = String(input(user).text ?? "").toLowerCase();
    const pick = (classification: string, reason: string) => ({ classification, reason });
    if (/(out of (the )?office|on leave|auto-?reply|vacation)/.test(t)) return pick("OUT_OF_OFFICE", "Looks like an automatic reply.");
    if (/(refer|forward(ed)? (this|your)|pass(ed)? (this|your)|introduce you|talk to)/.test(t)) return pick("REFERRAL", "They offered a referral or introduction.");
    if (/(not (hiring|a fit)|no longer|unfortunately|we have filled|cannot help|can't help)/.test(t)) return pick("NO", "They declined.");
    if (/(later|next (quarter|month)|not right now|check back)/.test(t)) return pick("NOT_NOW", "They suggested a later time.");
    if (/(interested|let's (talk|chat)|call|schedule|send (me )?your resume|happy to)/.test(t)) return pick("INTERESTED", "They showed interest.");
    return pick("OTHER", "No clear intent.");
  },

  suggest_reply: (user) => {
    const i = input(user);
    return { text: `Hi ${i.contactFirstName || "there"},\n\nThank you for getting back to me. ${i.classification === "INTERESTED" ? "I would be glad to share more or find a time that suits you." : "I appreciate your time and wish you and the team well."}\n\nBest,\n${i.candidateFirstName || ""}`.trim() };
  },
};

export function fakeChat(opts: { feature: AiFeature; system: string; user: string }): ChatResult {
  const handler = HANDLERS[opts.feature];
  if (!handler) {
    throw new AppError(`The offline AI model does not implement "${opts.feature}". Use a real AI provider for this feature.`, 503, "ai_unavailable");
  }
  const text = JSON.stringify(handler(opts.user));
  return { text, stop: "end", inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 };
}
