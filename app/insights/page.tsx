import { BarChart3 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/notice";
import { requireUser } from "@/lib/auth";
import { insightsFor, type Bucket } from "@/lib/outreach/insights";

export const metadata: Metadata = { title: "Insights" };
export const dynamic = "force-dynamic";

const pct = (n: number) => `${Math.round(n * 100)}%`;
const TEMPLATE_LABEL: Record<string, string> = { "email.v1": "AI-written email", "email.fallback.v1": "Safe template email", unknown: "Unknown" };
const TYPE_LABEL: Record<string, string> = { startup: "Startups", scaleup: "Scale-ups", enterprise: "Large companies", unknown: "Unknown size" };

function Table({ title, rows, labels }: { title: string; rows: Bucket[]; labels: Record<string, string> }) {
  return (
    <section className="space-y-2">
      <h2 className="text-xl font-semibold">{title}</h2>
      <Card className="overflow-x-auto p-3">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase text-muted-foreground"><th className="px-2 py-2">Group</th><th>People contacted</th><th>Reply rate</th><th>Referral rate</th><th>Interview rate</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b last:border-0">
                <td className="px-2 py-2 font-semibold">{labels[r.key] ?? r.key}</td><td>{r.contacted}</td>
                <td>{pct(r.replyRate)} <span className="text-xs text-muted-foreground">({r.replied})</span></td>
                <td>{pct(r.referralRate)} <span className="text-xs text-muted-foreground">({r.referrals})</span></td>
                <td>{pct(r.interviewRate)} <span className="text-xs text-muted-foreground">({r.interviews})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </section>
  );
}

export default async function InsightsPage() {
  const user = await requireUser();
  const i = await insightsFor(user.id);
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold sm:text-4xl">Insights</h1>
        <p className="text-muted-foreground">What is working in your outreach. Rates are per person contacted. Small numbers are noisy, so look for patterns over several jobs.</p>
      </header>
      {i.total.contacted === 0 ? (
        <EmptyState icon={<BarChart3 className="size-10" />} title="No results yet" action={<Button asChild><Link href="/outreach/new">Start an outreach</Link></Button>}>
          Once your first emails have gone out, you will see reply, referral and interview rates here.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[["People contacted", String(i.total.contacted)], ["Reply rate", pct(i.total.replyRate)], ["Referral rate", pct(i.total.referralRate)], ["Interview rate", pct(i.total.interviewRate)]].map(([l, v]) => (
              <Card key={l} className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="font-heading text-3xl font-semibold">{v}</p></Card>
            ))}
          </div>
          <Table title="By message template" rows={i.byTemplate} labels={TEMPLATE_LABEL} />
          <Table title="By company type" rows={i.byCompanyType} labels={TYPE_LABEL} />
          <p className="text-xs text-muted-foreground">A reply means a real answer; out-of-office notices, bounces and requests to stop are not counted. We do not track opens or clicks.</p>
        </>
      )}
    </div>
  );
}
