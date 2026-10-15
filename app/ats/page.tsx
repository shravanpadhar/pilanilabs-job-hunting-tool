import { Upload } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AtsChecker } from "@/components/ats/ats-checker";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "ATS score checker" };
export const dynamic = "force-dynamic";

export default async function AtsPage() {
  const user = await requireUser();
  const resumes = await db.resume.findMany({ where: { userId: user.id }, orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }], select: { id: true, fileName: true, isPrimary: true } });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold sm:text-4xl">ATS score checker</h1>
        <p className="text-muted-foreground">
          Applicant tracking systems read your resume before a person does. See whether yours parses cleanly and how many of a job&apos;s keywords it covers. Free, instant and private — no AI involved.
        </p>
      </header>
      {resumes.length === 0 ? (
        <EmptyState icon={<Upload className="size-10" />} title="Upload a resume to check it" action={<Button asChild><Link href="/onboarding">Upload resume</Link></Button>}>
          We&apos;ll check parsing, format and keyword coverage.
        </EmptyState>
      ) : (
        <AtsChecker resumes={resumes} />
      )}
    </div>
  );
}
