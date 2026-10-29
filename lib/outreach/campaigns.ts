import { createHash } from "node:crypto";
import { tailorResume } from "@/lib/ai/tailor-resume";
import { audit } from "@/lib/audit";
import { slugifyCompany } from "@/lib/companies/slug";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { AppError, notFound } from "@/lib/errors";
import { assertCompanyAvailable, resolveCompany } from "@/lib/outreach/company";
import type { ExtractedJob } from "@/lib/outreach/intake/types";
import { assertAiQuota } from "@/lib/rate-limit";
import { resumeSchema } from "@/lib/resume/schema";
import { extractSkills } from "@/lib/matching/text";

export interface JobSnapshot {
  title: string;
  company: string;
  companyDomain: string | null;
  location: string | null;
  description: string;
  requirements: string[];
  sourceUrl: string | null;
  applyUrl: string | null;
  source: string;
}

/**
 * Link the candidate's tailored resume for this job, creating one when missing (spec step 1). With a configured AI
 * provider the normal tailoring runs (including the no-fabrication guard). Without one (no key, offline dev) the base
 * resume is used unchanged, which is always safe: nothing in it can be invented.
 */
export async function ensureTailoredResume(userId: string, jobId: string): Promise<{ id: string; basis: "tailored" | "base" }> {
  const [job, resume] = await Promise.all([
    db.job.findFirst({ where: { id: jobId, OR: [{ ownerUserId: null }, { ownerUserId: userId }] } }),
    db.resume.findFirst({ where: { userId, isPrimary: true } }),
  ]);
  if (!job) throw notFound("Job");
  if (!resume) throw new AppError("Upload your resume first. Outreach needs it to write honest messages.", 400, "no_resume");
  const parsed = resumeSchema.parse(resume.parsedJson);

  const key = { userId_jobId_baseResumeId: { userId, jobId, baseResumeId: resume.id } };
  const existing = await db.tailoredResume.findUnique({ where: key });
  if (existing && existing.changes !== null) {
    const changed = Array.isArray(existing.changes) && existing.changes.length > 0;
    return { id: existing.id, basis: changed ? "tailored" : "base" };
  }

  if (flags.ai) {
    await assertAiQuota(userId, "tailor_resume");
    const out = await tailorResume({ userId, resume: parsed, job: { title: job.title, company: job.company, description: job.descriptionText } });
    const data = { contentJson: out.resume as object, changes: out.changes as object[], skillGaps: out.skillGaps as string[], pdfUrl: null, docxUrl: null };
    const saved = await db.tailoredResume.upsert({ where: key, create: { userId, jobId, baseResumeId: resume.id, ...data }, update: data });
    return { id: saved.id, basis: "tailored" };
  }
  const data = { contentJson: parsed as object, changes: [] as object[], skillGaps: [] as string[], pdfUrl: null, docxUrl: null };
  const saved = await db.tailoredResume.upsert({ where: key, create: { userId, jobId, baseResumeId: resume.id, ...data }, update: data });
  return { id: saved.id, basis: "base" };
}

/** A private job row (visible only to its owner, never in the shared feed) for a job the candidate pasted. */
async function privateJobFor(userId: string, job: ExtractedJob): Promise<string> {
  const hash = createHash("sha256").update(`${userId}|${job.sourceUrl ?? ""}|${job.title}|${job.company}|${job.description.slice(0, 500)}`).digest("hex").slice(0, 32);
  const row = await db.job.upsert({
    where: { dedupeHash: `private:${userId}:${hash}` },
    create: {
      source: "user-link", externalId: `${userId}:${hash}`, title: job.title.slice(0, 300), company: job.company.slice(0, 200), companySlug: slugifyCompany(job.company),
      location: job.location, isRemote: /remote/i.test(job.location ?? ""), descriptionText: job.description, postedAt: new Date(),
      // applyUrl is required by the shared Job table; pasted jobs without a link point to the product site.
      applyUrl: job.applyUrl ?? job.sourceUrl ?? "https://www.pilanilabs.com/", dedupeHash: `private:${userId}:${hash}`, sourcesSeen: ["user-link"], skills: extractSkills(`${job.title}\n${job.description}`),
      isDirect: false, ownerUserId: userId,
    },
    update: {},
    select: { id: true },
  });
  return row.id;
}

async function buildCampaign(userId: string, jobId: string, extra: { sourceUrl?: string | null }) {
  const job = await db.job.findFirst({ where: { id: jobId, OR: [{ ownerUserId: null }, { ownerUserId: userId }] } });
  if (!job) throw notFound("Job");

  // Idempotent: reopening the same job returns the existing draft.
  const draft = await db.outreachCampaign.findFirst({ where: { userId, jobId, status: "DRAFT" }, orderBy: { createdAt: "desc" } });
  if (draft) return { campaign: draft, reused: true as const };

  const company = await resolveCompany({ company: job.company, applyUrl: job.applyUrl, sourceUrl: extra.sourceUrl });
  await assertCompanyAvailable(userId, company.companyKey);
  const tailored = await ensureTailoredResume(userId, jobId);

  const requirements = job.descriptionText.split("\n").map((l) => l.trim()).filter((l) => /^[-•*]\s+/.test(l)).map((l) => l.replace(/^[-•*]\s+/, "")).slice(0, 20);
  const snapshot: JobSnapshot = {
    title: job.title, company: job.company, companyDomain: company.domain, location: job.location, description: job.descriptionText.slice(0, 8000), requirements,
    sourceUrl: extra.sourceUrl ?? null, applyUrl: job.applyUrl, source: job.source,
  };
  const campaign = await db.outreachCampaign.create({
    data: { userId, jobId, sourceUrl: extra.sourceUrl ?? null, jobSnapshot: snapshot as object, tailoredResumeId: tailored.id, companyId: company.profileId, companyKey: company.companyKey, companyType: company.companyType, mode: "REVIEW_ALL", status: "DRAFT" },
  });
  await audit({ userId, action: "campaign.created", entityType: "OutreachCampaign", entityId: campaign.id, detail: { jobId, companyKey: company.companyKey, basis: tailored.basis } });
  return { campaign, reused: false as const, basis: tailored.basis };
}

export const createCampaignFromJob = (userId: string, jobId: string) => buildCampaign(userId, jobId, {});

export async function createCampaignFromExtracted(userId: string, job: ExtractedJob) {
  const jobId = await privateJobFor(userId, job);
  return buildCampaign(userId, jobId, { sourceUrl: job.sourceUrl });
}

export async function loadCampaign(userId: string, campaignId: string) {
  const c = await db.outreachCampaign.findFirst({
    where: { id: campaignId, userId },
    include: { targets: { orderBy: { createdAt: "asc" }, include: { messages: { orderBy: [{ channel: "asc" }, { step: "asc" }] }, linkedin: true } } },
  });
  if (!c) throw notFound("Campaign");
  return c;
}
