import { NextResponse } from "next/server";
import { z } from "zod";
import { slugifyCompany } from "@/lib/companies/slug";
import { requireUserApi } from "@/lib/auth";
import { db } from "@/lib/db";
import { handler, notFound } from "@/lib/errors";

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(3, "Add a short headline.").max(120),
  pros: z.string().trim().min(10, "Tell us a bit more about the good parts.").max(1500),
  cons: z.string().trim().min(10, "Tell us a bit more about the downsides.").max(1500),
  roleTitle: z.string().trim().max(100).optional(),
  relationship: z.enum(["CURRENT", "FORMER", "INTERVIEWED"]),
});

type Ctx = { params: Promise<{ slug: string }> };

/** Create or update the signed-in user's review (one per company). Reviews are community-written, not imported from any site. */
export const POST = handler("company_review", async (request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { slug } = await params;
  const body = reviewSchema.parse(await request.json());

  let company = await db.companyProfile.findUnique({ where: { slug } });
  if (!company) {
    // Create a bare profile for any company that has jobs in our database.
    const job = await db.job.findFirst({ where: { companySlug: slug }, select: { company: true, companyLogoUrl: true } });
    if (!job || slugifyCompany(job.company) !== slug) throw notFound("Company");
    company = await db.companyProfile.create({ data: { slug, name: job.company, logoUrl: job.companyLogoUrl } });
  }

  const review = await db.companyReview.upsert({
    where: { companyId_userId: { companyId: company.id, userId: user.id } },
    create: { companyId: company.id, userId: user.id, ...body, roleTitle: body.roleTitle || null },
    update: { ...body, roleTitle: body.roleTitle || null },
  });
  return NextResponse.json(review, { status: 201 });
});

export const DELETE = handler("company_review_delete", async (_request: Request, { params }: Ctx) => {
  const user = await requireUserApi();
  const { slug } = await params;
  const company = await db.companyProfile.findUnique({ where: { slug }, select: { id: true } });
  if (!company) throw notFound("Company");
  await db.companyReview.deleteMany({ where: { companyId: company.id, userId: user.id } });
  return NextResponse.json({ ok: true });
});
