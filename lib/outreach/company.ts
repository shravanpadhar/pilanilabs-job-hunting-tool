import { outreach } from "@/config/outreach";
import { slugifyCompany } from "@/lib/companies/slug";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { employerDomainFromUrl } from "@/lib/outreach/intake/classify";
import { daysAgo } from "@/lib/utils";

export interface ResolvedCompany {
  companyKey: string;
  name: string;
  domain: string | null;
  profileId: string | null;
  companyType: "startup" | "scaleup" | "enterprise" | "unknown";
}

/** Bucket used by insights (B13) from whatever we know about the company (curated profile fields only). */
export function companyTypeOf(p: { sizeRange?: string | null; fundingStage?: string | null } | null): ResolvedCompany["companyType"] {
  if (!p) return "unknown";
  const size = (p.sizeRange ?? "").replace(/[, ]/g, "");
  const n = parseInt(size.match(/\d+/)?.[0] ?? "", 10);
  const stage = (p.fundingStage ?? "").toLowerCase();
  if (/(public|listed)/.test(stage) || (Number.isFinite(n) && n >= 5000)) return "enterprise";
  if (/(seed|pre-seed|angel|series a)\b/.test(stage) || (Number.isFinite(n) && n < 200)) return "startup";
  if (stage || Number.isFinite(n)) return "scaleup";
  return "unknown";
}

/**
 * Match the employer to a company record (spec step 2). Uses the curated CompanyProfile when one exists, finds the
 * employer's own web domain, and creates a bare profile (like the company-review flow does) so every campaign has a record.
 */
export async function resolveCompany(input: { company: string; applyUrl?: string | null; sourceUrl?: string | null }): Promise<ResolvedCompany> {
  const companyKey = slugifyCompany(input.company);
  if (!companyKey) throw new AppError("We could not work out the company name for this job.", 400, "no_company");

  let profile = await db.companyProfile.findUnique({ where: { slug: companyKey } });
  if (!profile) {
    profile = await db.companyProfile.create({ data: { slug: companyKey, name: input.company.trim().slice(0, 150), dataSource: "outreach" } }).catch(async () => (await db.companyProfile.findUnique({ where: { slug: companyKey } }))!);
  }
  let domain: string | null = null;
  if (profile.website) {
    try {
      domain = new URL(/^https?:/i.test(profile.website) ? profile.website : `https://${profile.website}`).hostname.replace(/^www\./, "");
    } catch {
      domain = null;
    }
  }
  domain ??= employerDomainFromUrl(input.applyUrl) ?? employerDomainFromUrl(input.sourceUrl);
  return { companyKey, name: profile.name, domain, profileId: profile.id, companyType: companyTypeOf(profile) };
}

/**
 * One touch per company per candidate per 30 days (spec step 2). A campaign blocks a new one when it is ACTIVE or
 * PAUSED, or when it was COMPLETED / ACTIVE within the cooldown window. Draft and cancelled campaigns never block.
 */
export async function assertCompanyAvailable(userId: string, companyKey: string, ignoreCampaignId?: string): Promise<void> {
  const since = daysAgo(outreach.companyCooldownDays);
  const blocking = await db.outreachCampaign.findFirst({
    where: {
      userId, companyKey, ...(ignoreCampaignId ? { id: { not: ignoreCampaignId } } : {}),
      OR: [{ status: { in: ["ACTIVE", "PAUSED"] } }, { status: "COMPLETED", OR: [{ finishedAt: { gte: since } }, { createdAt: { gte: since } }] }],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true },
  });
  if (blocking) {
    throw new AppError(
      `You already reached out to this company in the last ${outreach.companyCooldownDays} days. To keep your reputation safe we only contact a company once per ${outreach.companyCooldownDays} days.`,
      409,
      "company_cooldown",
    );
  }
}
