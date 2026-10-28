import type { Metadata } from "next";
import Link from "next/link";
import { AdminActions } from "@/components/admin/admin-actions";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireAdmin } from "@/lib/admin/guard";
import { abuseReview, auditLog, overview, sendHealth, suppression, usd } from "@/lib/admin/queries";
import { getLimits, getPricing } from "@/lib/settings";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };
export const dynamic = "force-dynamic";

const TABS = [
  ["overview", "Costs and volume"], ["health", "Send health"], ["abuse", "Abuse review"], ["suppression", "Suppression list"], ["audit", "Audit log"], ["settings", "Pricing and limits"],
] as const;

type Search = { tab?: string; q?: string; action?: string; user?: string; page?: string };

export default async function AdminPage({ searchParams }: { searchParams: Promise<Search> }) {
  const sp = await searchParams;
  const tab = TABS.some(([t]) => t === sp.tab) ? sp.tab! : "overview";
  await requireAdmin(tab);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-semibold sm:text-4xl">Admin console</h1>
        <p className="text-muted-foreground">Internal. Every view and change here is written to the audit log.</p>
      </header>
      <nav aria-label="Admin sections" className="flex flex-wrap gap-2">
        {TABS.map(([t, label]) => (
          <Link key={t} href={`/admin?tab=${t}`} aria-current={t === tab ? "page" : undefined} className={`rounded-button border px-3 py-1.5 text-sm font-semibold ${t === tab ? "bg-secondary text-secondary-foreground" : "bg-card"}`}>
            {label}
          </Link>
        ))}
      </nav>

      {tab === "overview" ? <Overview /> : null}
      {tab === "health" ? <Health /> : null}
      {tab === "abuse" ? <Abuse /> : null}
      {tab === "suppression" ? <Suppression q={sp.q} /> : null}
      {tab === "audit" ? <Audit action={sp.action} user={sp.user} page={Number(sp.page) || 1} /> : null}
      {tab === "settings" ? <Settings /> : null}

      <section aria-labelledby="actions-h" className="space-y-3">
        <h2 id="actions-h" className="text-2xl font-semibold">Controls</h2>
        <AdminActions />
      </section>
    </div>
  );
}

const Table = ({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) => (
  <Card className="overflow-x-auto p-3">
    <table className="w-full text-left text-sm">
      <thead>
        <tr className="border-b text-xs uppercase text-muted-foreground">{head.map((h) => <th key={h} className="px-2 py-2">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.length === 0 ? <tr><td colSpan={head.length} className="px-2 py-4 text-muted-foreground">{empty}</td></tr> : rows.map((r, i) => <tr key={i} className="border-b last:border-0">{r.map((c, j) => <td key={j} className="px-2 py-2 align-top">{c}</td>)}</tr>)}
      </tbody>
    </table>
  </Card>
);

async function Overview() {
  const o = await overview();
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Emails sent (24h)", o.last24h.sent], ["Replies (24h)", o.last24h.replies], ["Bounces (24h)", o.last24h.bounced], ["Candidates using outreach", o.candidates]].map(([l, v]) => (
          <Card key={String(l)} className="p-4"><p className="text-xs text-muted-foreground">{l}</p><p className="font-heading text-3xl font-semibold">{v}</p></Card>
        ))}
      </div>
      <h2 className="text-xl font-semibold">Margin estimate (30 days)</h2>
      <Table head={["Credits spent", "Credits bought", "Revenue estimate", "Data provider cost", "AI cost", "Margin"]} empty="" rows={[[o.credits.spent30d, o.credits.purchased30d, usd(o.margin.revenueEstimateMicros), usd(o.margin.providerCostMicros), usd(o.margin.aiCostMicros), <strong key="m">{usd(o.margin.marginMicros)}</strong>]]} />
      <p className="text-xs text-muted-foreground">Revenue estimate = credits spent x the credit value set under Pricing and limits ({usd(o.margin.creditValueMicros)} per credit). Set it once prices are decided.</p>
      <h2 className="text-xl font-semibold">Provider spend</h2>
      <Table head={["Provider", "Calls", "Cost"]} empty="No provider calls yet." rows={o.providers.map((p) => [p.provider, p.calls, usd(p.costMicros)])} />
      <h2 className="text-xl font-semibold">AI spend by feature</h2>
      <Table head={["Feature", "Calls", "Estimated cost"]} empty="No AI calls yet." rows={o.ai.byFeature.map((f) => [f.feature, f.calls, usd(f.costMicros)])} />
      <h2 className="text-xl font-semibold">Campaigns</h2>
      <Table head={["Status", "Count"]} empty="None yet." rows={Object.entries(o.campaigns).map(([s, n]) => [s.toLowerCase(), n])} />
    </div>
  );
}

async function Health() {
  const rows = await sendHealth();
  return (
    <Table head={["Candidate", "Mailbox", "Sent (7d)", "Bounce rate", "Complaints", "State"]} empty="Nobody has sent outreach yet." rows={rows.map((r) => [
      r.email, r.mailbox ? `${r.mailbox.accountEmail} (${r.mailbox.status.toLowerCase()})` : "none", r.sent, `${(r.bounceRate * 100).toFixed(1)}%`, r.complaints,
      r.paused ? <Badge key="p" variant="danger">paused: {r.paused.reason}</Badge> : r.verdict.pause ? <Badge key="w" variant="warning">over threshold</Badge> : <Badge key="o" variant="success">healthy</Badge>,
    ])} />
  );
}

async function Abuse() {
  const flagged = await abuseReview();
  return <Table head={["Candidate", "Why flagged", "Sending"]} empty="Nothing to review." rows={flagged.map((f) => [f.email, <ul key="r" className="list-disc pl-4">{f.reasons.map((r) => <li key={r}>{r}</li>)}</ul>, f.paused ? <Badge key="p" variant="danger">paused</Badge> : <Badge key="a" variant="muted">active</Badge>])} />;
}

async function Suppression({ q }: { q?: string }) {
  const s = await suppression(q);
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-end gap-2" action="/admin" method="get">
        <input type="hidden" name="tab" value="suppression" />
        <label className="text-sm font-semibold">Is this address suppressed?
          <input name="q" defaultValue={q} placeholder="name@company.com" className="ml-2 h-10 rounded-input border border-input-border bg-input px-3 text-input-foreground" />
        </label>
        <button className="h-10 rounded-button bg-primary px-4 text-sm font-semibold text-primary-foreground">Check</button>
      </form>
      {s.lookup ? <Card className="p-3 text-sm"><strong>{s.lookup.email}</strong>: {s.lookup.suppressed ? `suppressed (${s.lookup.reason?.toLowerCase()}) since ${s.lookup.since?.toISOString().slice(0, 10)}` : "not on the list"}</Card> : null}
      <p className="text-sm text-muted-foreground">{s.total} entries. The list stores keyed hashes only, never addresses, and survives account deletion. {s.byReason.map((r) => `${r.count} ${r.reason.toLowerCase()}`).join(", ")}</p>
      <Table head={["Hash", "Reason", "Added"]} empty="The list is empty." rows={s.recent.map((r) => [<code key="h">{r.hash}</code>, r.reason.toLowerCase(), r.createdAt.toISOString().slice(0, 16).replace("T", " ")])} />
    </div>
  );
}

async function Audit({ action, user, page }: { action?: string; user?: string; page: number }) {
  const a = await auditLog({ action, userId: user, page });
  const link = (p: number) => `/admin?tab=audit&page=${p}${action ? `&action=${encodeURIComponent(action)}` : ""}${user ? `&user=${encodeURIComponent(user)}` : ""}`;
  return (
    <div className="space-y-3">
      <form className="flex flex-wrap items-end gap-2" action="/admin" method="get">
        <input type="hidden" name="tab" value="audit" />
        <label className="text-sm font-semibold">Action contains
          <input name="action" defaultValue={action} placeholder="message.sent" className="ml-2 h-10 rounded-input border border-input-border bg-input px-3 text-input-foreground" />
        </label>
        <button className="h-10 rounded-button bg-primary px-4 text-sm font-semibold text-primary-foreground">Filter</button>
      </form>
      <Table head={["When (UTC)", "Action", "Entity", "User", "Detail"]} empty="No events match." rows={a.rows.map((r) => [r.createdAt.toISOString().slice(0, 19).replace("T", " "), r.action, `${r.entityType}${r.entityId ? ` ${r.entityId.slice(0, 10)}` : ""}`, r.userId?.slice(0, 8) ?? "", <code key="d" className="text-xs">{r.detail ? JSON.stringify(r.detail).slice(0, 120) : ""}</code>])} />
      <p className="text-sm text-muted-foreground">Page {a.page} of {a.pages} ({a.total} events).{" "}
        {a.page > 1 ? <Link className="underline" href={link(a.page - 1)}>Previous</Link> : null} {a.page < a.pages ? <Link className="underline" href={link(a.page + 1)}>Next</Link> : null}</p>
    </div>
  );
}

async function Settings() {
  const [pricing, limits] = await Promise.all([getPricing(), getLimits()]);
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Nothing here is hard-coded: these values are stored in the database and override the defaults in <code>config/pricing.ts</code>. Edit them with the &quot;set_setting&quot; action of <code>/api/admin/action</code> (JSON), for example to set prices once the pilot has measured the real cost per campaign.</p>
      <Card className="p-4"><h3 className="font-semibold">Pricing</h3><pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(pricing, null, 2)}</pre></Card>
      <Card className="p-4"><h3 className="font-semibold">Limits</h3><pre className="mt-2 overflow-x-auto text-xs">{JSON.stringify(limits, null, 2)}</pre></Card>
    </div>
  );
}
