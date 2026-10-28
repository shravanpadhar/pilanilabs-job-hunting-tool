import { describe, expect, it } from "vitest";
import { applyRules, finalClassification } from "@/lib/outreach/reply-rules";

const msg = (text: string, over: { from?: string; headers?: Record<string, string> } = {}) => ({ from: over.from ?? "Aarav Kapoor <aarav@acme.test>", text, headers: over.headers ?? {} });
const rule = (text: string, over?: Parameters<typeof msg>[1]) => applyRules(msg(text, over));

describe("rule layer: unsubscribe and hostile replies stop the sequence by rule", () => {
  it.each([
    "Please unsubscribe me.",
    "Remove me from your list",
    "Take me off this list please",
    "Stop emailing me.",
    "stop contacting me",
    "Do not contact me again",
    "Don't email me anymore",
    "No more emails, thanks",
    "I want to opt out",
    "Please opt-out my address",
    "Not interested in further emails",
    "Leave me alone",
    "Never contact me again",
  ])("%s -> UNSUBSCRIBE, suppress, final", (text) => {
    const v = rule(text)!;
    expect(v.classification).toBe("UNSUBSCRIBE");
    expect(v.suppress).toBe("OPT_OUT");
    expect(v.complaint).toBe(false);
  });

  it.each(["How did you get my email address?", "Go away", "You idiot, shut up", "Where did you get my details"])("hostile: %s", (text) => {
    const v = rule(text)!;
    expect(v.kind).toBe("hostile");
    expect(v.classification).toBe("UNSUBSCRIBE");
    expect(v.suppress).toBe("OPT_OUT");
  });

  it.each(["This is spam.", "I am reporting you to Google.", "I will report this to the authorities", "This is harassment", "My lawyer will contact you", "We will take legal action", "cease and desist", "This looks like phishing", "This is a scam", "I have marked you as spam", "GDPR complaint incoming"])("complaint: %s", (text) => {
    const v = rule(text)!;
    expect(v.kind).toBe("complaint");
    expect(v.complaint).toBe(true);
    expect(v.suppress).toBe("COMPLAINT");
    expect(v.ruleHit).toBe("complaint");
  });

  it("a friendly mention of spam is not a complaint, and a normal answer matches no rule", () => {
    expect(rule("Thanks, this isn't spam at all, happy to chat!")).toBeNull();
    expect(rule("Hi Asha, we are not hiring for this role right now, sorry!")).toBeNull();
    expect(rule("Sure, send me your resume and I will pass it on.")).toBeNull();
    expect(rule("")).toBeNull();
  });
});

describe("rule layer: bounces and automatic replies", () => {
  it("recognises a hard bounce (suppress the address) and a soft bounce (do not)", () => {
    const hard = rule("Delivery Status Notification (Failure)\n550 5.1.1 The email account that you tried to reach does not exist.", { from: "Mail Delivery Subsystem <mailer-daemon@googlemail.com>" })!;
    expect(hard.kind).toBe("bounce_hard");
    expect(hard.suppress).toBe("BOUNCE");
    const soft = rule("Undelivered Mail Returned to Sender: the recipient's mailbox is full, try again later (452 4.2.2)", { from: "postmaster@acme.test" })!;
    expect(soft.kind).toBe("bounce_soft");
    expect(soft.suppress).toBeNull();
    expect(rule("random body", { headers: { "X-Failed-Recipients": "aarav@acme.test" } })!.kind).toBe("bounce_hard");
    expect(rule("report", { headers: { "Content-Type": "multipart/report; report-type=delivery-status" }, from: "x@y.test" })!.kind).toBe("bounce_soft");
  });
  it("recognises out-of-office mail by header or by text", () => {
    expect(rule("I am away", { headers: { "Auto-Submitted": "auto-replied" } })!.classification).toBe("OUT_OF_OFFICE");
    expect(rule("hi", { headers: { Precedence: "auto_reply" } })!.classification).toBe("OUT_OF_OFFICE");
    expect(rule("Thank you for your email. I am out of office until Monday and will reply when I return.")!.classification).toBe("OUT_OF_OFFICE");
    expect(rule("hi", { headers: { "X-Autoreply": "yes" } })!.kind).toBe("auto_reply");
  });
  it("a bounce is decided before anything else in the text", () => {
    const v = rule("550 user unknown. Also: please unsubscribe me", { from: "mailer-daemon@x.test" })!;
    expect(v.kind).toBe("bounce_hard");
  });
});

describe("whatever the model says, the rule wins", () => {
  it("a rule verdict is final, even if the model claims the reply is interested", () => {
    const v = rule("Sounds interesting! But please remove me from your list.")!;
    for (const modelSays of ["INTERESTED", "REFERRAL", "NOT_NOW", "NO", "OTHER", null] as const) {
      expect(finalClassification(v, modelSays)).toBe("UNSUBSCRIBE");
    }
  });
  it("without a rule the model may only choose a benign class", () => {
    expect(finalClassification(null, "INTERESTED")).toBe("INTERESTED");
    expect(finalClassification(null, "REFERRAL")).toBe("REFERRAL");
    expect(finalClassification(null, "NO")).toBe("NO");
    expect(finalClassification(null, null)).toBe("OTHER");
    // The model cannot declare a reply "unsubscribe" or "out of office" on its own: those come from rules.
    expect(finalClassification(null, "UNSUBSCRIBE")).toBe("OTHER");
    expect(finalClassification(null, "OUT_OF_OFFICE")).toBe("OTHER");
  });
});
