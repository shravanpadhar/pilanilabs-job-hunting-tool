import { KanbanSquare } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { KanbanBoard, type TrackerCard } from "@/components/tracker/kanban-board";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";

export const metadata: Metadata = { title: "Application tracker" };
export const dynamic = "force-dynamic";

export default async function TrackerPage() {
  const user = await requireUser();
  const apps = await db.application.findMany({
    where: { userId: user.id },
    orderBy: [{ position: "desc" }, { updatedAt: "desc" }],
    include: { job: { select: { id: true, title: true, company: true, location: true } }, tailoredResume: { select: { id: true } } },
  });

  const cards: TrackerCard[] = apps.map((a) => ({
    id: a.id,
    status: a.status,
    notes: a.notes,
    followUpDate: a.followUpDate?.toISOString() ?? null,
    appliedAt: a.appliedAt?.toISOString() ?? null,
    jobId: a.job.id,
    title: a.job.title,
    company: a.job.company,
    location: a.job.location,
    hasTailored: Boolean(a.tailoredResume),
  }));

  const due = cards.filter((c) => c.followUpDate && new Date(c.followUpDate) <= new Date() && c.status !== "REJECTED" && c.status !== "OFFER").length;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold sm:text-4xl">Application tracker</h1>
        <p className="text-muted-foreground">
          Drag cards between columns, or use the dropdown on each card.
          {due > 0 ? <strong className="ml-1 text-danger">{due} follow-up{due > 1 ? "s" : ""} due.</strong> : null}
        </p>
      </header>
      {cards.length === 0 ? (
        <EmptyState
          icon={<KanbanSquare className="size-10" />}
          title="Nothing tracked yet"
          action={
            <Button asChild>
              <Link href="/jobs">Browse jobs</Link>
            </Button>
          }
        >
          Save a job from your feed, or apply and confirm — it will show up here.
        </EmptyState>
      ) : (
        <KanbanBoard initial={cards} />
      )}
    </div>
  );
}
