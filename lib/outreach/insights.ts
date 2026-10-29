import { db } from "@/lib/db";

/**
 * Outcome tracking (B13): reply, referral and interview rates per message template and per company type. Counted per PERSON
 * contacted (a person is "contacted" once their first email was sent). Definitions, stated plainly so the numbers are honest:
 *  - reply rate: the person sent a real reply (out-of-office, bounces and unsubscribe requests do not count as replies);
 *  - referral rate: the reply was classified REFERRAL;
 *  - interview rate: the candidate confirmed an interview for the job after an INTERESTED or REFERRAL reply from that person.
 * No open or click tracking exists (D-14), so there is no "open rate".
 */
export interface Bucket {
  key: string;
  contacted: number;
  replied: number;
  referrals: number;
  interviews: number;
  replyRate: number;
  referralRate: number;
  interviewRate: number;
}

const rate = (n: number, d: number) => (d > 0 ? n / d : 0);
const POSITIVE = ["INTERESTED", "REFERRAL"];
const REAL_REPLY = ["INTERESTED", "REFERRAL", "NOT_NOW", "NO", "OTHER"];

function finish(key: string, c: { contacted: number; replied: number; referrals: number; interviews: number }): Bucket {
  return { key, ...c, replyRate: rate(c.replied, c.contacted), referralRate: rate(c.referrals, c.contacted), interviewRate: rate(c.interviews, c.contacted) };
}

export async function insightsFor(userId: string) {
  const targets = await db.outreachTarget.findMany({
    where: { campaign: { userId }, messages: { some: { channel: "EMAIL", step: 1, state: "SENT" } } },
    include: {
      campaign: { select: { companyType: true, jobId: true } },
      messages: { where: { channel: "EMAIL", step: 1 }, select: { templateKey: true, replies: { select: { classification: true } } } },
    },
  });
  const apps = await db.application.findMany({ where: { userId, status: { in: ["INTERVIEWING", "OFFER"] } }, select: { jobId: true } });
  const interviewJobs = new Set(apps.map((a) => a.jobId));

  const byTemplate = new Map<string, { contacted: number; replied: number; referrals: number; interviews: number }>();
  const byCompanyType = new Map<string, { contacted: number; replied: number; referrals: number; interviews: number }>();
  const total = { contacted: 0, replied: 0, referrals: 0, interviews: 0 };
  const bump = (m: Map<string, typeof total>, k: string, f: (c: typeof total) => void) => {
    const c = m.get(k) ?? { contacted: 0, replied: 0, referrals: 0, interviews: 0 };
    f(c);
    m.set(k, c);
  };

  for (const t of targets) {
    const first = t.messages[0];
    const classes = t.messages.flatMap((m) => m.replies.map((r) => r.classification));
    const replied = classes.some((c) => REAL_REPLY.includes(c));
    const referral = classes.includes("REFERRAL");
    const interview = classes.some((c) => POSITIVE.includes(c)) && t.campaign.jobId !== null && interviewJobs.has(t.campaign.jobId);
    const apply = (c: typeof total) => {
      c.contacted++;
      if (replied) c.replied++;
      if (referral) c.referrals++;
      if (interview) c.interviews++;
    };
    apply(total);
    bump(byTemplate, (first?.templateKey ?? "unknown").replace(/\.s\d$/, ""), apply);
    bump(byCompanyType, t.campaign.companyType ?? "unknown", apply);
  }

  const toList = (m: Map<string, typeof total>) => [...m.entries()].map(([k, c]) => finish(k, c)).sort((a, b) => b.contacted - a.contacted);
  return { total: finish("all", total), byTemplate: toList(byTemplate), byCompanyType: toList(byCompanyType) };
}
export type Insights = Awaited<ReturnType<typeof insightsFor>>;
