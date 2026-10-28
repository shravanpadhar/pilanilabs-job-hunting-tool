import { Send } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { MailboxCard } from "@/components/outreach/mailbox-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Outreach" };
export const dynamic = "force-dynamic";

const STATUS_VARIANT = { DRAFT: "muted", ACTIVE: "success", PAUSED: "warning", COMPLETED: "default", CANCELLED: "muted" } as const;

export default async function OutreachInboxPage() {
  const user = await requireUser();
  const campaigns = await db.outreachCampaign.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, status: true, jobSnapshot: true, createdAt: true,
      targets: { where: { state: { not: "CANCELLED" } }, select: { state: true, messages: { where: { state: "SCHEDULED" }, orderBy: { scheduledAt: "asc" }, take: 1, select: { scheduledAt: true, step: true } } } },
    },
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-semibold sm:text-4xl">Outreach</h1>
          <p className="text-muted-foreground">One place for every job you are reaching out about.</p>
        </div>
        <Button asChild><Link href="/outreach/new"><Send /> New outreach</Link></Button>
      </header>
      <MailboxCard />
      {campaigns.length === 0 ? (
        <EmptyState icon={<Send className="size-10" />} title="No outreach yet" action={<Button asChild><Link href="/outreach/new">Paste a job link</Link></Button>}>
          Paste a job link, review the people we find and the messages we draft, then approve. Nothing is sent without you.
        </EmptyState>
      ) : (
        <ul className="grid gap-3">
          {campaigns.map((c) => {
            const snap = c.jobSnapshot as { title?: string; company?: string };
            const replied = c.targets.filter((t) => t.state === "REPLIED").length;
            const next = c.targets.flatMap((t) => t.messages).filter((m) => m.scheduledAt).sort((a, b) => a.scheduledAt!.getTime() - b.scheduledAt!.getTime())[0];
            return (
              <li key={c.id}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <p className="font-semibold">{snap.title ?? "Job"}</p>
                    <p className="text-sm text-muted-foreground">
                      {snap.company} · {c.targets.length} {c.targets.length === 1 ? "person" : "people"}
                      {replied ? ` · ${replied} replied` : ""}
                      {next ? ` · next email ${formatDate(next.scheduledAt!)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={STATUS_VARIANT[c.status]}>{c.status.toLowerCase()}</Badge>
                    <Button asChild size="sm" variant="secondary"><Link href={`/outreach/${c.id}`}>Open</Link></Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
