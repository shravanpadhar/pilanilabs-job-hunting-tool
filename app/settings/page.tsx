import type { Metadata } from "next";
import Link from "next/link";
import { DangerZone, PreferencesSettings, ResumeManager } from "@/components/settings/settings-forms";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { daysAgo } from "@/lib/utils";
import { resumeSchema } from "@/lib/resume/schema";
import { preferencesSchema } from "@/lib/validation";
import { DEFAULT_PREFERENCES } from "@/components/onboarding/preferences-form";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireUser();
  const [resumes, prefs, usage] = await Promise.all([
    db.resume.findMany({ where: { userId: user.id }, orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }] }),
    db.preferences.findUnique({ where: { userId: user.id } }),
    db.aiUsage.groupBy({ by: ["feature"], where: { userId: user.id, createdAt: { gte: daysAgo(1) } }, _count: { _all: true } }),
  ]);

  const primary = resumes.find((r) => r.isPrimary);
  const parsedPrefs = prefs ? preferencesSchema.safeParse(prefs) : null;
  const initialPrefs = parsedPrefs?.success ? parsedPrefs.data : DEFAULT_PREFERENCES;
  const suggestedRoles = primary ? resumeSchema.safeParse(primary.parsedJson).data?.inferredTargetRoles ?? [] : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold sm:text-4xl">Settings</h1>
        <p className="text-muted-foreground">Signed in as {user.email}</p>
      </header>

      <ResumeManager resumes={resumes.map((r) => ({ id: r.id, fileName: r.fileName, isPrimary: r.isPrimary, createdAt: r.createdAt.toISOString(), hasFile: Boolean(r.fileUrl) }))} />
      <PreferencesSettings initial={initialPrefs} suggestedRoles={suggestedRoles} />

      <Card>
        <CardContent className="space-y-2 p-5">
          <h2 className="font-heading text-xl font-semibold">Alerts</h2>
          <p className="text-sm text-muted-foreground">
            Email and WhatsApp digests live on the <Link href="/searches" className="underline">Saved searches & alerts</Link> page.
          </p>
          <h2 className="pt-2 font-heading text-xl font-semibold">AI usage (last 24 hours)</h2>
          {usage.length === 0 ? (
            <p className="text-sm text-muted-foreground">No AI requests yet today.</p>
          ) : (
            <ul className="text-sm text-muted-foreground">
              {usage.map((u) => (
                <li key={u.feature}>
                  {u.feature.replace(/_/g, " ")}: {u._count._all}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <DangerZone />
    </div>
  );
}
