import { outreach } from "@/config/outreach";
import { inWorkingHours, jitterMinutes, nextWorkingInstant, zonedParts, zonedToUtc } from "@/lib/outreach/schedule";

/**
 * The send-time policy. Every rule is re-checked at the moment of sending, whatever the schedule said earlier, because
 * things change: the person may have replied, opted out, or the mailbox may have been paused. It is a pure function of a
 * snapshot so each rule is unit-tested. "cancel" ends the message for good; "hold" reschedules it (nothing is lost).
 */
export interface SendSnapshot {
  now: Date;
  message: { id: string; step: number };
  campaignStatus: string;
  targetState: string;
  hasReply: boolean;
  suppressed: boolean;
  /** false when the contact is hard-blocked or needs a decision that was never made. */
  targetSendable: boolean;
  regionBlocked: boolean;
  recipientTz: string;
  sendingEnabled: boolean;
  /** Candidate-level pause: by the user or automatically (bounce / complaint thresholds). */
  sendingPaused: boolean;
  mailboxActive: boolean;
  /** Emails sent today from this mailbox, including other workers' in-flight sends. */
  sentToday: number;
  dailyCap: number;
  lastMailboxSendAt: Date | null;
  candidateTz: string;
  /** The previous step of this sequence, when this is a follow-up. */
  prev: { state: string; sentAt: Date | null } | null;
}

export type PolicyDecision = { action: "send" } | { action: "hold"; until: Date; reason: string } | { action: "cancel"; reason: string };

const minutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);
const TERMINAL_TARGET = ["REPLIED", "BOUNCED", "OPTED_OUT", "COMPLETED", "CANCELLED"];

export function decideSend(s: SendSnapshot): PolicyDecision {
  // ── Hard stops: the message will never be sent ─────────────────────────────
  if (s.hasReply || s.targetState === "REPLIED") return { action: "cancel", reason: "replied" };
  if (TERMINAL_TARGET.includes(s.targetState)) return { action: "cancel", reason: `target_${s.targetState.toLowerCase()}` };
  if (["CANCELLED", "COMPLETED"].includes(s.campaignStatus)) return { action: "cancel", reason: "campaign_closed" };
  if (s.suppressed) return { action: "cancel", reason: "suppressed" };
  if (s.regionBlocked) return { action: "cancel", reason: "blocked_region" };
  if (!s.targetSendable) return { action: "cancel", reason: "not_sendable" };
  if (s.prev && ["CANCELLED", "FAILED"].includes(s.prev.state)) return { action: "cancel", reason: "previous_step_not_sent" };

  // ── Holds: try again later ─────────────────────────────────────────────────
  if (!s.sendingEnabled) return { action: "hold", until: minutes(s.now, 60), reason: "sending_disabled" };
  if (s.campaignStatus !== "ACTIVE") return { action: "hold", until: minutes(s.now, 60), reason: "campaign_paused" };
  if (s.sendingPaused) return { action: "hold", until: minutes(s.now, 60), reason: "sending_paused" };
  if (!s.mailboxActive) return { action: "hold", until: minutes(s.now, 60), reason: "mailbox_inactive" };

  if (s.prev) {
    if (s.prev.state !== "SENT" || !s.prev.sentAt) return { action: "hold", until: minutes(s.now, 15), reason: "previous_step_pending" };
    const earliest = new Date(s.prev.sentAt.getTime() + outreach.minDaysBetweenStepsToSameRecipient * 86_400_000);
    if (s.now < earliest) return { action: "hold", until: nextWorkingInstant(earliest, s.recipientTz, s.message.id), reason: "recipient_frequency" };
  }

  if (!inWorkingHours(s.now, s.recipientTz)) return { action: "hold", until: nextWorkingInstant(s.now, s.recipientTz, s.message.id), reason: "outside_recipient_hours" };

  if (s.sentToday >= s.dailyCap) {
    // Next day (in the candidate's zone) at the start of the recipient's working hours.
    const p = zonedParts(s.now, s.candidateTz);
    const tomorrow = zonedToUtc(p.y, p.m, p.d + 1, 0, 5, s.candidateTz);
    return { action: "hold", until: nextWorkingInstant(tomorrow, s.recipientTz, s.message.id), reason: "daily_cap" };
  }

  if (s.lastMailboxSendAt) {
    const gap = outreach.minSpacingMinutes + jitterMinutes(s.message.id, outreach.spacingJitterMinutes);
    const ready = minutes(s.lastMailboxSendAt, gap);
    if (s.now < ready) return { action: "hold", until: ready, reason: "spacing" };
  }
  return { action: "send" };
}
