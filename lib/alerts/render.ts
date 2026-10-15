import { env } from "@/lib/env";
import { formatSalary, sourceLabel, timeAgo } from "@/lib/format";

export interface DigestJob {
  id: string;
  title: string;
  company: string;
  location: string | null;
  isRemote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  postedAt: Date;
  source: string;
  publisher: string | null;
  score: number | null;
  reason: string | null;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const link = (id: string) => `${env.appUrl}/jobs/${id}`;

export function renderDigestEmail(opts: { title: string; jobs: DigestJob[]; manageUrl?: string }) {
  const manage = opts.manageUrl ?? `${env.appUrl}/searches`;
  const rows = opts.jobs
    .map((j) => {
      const salary = formatSalary(j.salaryMin, j.salaryMax, j.salaryCurrency);
      const meta = [j.company, j.isRemote ? "Remote" : j.location, salary, timeAgo(j.postedAt)].filter(Boolean).join(" · ");
      return `<tr><td style="padding:14px 0;border-bottom:1px solid #dad6ca">
        <a href="${link(j.id)}" style="font-size:16px;font-weight:600;color:#021c3d;text-decoration:none">${esc(j.title)}</a>
        ${j.score !== null ? `<span style="margin-left:8px;background:#b9832c;color:#fff;border-radius:10px;padding:1px 8px;font-size:12px;font-weight:700">${j.score}% match</span>` : ""}
        <div style="font-size:13px;color:#4a5b73;margin-top:3px">${esc(meta)}</div>
        ${j.reason ? `<div style="font-size:13px;color:#021c3d;margin-top:4px">${esc(j.reason)}</div>` : ""}
        <div style="font-size:11px;color:#4a5b73;margin-top:3px">${esc(sourceLabel(j.source, j.publisher))}</div>
      </td></tr>`;
    })
    .join("");
  const html = `<!doctype html><html><body style="margin:0;background:#f6f5f1;font-family:Inter,Arial,sans-serif">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border:1px solid #dad6ca;border-radius:6px"><tr><td style="padding:24px 28px">
    <div style="font-family:Georgia,serif;font-size:22px;color:#021c3d;font-weight:700">Pilani<span style="color:#8a5f16">labs</span></div>
    <h1 style="font-family:Georgia,serif;font-size:24px;color:#021c3d;margin:16px 0 4px">${esc(opts.title)}</h1>
    <p style="margin:0 0 8px;color:#4a5b73;font-size:14px">${opts.jobs.length} new ${opts.jobs.length === 1 ? "job" : "jobs"} for you</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
    <p style="margin:20px 0 0"><a href="${env.appUrl}/jobs" style="background:#b9832c;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:6px;display:inline-block">See all matches</a></p>
    <p style="margin:24px 0 0;font-size:12px;color:#4a5b73">You're receiving this because you turned on job alerts. <a href="${manage}" style="color:#8a5f16">Change or stop alerts</a>.</p>
  </td></tr></table></td></tr></table></body></html>`;

  const text = [opts.title, "", ...opts.jobs.map((j, i) => `${i + 1}. ${j.title} — ${j.company}${j.score !== null ? ` (${j.score}% match)` : ""}\n   ${link(j.id)}`), "", `Change or stop alerts: ${manage}`].join("\n");
  return { html, text };
}

/** Compact plain-text digest for WhatsApp (no markdown that WhatsApp would mangle beyond *bold*). */
export function renderDigestWhatsapp(opts: { title: string; jobs: DigestJob[] }): string {
  const top = opts.jobs.slice(0, 5);
  const lines = top.map((j, i) => `${i + 1}. *${j.title}* — ${j.company}${j.score !== null ? ` (${j.score}%)` : ""}\n${link(j.id)}`);
  const more = opts.jobs.length > top.length ? `\n+${opts.jobs.length - top.length} more: ${env.appUrl}/jobs` : "";
  return `${opts.title}\n\n${lines.join("\n\n")}${more}\n\nStop alerts: ${env.appUrl}/searches`;
}
