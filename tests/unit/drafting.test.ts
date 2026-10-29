import { describe, expect, it } from "vitest";
import { composeEmailText, emailFooter, optOutToken, verifyOptOutToken } from "@/lib/compliance/optout";
import { approvalHash, canonicalPayload, sendKeyFor } from "@/lib/outreach/approval";
import { structureViolations, verifyDraftSet, warmEvidenceOf } from "@/lib/outreach/draft";
import { fallbackDrafts, templateInputFrom } from "@/lib/outreach/templates";
import { properNounPhrases, verifyMessage, wordCount, type VerifyContext } from "@/lib/outreach/verify-message";
import { resumeSchema } from "@/lib/resume/schema";

const resume = resumeSchema.parse({
  contact: { name: "Asha Verma", email: "asha@example.com", links: [{ label: "GitHub", url: "https://github.com/asha" }] },
  summary: "Frontend engineer with 5 years of experience.",
  skills: { technical: ["React", "TypeScript", "Node.js"], tools: ["Jest"] },
  experience: [{ company: "Initech", title: "Frontend Engineer", start: "2021", end: "2025", bullets: ["Cut page load time by 40% across 12 dashboards"] }],
  education: [{ institution: "BITS Pilani", degree: "B.E. Computer Science" }],
});
const ctx = (over: Partial<VerifyContext> = {}): VerifyContext => ({
  resume,
  job: { title: "Senior Frontend Engineer", company: "Acme Labs", location: "Bengaluru, India", description: "Build React apps. 4+ years of React required.", requirements: ["4+ years of React"] },
  target: { fullName: "Aarav Kapoor", title: "Engineering Manager", company: "Acme Labs", warmEvidence: null },
  senderName: "Asha Verma",
  ...over,
});
const kinds = (text: string, c = ctx()) => verifyMessage(text, c).map((v) => v.kind);

describe("message verifier: allowed facts pass", () => {
  it("accepts a message that only uses profile, job and recipient facts", () => {
    const text = "Hi Aarav,\n\nI saw the Senior Frontend Engineer opening at Acme Labs. I am a Frontend Engineer at Initech and work with React and TypeScript. I studied at BITS Pilani. Could you point me to the right person for this role?\n\nThank you,\nAsha";
    expect(verifyMessage(text, ctx())).toEqual([]);
  });
  it("allows numbers from the profile or the job, and the candidate's own links", () => {
    expect(kinds("I cut page load time by 40% and have 5 years of experience; see https://github.com/asha. The role asks for 4+ years of React.")).toEqual([]);
  });
});

describe("message verifier: fabrication is caught", () => {
  it("flags an employer, school or product that is not in the profile", () => {
    expect(kinds("I previously worked at Google on Search.")).toContain("name");
    expect(kinds("I graduated from IIT Bombay and worked at Infosys.")).toContain("name");
    expect(kinds("I am a Frontend Engineer at Globex.")).toContain("name");
  });
  it("flags invented numbers and metrics", () => {
    expect(kinds("I grew revenue by 300% and led 25 engineers.")).toEqual(expect.arrayContaining(["number"]));
    expect(verifyMessage("I have 15 years of experience.", ctx()).map((v) => v.value)).toContain("15");
  });
  it("flags links and email addresses that are not the candidate's own", () => {
    expect(kinds("Portfolio: https://evil.example/me")).toContain("link");
    expect(kinds("Reach me at someone@else.com")).toContain("link");
    expect(kinds("Reach me at asha@example.com")).toEqual([]);
  });
  it("flags claimed mutual connections in many phrasings", () => {
    for (const phrase of [
      "We have a mutual connection in the team.", "As a fellow alumnus I wanted to reach out.", "We both studied at the same college.", "My former colleague suggested I contact you.",
      "We go way back.", "I was referred by someone on your team.", "We share a common background in fintech.", "Priya told me I should reach out.",
    ]) {
      expect(kinds(phrase), phrase).toContain("mutual_connection");
    }
  });
  it("flags flattery and pressure", () => {
    expect(kinds("I am a huge fan and love your work, you are inspiring.")).toContain("flattery");
    expect(kinds("Please reply ASAP, this is urgent.")).toContain("pressure");
  });
});

describe("message verifier: a real warm path may be mentioned, and only by its evidence", () => {
  const warm = ctx({ target: { fullName: "Meera Nair", title: "Product Manager", company: "Acme Labs", warmEvidence: { kind: "school", value: "BITS Pilani" } } });
  it("allows a shared-school mention when the provider returned that evidence", () => {
    expect(kinds("I noticed we both studied at BITS Pilani.", warm)).toEqual([]);
  });
  it("still rejects the same claim without evidence, or for a different school", () => {
    expect(kinds("I noticed we both studied at BITS Pilani.", ctx())).toContain("mutual_connection");
    expect(kinds("I noticed we both studied at IIM Ahmedabad.", warm)).toEqual(expect.arrayContaining(["mutual_connection"]));
  });
  it("derives evidence only from a WARM_PATH record's sourceRef", () => {
    expect(warmEvidenceOf("fake:x:warm|school:BITS Pilani", "WARM_PATH")).toEqual({ kind: "school", value: "BITS Pilani" });
    expect(warmEvidenceOf("fake:x:warm|school:BITS Pilani", "RECRUITER")).toBeNull();
    expect(warmEvidenceOf("nothing", "WARM_PATH")).toBeNull();
  });
});

describe("proper noun detection", () => {
  it("ignores ordinary sentence starts and common greetings but catches names", () => {
    expect(properNounPhrases("Thanks for your time. I enjoy testing.")).toEqual([]);
    expect(properNounPhrases("Best, Asha")).toEqual(["Asha"]); // a sign-off name is a name, so it is checked against the profile
    expect(properNounPhrases("I worked with Acme Labs and Globex Corp in Pune.")).toEqual(expect.arrayContaining(["Acme Labs", "Globex Corp", "Pune"]));
  });
});

describe("structure rules", () => {
  const good = { email: [{ subject: "Question about the role", body: "word ".repeat(80) }], linkedinNote: "Hello there, would love to connect." };
  it("accepts a compliant draft", () => expect(structureViolations(good)).toEqual([]));
  it("enforces under 120 words, a plain subject and a 300-character note", () => {
    expect(structureViolations({ ...good, email: [{ subject: "ok subject", body: "word ".repeat(120) }] })).toHaveLength(1);
    expect(structureViolations({ ...good, email: [{ subject: "AMAZING OPPORTUNITY FOR YOU", body: "short body text here" }] })).toHaveLength(1);
    expect(structureViolations({ ...good, email: [{ subject: "Act now!", body: "short body text here" }] })).toHaveLength(1);
    expect(structureViolations({ ...good, email: [{ subject: "Re: your application", body: "short body text here" }] })).toHaveLength(1);
    expect(structureViolations({ ...good, email: [{ subject: "Hello 😀", body: "short body text here" }] })).toHaveLength(1);
    expect(structureViolations({ ...good, linkedinNote: "x".repeat(301) })).toHaveLength(1);
    expect(structureViolations({ ...good, linkedinNote: "x".repeat(300) })).toEqual([]);
  });
  it("counts words the same way everywhere", () => expect(wordCount("a b  c\nd")).toBe(4));
});

describe("deterministic fallback drafts pass the verifier by construction", () => {
  const profiles = [
    resume,
    resumeSchema.parse({ contact: { name: "Ravi" }, skills: { technical: [] }, experience: [], education: [] }),
    resumeSchema.parse({ contact: { name: "Zoë Müller-Jensen" }, skills: { technical: ["Go"], tools: ["Docker", "K8s"] }, experience: [{ company: "O'Reilly & Sons Pvt. Ltd.", title: "SRE", bullets: [] }], education: [{ institution: "IIT Delhi" }] }),
  ];
  for (const [i, r] of profiles.entries()) {
    for (const warm of [null, { kind: "school", value: "BITS Pilani" }] as const) {
      it(`profile ${i} ${warm ? "with" : "without"} a warm path`, () => {
        const job = { title: "Senior Frontend Engineer", company: "Acme Labs" };
        const target = { fullName: "Aarav Kapoor", roleType: warm ? "WARM_PATH" : "HIRING_MANAGER", warmEvidence: warm };
        const set = fallbackDrafts(templateInputFrom(r, job, target));
        const c = ctx({ resume: r, target: { fullName: "Aarav Kapoor", title: "Manager", company: "Acme Labs", warmEvidence: warm }, senderName: r.contact.name ?? "" });
        expect(verifyDraftSet(set, c)).toEqual([]);
        expect(set.email).toHaveLength(3);
        for (const e of set.email) expect(wordCount(e.body)).toBeLessThan(120);
        expect(set.linkedinNote.length).toBeLessThanOrEqual(300);
      });
    }
  }
});

describe("approval hash", () => {
  const base = { channel: "EMAIL", step: 1, to: "A@x.test", subject: "Hello", body: "Body\n\n--\nAsha", attachmentSha256: "abc" };
  it("is deterministic and not case-sensitive for the recipient", () => {
    expect(approvalHash(base)).toBe(approvalHash({ ...base }));
    expect(approvalHash(base)).toBe(approvalHash({ ...base, to: " a@X.test " }));
    expect(approvalHash(base)).toMatch(/^[0-9a-f]{64}$/);
  });
  it("changes when ANY approved element changes: recipient, subject, body, footer text, step, channel or attachment", () => {
    const h = approvalHash(base);
    for (const patch of [{ to: "b@x.test" }, { subject: "Hello!" }, { body: "Body2\n\n--\nAsha" }, { body: "Body\n\n--\nAsha V" }, { step: 2 }, { channel: "LINKEDIN_NOTE" }, { attachmentSha256: "abd" }, { attachmentSha256: null }]) {
      expect(approvalHash({ ...base, ...patch }), JSON.stringify(patch)).not.toBe(h);
    }
  });
  it("cannot be confused by moving text between fields", () => {
    expect(canonicalPayload({ ...base, subject: "A", body: "B" })).not.toBe(canonicalPayload({ ...base, subject: "AB", body: "" }));
  });
  it("send keys are unique per message and per approved text", () => {
    expect(sendKeyFor("m1", "h")).not.toBe(sendKeyFor("m2", "h"));
    expect(sendKeyFor("m1", "h")).not.toBe(sendKeyFor("m1", "h2"));
  });
});

describe("opt-out", () => {
  it("tokens verify, and tampering with the id or signature fails", () => {
    const t = optOutToken("target_123");
    expect(verifyOptOutToken(t)).toBe("target_123");
    expect(verifyOptOutToken(t.replace("target_123", "target_124"))).toBeNull();
    expect(verifyOptOutToken(`${t}x`)).toBeNull();
    expect(verifyOptOutToken("nodot")).toBeNull();
    expect(verifyOptOutToken(".sig")).toBeNull();
  });
  it("every email footer carries the sender identity, address and a working opt-out line", () => {
    const f = emailFooter({ senderName: "Asha Verma", postalAddress: "12 MG Road, Bengaluru 560001", targetId: "t1" });
    expect(f).toContain("Asha Verma");
    expect(f).toContain("12 MG Road");
    expect(f).toMatch(/unsubscribe/);
    expect(f).toContain(`/u/${optOutToken("t1")}`);
    expect(composeEmailText("Body", f)).toBe(`Body\n\n${f}`);
  });
});
