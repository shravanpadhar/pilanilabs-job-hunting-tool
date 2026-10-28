import fs from "node:fs";
import path from "node:path";
import { expect as baseExpect, test, type APIRequestContext, type Page } from "@playwright/test";

// First visits compile routes and approvals render a PDF, so assertions here wait longer than the 5 s default.
const expect = baseExpect.configure({ timeout: 45_000 });

/**
 * The four user journeys of the product spec (section 6), end to end, on desktop and at 375 px:
 *   1. first session  2. outreach from a pasted link  3. a reply arrives  4. nothing happens.
 * Everything external is a fake (offline AI, in-memory Gmail, fake contact data and verification, inline queue, fixture job
 * pages) and time is driven by the test clock, so no keys and no waiting are needed. Requires a migrated local database.
 */
test.setTimeout(300_000);
test.use({ actionTimeout: 30_000 });

const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const dev = async (request: APIRequestContext, data: Record<string, unknown>) => {
  const res = await request.post("/api/dev/outreach", { data });
  expect(res.ok(), `dev ${String(data.action)}`).toBeTruthy();
  return res.json();
};
/** The newest campaign of the signed-in user (the wizard stays on /outreach/new, so the URL has no id). */
const latestCampaignId = async (request: APIRequestContext) => ((await (await request.get("/api/outreach/campaigns")).json()) as Array<{ id: string }>)[0].id;
const company = (suffix: string) => `acme${Date.now()}${suffix}`;

async function seedProfile(request: APIRequestContext) {
  const up = await request.post("/api/resume/upload", {
    multipart: { file: { name: "resume.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(path.join(__dirname, "fixtures", "sample-resume.pdf")) } },
  });
  expect(up.ok()).toBeTruthy();
  await request.put("/api/preferences", { data: { targetRoles: ["Frontend Engineer"], locations: ["Bengaluru"], jobTypes: ["FULL_TIME"], currency: "INR" } });
}

test.beforeEach(async ({ request }) => {
  const list = await request.get("/api/resume");
  for (const r of (await list.json()) as Array<{ id: string }>) await request.delete(`/api/resume/${r.id}`);
  await dev(request, { action: "reset" });
  await seedProfile(request);
  await request.post("/api/billing", { data: { action: "buy", packId: "standard" } }); // demo credits so activation is affordable
});
test.afterEach(async ({ request }) => {
  await dev(request, { action: "reset" });
});

/** Connect the demo mailbox if it is not connected yet. */
async function connectMailbox(page: Page) {
  await page.goto("/outreach");
  // The card loads its state in the browser: wait for it before deciding whether a connection is needed.
  const cardEl = page.getByTestId("mailbox-card");
  await expect(cardEl).toBeVisible();
  const connect = cardEl.getByRole("link", { name: /Connect Gmail/ });
  if (await connect.isVisible()) {
    await connect.click();
    await expect(page.getByTestId("mailbox-card").getByText("candidate@gmail.test")).toBeVisible();
  }
  await expect(page.getByTestId("mailbox-card").getByText("candidate@gmail.test")).toBeVisible();
}

/** Paste a job link, review it, find people, write drafts, approve everything for the first person, and start. */
async function startOutreach(page: Page, name: string) {
  await page.goto("/outreach/new");
  await page.getByLabel("Job link").fill(`https://${name}.fixture.test/jobs/1`);
  await page.getByRole("button", { name: "Read this job" }).click();
  await expect(page.getByTestId("extracted-title")).toHaveText("Senior Frontend Engineer");
  await page.getByRole("button", { name: "Continue with this job" }).click();
  await expect(page.getByTestId("campaign-title")).toBeVisible();

  await page.getByRole("button", { name: "Find people" }).click();
  await expect(page.getByTestId("target-card").first()).toBeVisible();
  await expect(page.getByTestId("target-card").first().getByText(/% confidence/)).toBeVisible(); // source and confidence are shown

  if (await page.getByRole("button", { name: "Save sender details" }).isVisible().catch(() => false)) {
    await page.getByLabel("Name recipients will see").fill("Asha Verma");
    await page.getByLabel("Postal address").fill("12 MG Road, Bengaluru 560001, India");
    await page.getByRole("button", { name: "Save sender details" }).click();
    await expect(page.getByRole("button", { name: "Save sender details" })).toBeHidden();
  }
  await page.getByRole("button", { name: "Write drafts" }).click();
  const first = page.getByTestId("draft-target").first();
  await expect(first).toBeVisible();

  // Approve every message for the first person (three emails and the LinkedIn note).
  for (let i = 0; i < 6; i++) {
    const buttons = first.getByRole("button", { name: "Approve" });
    const n = await buttons.count();
    if (n === 0) break;
    await buttons.first().click();
    await expect(first.getByRole("button", { name: "Approve" })).toHaveCount(n - 1);
  }

  // Schedule preview in both time zones.
  await page.getByRole("button", { name: "Preview schedule" }).click();
  const preview = page.getByTestId("schedule-preview");
  await expect(preview).toBeVisible();
  await expect(preview.getByText("Your time")).toBeVisible();
  await expect(preview.getByText("Their time")).toBeVisible();

  await page.getByRole("button", { name: "Start outreach" }).click();
  await expect(page.getByRole("heading", { name: "Conversations" })).toBeVisible();
}

/** Move the clock forward in 6-hour steps, running the sender tick each time, until `done` says stop. */
async function runUntil(request: APIRequestContext, done: () => Promise<boolean>, maxSteps = 80) {
  for (let i = 0; i < maxSteps; i++) {
    if (await done()) return;
    await dev(request, { action: "advance_clock", ms: 6 * 3_600_000 });
    await dev(request, { action: "tick" });
  }
  throw new Error("The condition was not reached in time.");
}

test("Journey 1: first session — connect a mailbox, choose a daily limit, see what will and will not be sent", async ({ page }) => {
  await page.goto("/");
  await page.goto("/outreach");
  await expect(page.getByRole("heading", { name: "Outreach", level: 1 })).toBeVisible();
  await expect(page.getByTestId("credits-card")).toContainText("credits left");
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await connectMailbox(page);
  const card = page.getByTestId("mailbox-card");
  await expect(card).toContainText("Nothing is sent without your approval");
  await expect(card).toContainText("opt-out line");
  await card.getByLabel("Daily send limit").selectOption("10");
  await page.reload();
  await expect(page.getByTestId("mailbox-card").getByLabel("Daily send limit")).toHaveValue("10");
  await expect(page.getByTestId("mailbox-card")).toContainText("warms up slowly"); // new mailboxes ramp up
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("Journey 2: outreach from a pasted link — people with sources, drafts, approval, schedule, and the first email goes out exactly once", async ({ page, request }) => {
  await connectMailbox(page);
  const name = company("j2");
  await startOutreach(page, name);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const campaignId = await latestCampaignId(request);

  // The job is "Outreach active" in the tracker.
  await page.goto("/tracker");
  await expect(page.getByText("Outreach active").first()).toBeVisible();

  // Time passes; the first email is sent, once, with the footer, opt-out line and approved text.
  await runUntil(request, async () => (await dev(request, { action: "state" })).mailboxSent >= 1);
  const state = await dev(request, { action: "state", campaignId });
  expect(state.mailboxSent).toBe(1);
  expect(state.sentInDb).toBe(1);
  await dev(request, { action: "tick" }); // ticking again never duplicates
  expect((await dev(request, { action: "state" })).mailboxSent).toBe(1);

  await page.goto(`/outreach/${campaignId}`);
  await expect(page.getByTestId("thread-card").first()).toContainText("Waiting for a reply");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("Journey 3: a reply arrives — sequence stops, candidate is notified with a suggested reply, and the job moves to Interviewing", async ({ page, request }) => {
  await connectMailbox(page);
  await startOutreach(page, company("j3"));
  const campaignId = await latestCampaignId(request);
  await runUntil(request, async () => (await dev(request, { action: "state" })).mailboxSent >= 1);

  await dev(request, { action: "inject_reply", text: "Hi Asha, I'm interested. Please send your resume and let's talk next week." });
  const polled = await dev(request, { action: "poll" });
  expect(polled.processed).toBe(1);
  expect((await dev(request, { action: "state" })).notifications.some((n: string) => /is interested/.test(n))).toBe(true);

  await page.goto(`/outreach/${campaignId}`);
  const reply = page.getByTestId("reply-card").first();
  await expect(reply).toContainText("Interested");
  await expect(reply).toContainText("Suggested reply (you send it yourself)");
  await expect(page.getByTestId("thread-card").first()).toContainText("Replied");
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // The sequence to that person stopped: further ticks send nothing.
  const sentBefore = (await dev(request, { action: "state" })).mailboxSent;
  for (let i = 0; i < 20; i++) {
    await dev(request, { action: "advance_clock", ms: 12 * 3_600_000 });
    await dev(request, { action: "tick" });
  }
  expect((await dev(request, { action: "state" })).mailboxSent).toBe(sentBefore);

  // The candidate confirms the interview: the tracker moves the job to Interviewing.
  const confirmed = page.waitForResponse((r) => /\/api\/outreach\/replies\//.test(r.url()) && r.ok());
  await reply.getByRole("button", { name: "I have an interview" }).click();
  await confirmed;
  await page.goto("/tracker");
  await expect(page.getByRole("region", { name: /^Interviewing/ }).getByRole("link", { name: "Senior Frontend Engineer" }).first()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("Journey 4: nothing happens — the sequence ends, the result is shown, and the next three people are offered", async ({ page, request }) => {
  await connectMailbox(page);
  await startOutreach(page, company("j4"));
  const campaignId = await latestCampaignId(request);

  await runUntil(request, async () => {
    const r = await request.get(`/api/outreach/campaigns/${campaignId}`);
    return (await r.json()).status === "COMPLETED";
  }, 120);
  expect((await dev(request, { action: "state" })).mailboxSent).toBe(3); // day 0, 3 and 7

  await page.goto(`/outreach/${campaignId}`);
  await expect(page.getByText("No replies this time")).toBeVisible();
  await page.getByRole("button", { name: "Find the next three people" }).click();
  await expect(page.getByRole("button", { name: /Find (more )?people/ })).toBeVisible(); // back in the targets step
  await page.getByRole("button", { name: /Find (more )?people/ }).click();
  await expect(page.getByTestId("target-card").first()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("opt-out: a recipient stops all contact with one confirmed click, and nothing more is sent", async ({ page, request }) => {
  await connectMailbox(page);
  await startOutreach(page, company("optout"));
  await runUntil(request, async () => (await dev(request, { action: "state" })).mailboxSent >= 1);
  const state = await dev(request, { action: "state" });
  expect(state.lastHasAttachment).toBe(true); // the tailored resume went with it
  expect(state.lastOptOutPath).toBeTruthy();

  await page.goto(state.lastOptOutPath);
  await expect(page.getByRole("heading", { name: "Stop receiving emails?" })).toBeVisible();
  await page.getByRole("button", { name: "Yes, stop emailing me" }).click();
  await expect(page.getByText("You will not receive further emails")).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  const sentBefore = state.mailboxSent;
  for (let i = 0; i < 24; i++) {
    await dev(request, { action: "advance_clock", ms: 12 * 3_600_000 });
    await dev(request, { action: "tick" });
  }
  expect((await dev(request, { action: "state" })).mailboxSent).toBe(sentBefore);

  await page.goto("/u/not-a-valid-token");
  await expect(page.getByRole("heading", { name: "This link is not valid" })).toBeVisible();
});
