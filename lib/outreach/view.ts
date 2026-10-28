import type { OutreachTarget } from "@/generated/prisma/client";
import { suppressedSet } from "@/lib/compliance/suppression";
import { targetGate } from "@/lib/outreach/targets";

/** Client-safe shape of a target: the gate result is computed on the server, never trusted from the browser. */
export function toTargetView(t: OutreachTarget, suppressed: Set<string>) {
  const gate = targetGate({
    email: t.email, emailVerification: t.emailVerification, confidence: t.confidence, country: t.country,
    riskAcknowledgedAt: t.riskAcknowledgedAt, suppressed: t.email ? suppressed.has(t.email) : false,
  });
  return {
    id: t.id, fullName: t.fullName, title: t.title, roleType: t.roleType, email: t.email, emailVerification: t.emailVerification,
    linkedinUrl: t.linkedinUrl, country: t.country, dataProvider: t.dataProvider, sourceRef: t.sourceRef, confidence: t.confidence,
    state: t.state, riskAcknowledgedAt: t.riskAcknowledgedAt?.toISOString() ?? null, ...gate,
  };
}

export async function toTargetViews(targets: OutreachTarget[]) {
  const suppressed = await suppressedSet(targets.flatMap((t) => (t.email ? [t.email] : [])));
  return targets.filter((t) => t.state !== "CANCELLED").map((t) => toTargetView(t, suppressed));
}
export type TargetView = ReturnType<typeof toTargetView>;
