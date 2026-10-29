import type { ResumeData } from "@/lib/resume/schema";

/**
 * Deterministic fallback drafts. They are used when the model's draft still fails the verifier after one corrective
 * retry, or when no AI is available. They only use facts that are already in the profile, the job and the recipient
 * record, so they pass the verifier by construction (a unit test proves it for a spread of profiles).
 */
export interface TemplateInput {
  candidateFirstName: string;
  headline: string | null; // "Frontend Engineer at Initech"
  topSkills: string[];
  job: { title: string; company: string };
  targetFirstName: string | null;
  warmSchool: string | null;
}

const firstName = (full: string | null | undefined) => (full ?? "").trim().split(/\s+/)[0] ?? "";

export function templateInputFrom(resume: ResumeData, job: { title: string; company: string }, target: { fullName: string; roleType: string; warmEvidence: { kind: string; value: string } | null }): TemplateInput {
  const latest = resume.experience[0];
  return {
    candidateFirstName: firstName(resume.contact.name) || "there",
    headline: latest ? `${latest.title} at ${latest.company}` : null,
    topSkills: [...resume.skills.technical, ...resume.skills.tools].slice(0, 2),
    job,
    targetFirstName: firstName(target.fullName) || null,
    warmSchool: target.roleType === "WARM_PATH" && target.warmEvidence?.kind === "school" ? target.warmEvidence.value : null,
  };
}

export interface DraftSet {
  email: Array<{ step: 1 | 2 | 3; subject: string; body: string }>;
  linkedinNote: string;
  linkedinMessage: string;
}

export function fallbackDrafts(t: TemplateInput): DraftSet {
  const greet = t.targetFirstName ? `Hi ${t.targetFirstName},` : "Hi there,";
  const role = t.job.title;
  const company = t.job.company;
  const me = t.candidateFirstName;
  const about = t.headline ? `I am currently a ${t.headline}.` : "";
  const skills = t.topSkills.length ? `My work centres on ${t.topSkills.join(" and ")}.` : "";
  const warm = t.warmSchool ? ` I noticed we both studied at ${t.warmSchool}.` : "";
  return {
    email: [
      { step: 1, subject: `Question about the ${role} role`.slice(0, 80), body: `${greet}\n\nI saw the ${role} opening at ${company} and wanted to reach out.${warm} ${about} ${skills} Could you point me to the right person for this role, or tell me how the team hires? I am happy to send my resume.\n\nThank you,\n${me}`.replace(/ {2,}/g, " ").replace(/ \n/g, "\n") },
      { step: 2, subject: `Following up: ${role}`.slice(0, 80), body: `${greet}\n\nA quick follow-up on my note about the ${role} role at ${company}. If now is not a good time, no problem at all.\n\nThank you,\n${me}` },
      { step: 3, subject: `Closing the loop: ${role}`.slice(0, 80), body: `${greet}\n\nThis is my last note about the ${role} role at ${company}. I will not follow up again, and I wish the team well.\n\nThank you,\n${me}` },
    ],
    linkedinNote: `Hi ${t.targetFirstName ?? "there"}, I am interested in the ${role} role at ${company}${t.topSkills[0] ? ` and work with ${t.topSkills[0]}` : ""}. I would be glad to connect.`.slice(0, 290),
    linkedinMessage: `Thanks for connecting, ${t.targetFirstName ?? "there"}. I am applying for the ${role} role at ${company}. Would you be open to sharing a quick pointer on how the team hires? No pressure at all.\n\n${me}`,
  };
}
