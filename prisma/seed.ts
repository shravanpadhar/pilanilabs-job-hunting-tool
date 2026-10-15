import "../scripts/_env";
import { COMPANY_PROFILE_SEEDS, PROFILES_AS_OF, PROFILES_SOURCE } from "../config/company-profiles";
import { slugifyCompany } from "../lib/companies/slug";
import { db } from "../lib/db";
import { ingestJobs } from "../lib/jobs/ingest";
import { buildSeedJobs } from "./seed-data";

/** `npm run db:seed` — sample jobs + curated company profiles. Safe to re-run. */
async function main() {
  // Refresh sample jobs so their "posted X days ago" stays recent (keeps any a user is tracking).
  const removed = await db.job.deleteMany({ where: { isSeed: true, applications: { none: {} } } });
  const result = await ingestJobs(buildSeedJobs());
  await db.job.updateMany({ where: { source: "seed" }, data: { isSeed: true } });

  let profiles = 0;
  for (const p of COMPANY_PROFILE_SEEDS) {
    const slug = slugifyCompany(p.name);
    const data = {
      name: p.name,
      website: p.website,
      industry: p.industry,
      hqLocation: p.hqLocation,
      foundedYear: p.foundedYear,
      fundingStage: p.fundingStage,
      description: p.description,
      sizeRange: p.sizeRange ?? null,
      careersUrl: p.website,
      dataSource: PROFILES_SOURCE,
      dataAsOf: new Date(PROFILES_AS_OF),
    };
    await db.companyProfile.upsert({ where: { slug }, create: { slug, ...data }, update: data });
    profiles++;
  }

  console.log(`Seed complete: ${result.inserted} sample jobs (replaced ${removed.count}), ${profiles} company profiles.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
