import type { Metadata } from "next";
import { OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { resumeSchema } from "@/lib/resume/schema";
import { preferencesSchema } from "@/lib/validation";

export const metadata: Metadata = { title: "Set up your profile" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();
  const [resume, prefs] = await Promise.all([
    db.resume.findFirst({ where: { userId: user.id, isPrimary: true } }),
    db.preferences.findUnique({ where: { userId: user.id } }),
  ]);

  const existing = resume
    ? {
        id: resume.id,
        parsed: resumeSchema.parse(resume.parsedJson),
        fileName: resume.fileName,
        preferences: prefs ? preferencesSchema.parse({ ...prefs, experienceLevel: prefs.experienceLevel ?? null }) : null,
      }
    : null;

  return <OnboardingWizard existing={existing} />;
}
