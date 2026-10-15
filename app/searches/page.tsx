import { BookmarkPlus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AlertSettingsCard } from "@/components/alerts/alert-settings-card";
import { SavedSearchList, type SavedSearchView } from "@/components/alerts/saved-search-list";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { flags } from "@/lib/env";
import { describeFilters, filtersSchema, filtersToSearchParams } from "@/lib/jobs/filters";

export const metadata: Metadata = { title: "Saved searches & alerts" };
export const dynamic = "force-dynamic";

export default async function SearchesPage() {
  const user = await requireUser();
  const [searches, prefs] = await Promise.all([
    db.savedSearch.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
    db.preferences.findUnique({ where: { userId: user.id } }),
  ]);

  const views: SavedSearchView[] = searches.map((s) => {
    const f = filtersSchema.safeParse(s.filters);
    const filters = f.success ? f.data : {};
    return {
      id: s.id,
      name: s.name,
      description: describeFilters(filters),
      query: filtersToSearchParams(filters).toString(),
      alertFrequency: s.alertFrequency,
      alertEmail: s.alertEmail,
      alertWhatsapp: s.alertWhatsapp,
      lastAlertAt: s.lastAlertAt?.toISOString() ?? null,
    };
  });

  return (
    <div className="space-y-8">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold sm:text-4xl">Saved searches & alerts</h1>
        <p className="text-muted-foreground">Name a search, subscribe, and get the top new jobs by email or WhatsApp.</p>
      </header>

      <AlertSettingsCard
        email={user.email}
        emailEnabled={flags.email}
        whatsappEnabled={flags.whatsapp}
        initial={{
          alertFrequency: prefs?.alertFrequency ?? "OFF",
          alertEmail: prefs?.alertEmail ?? true,
          alertWhatsapp: prefs?.alertWhatsapp ?? false,
          whatsappNumber: prefs?.whatsappNumber ?? "",
          alertMinScore: prefs?.alertMinScore ?? 70,
        }}
      />

      <section className="space-y-3" aria-labelledby="ss-h">
        <h2 id="ss-h" className="text-2xl font-semibold">Your saved searches</h2>
        {views.length === 0 ? (
          <EmptyState
            icon={<BookmarkPlus className="size-10" />}
            title="No saved searches yet"
            action={
              <Button asChild>
                <Link href="/jobs">Go to your feed</Link>
              </Button>
            }
          >
            Set filters on your job feed (for example “remote”, “posted in the last 3 days”, a keyword) and choose <strong>Save this search</strong>.
          </EmptyState>
        ) : (
          <SavedSearchList initial={views} />
        )}
      </section>
    </div>
  );
}
