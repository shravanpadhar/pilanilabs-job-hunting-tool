import type { ReplyClass } from "@/generated/prisma/enums";
import type { InboundMessage } from "@/lib/providers/mailbox/types";

/**
 * The deterministic rule layer for inbound mail (spec section 9: "Unsubscribe or hostile replies always stop the sequence by
 * rule, whatever the model says"). Rules run BEFORE any model and their verdict is final: the model is only consulted when no
 * rule fires, and even then it can only choose between the benign classes. Reply text is untrusted data throughout.
 */
export type RuleKind = "bounce_hard" | "bounce_soft" | "auto_reply" | "complaint" | "unsubscribe" | "hostile";

export interface RuleVerdict {
  kind: RuleKind;
  classification: ReplyClass;
  /** Stored on the Reply row so you can see which rule decided. */
  ruleHit: string;
  suppress: "BOUNCE" | "OPT_OUT" | "COMPLAINT" | null;
  /** Counts toward the spam-complaint rate that auto-pauses sending. */
  complaint: boolean;
}

const BOUNCE_SENDER = /(mailer-daemon|postmaster|mail delivery (sub)?system|mailerdaemon)/i;
const BOUNCE_BODY = /(delivery status notification|undeliverable|undelivered mail|could not be delivered|couldn'?t be delivered|message not delivered|delivery has failed|returned mail|failure notice)/i;
const HARD_BOUNCE = /(user unknown|no such user|address not found|does not exist|recipient (address )?rejected|invalid (recipient|address)|unknown (user|recipient)|mailbox (not found|unavailable)|\b5\.1\.1\b|\b550\b|\b553\b|domain not found|no mx)/i;
const AUTO_SUBMITTED = /^(auto-replied|auto-generated|auto-notified)/i;
const OOO = /(out of (the )?office|automatic reply|auto[- ]?reply|on (annual |maternity |paternity )?leave|away from (the )?(office|email)|currently (away|travell?ing)|will (be )?(back|return)|limited access to (my )?email)/i;

// Strong, specific complaint phrases only: a friendly "this isn't spam, thanks" must not count as a complaint.
const COMPLAINT = /(this is spam|mark(ed|ing)? (this|you|it|your (email|message)) as spam|report(ed|ing)? (this|you|it|your)\b|harass(ing|ment)?|legal action|cease and desist|\blawyer\b|\bsue you\b|phishing|\bscam\b|abuse (report|department)|gdpr (complaint|violation)|data protection (authority|complaint))/i;
const UNSUBSCRIBE = /(\bunsubscribe\b|remove me|take me off|stop (emailing|e-mailing|contacting|messaging|sending)|do not (contact|email|e-mail|message)|don'?t (contact|email|e-mail|message)|no more (emails|e-mails|messages)|opt[- ]?out|not interested in (any )?(further|more) (emails|contact|messages)|leave me alone|never (email|contact) me)/i;
const HOSTILE = /(\bf+u+c+k\b|\bidiot\b|\bstupid\b|\bpiss off\b|\bshut up\b|\bgo away\b|how dare you|how did you get my (email|address|number)|where did you get my (email|address|details))/i;

/** `text` is only held in memory; it is never stored (D-15). */
export function applyRules(m: Pick<InboundMessage, "from" | "text" | "headers">): RuleVerdict | null {
  const body = m.text ?? "";
  const h = m.headers ?? {};

  // 1. Delivery failure notices.
  const looksLikeBounce = BOUNCE_SENDER.test(m.from) || /multipart\/report/i.test(h["Content-Type"] ?? "") || Boolean(h["X-Failed-Recipients"]) || (BOUNCE_BODY.test(body) && BOUNCE_SENDER.test(m.from + body.slice(0, 300)));
  if (looksLikeBounce) {
    const hard = HARD_BOUNCE.test(body) || Boolean(h["X-Failed-Recipients"]);
    return hard
      ? { kind: "bounce_hard", classification: "OTHER", ruleHit: "bounce", suppress: "BOUNCE", complaint: false }
      : { kind: "bounce_soft", classification: "OTHER", ruleHit: "bounce_soft", suppress: null, complaint: false };
  }

  // 2. Automatic replies (out of office). They still end the sequence, as any reply does.
  const auto = AUTO_SUBMITTED.test(h["Auto-Submitted"] ?? "") || Boolean(h["X-Autoreply"]) || /auto[_-]?reply|bulk/i.test(h["Precedence"] ?? "");
  if (auto || (OOO.test(body.slice(0, 600)) && body.length < 1500)) {
    return { kind: "auto_reply", classification: "OUT_OF_OFFICE", ruleHit: "auto_reply", suppress: null, complaint: false };
  }

  // 3. Complaints, then unsubscribes, then hostility. All stop the sequence and suppress the address.
  if (COMPLAINT.test(body)) return { kind: "complaint", classification: "UNSUBSCRIBE", ruleHit: "complaint", suppress: "COMPLAINT", complaint: true };
  if (UNSUBSCRIBE.test(body)) return { kind: "unsubscribe", classification: "UNSUBSCRIBE", ruleHit: "unsubscribe", suppress: "OPT_OUT", complaint: false };
  if (HOSTILE.test(body)) return { kind: "hostile", classification: "UNSUBSCRIBE", ruleHit: "hostile", suppress: "OPT_OUT", complaint: false };
  return null;
}

/** Whatever the model says, a rule-decided reply stays rule-decided; a model can only pick among the benign classes. */
export const BENIGN_CLASSES: ReadonlySet<ReplyClass> = new Set(["INTERESTED", "REFERRAL", "NOT_NOW", "NO", "OTHER"]);

export function finalClassification(rule: RuleVerdict | null, model: ReplyClass | null): ReplyClass {
  if (rule) return rule.classification;
  return model && BENIGN_CLASSES.has(model) ? model : "OTHER";
}
