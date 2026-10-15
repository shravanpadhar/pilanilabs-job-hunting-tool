import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler } from "@/lib/errors";

/** "Download my data": everything we store about the signed-in user, as JSON. */
export const GET = handler("account_export", async () => {
  const user = await requireUserApi();
  const [profile, resumes, preferences, applications, searches, tailored, reviews, referrals] = await Promise.all([
    db.user.findUnique({ where: { id: user.id } }),
    db.resume.findMany({ where: { userId: user.id }, select: { id: true, fileName: true, isPrimary: true, createdAt: true, parsedJson: true, rawText: true } }),
    db.preferences.findUnique({ where: { userId: user.id } }),
    db.application.findMany({ where: { userId: user.id }, include: { job: { select: { title: true, company: true, applyUrl: true } } } }),
    db.savedSearch.findMany({ where: { userId: user.id } }),
    db.tailoredResume.findMany({ where: { userId: user.id }, select: { id: true, jobId: true, contentJson: true, coverLetterText: true, createdAt: true } }),
    db.companyReview.findMany({ where: { userId: user.id } }),
    db.referralDraft.findMany({ where: { userId: user.id } }),
  ]);
  return new Response(JSON.stringify({ exportedAt: new Date().toISOString(), profile, resumes, preferences, applications, savedSearches: searches, tailoredResumes: tailored, companyReviews: reviews, referralDrafts: referrals }, null, 2), {
    headers: { "Content-Type": "application/json", "Content-Disposition": 'attachment; filename="pilanilabs-my-data.json"', "Cache-Control": "private, no-store" },
  });
});
