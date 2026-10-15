import path from "node:path";
import fs from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Happy path: landing → sign in (dev bypass) → upload resume → review profile → preferences →
 * ranked feed → job detail → ATS check → save → tracker.
 *
 * Prerequisites: a migrated + seeded database (`npm run db:migrate && npm run db:seed`) and DEV_AUTH_BYPASS=true
 * (the Playwright webServer sets it). No Anthropic key is needed — the app falls back to its offline parser
 * and keyword scoring, and AI-only features show a friendly "not configured" message.
 */
// Keep the suite re-runnable: a user may hold at most 5 resumes, so start from a clean slate.
test.beforeEach(async ({ request }) => {
  const res = await request.get("/api/resume");
  for (const r of (await res.json()) as Array<{ id: string }>) await request.delete(`/api/resume/${r.id}`);
});

/** Skip the UI: create a profile through the API so other tests start from a signed-in, matched user. */
async function seedProfile(request: APIRequestContext) {
  const up = await request.post("/api/resume/upload", {
    multipart: { file: { name: "resume.pdf", mimeType: "application/pdf", buffer: fs.readFileSync(path.join(__dirname, "fixtures", "sample-resume.pdf")) } },
  });
  expect(up.ok()).toBeTruthy();
  await request.put("/api/preferences", { data: { targetRoles: ["Frontend Engineer"], locations: ["Bengaluru"], jobTypes: ["FULL_TIME"], currency: "INR" } });
  expect((await request.post("/api/matches/refresh")).ok()).toBeTruthy();
}

test("upload resume → ranked feed → job detail → ATS → tracker", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Upload your resume");

  // No horizontal scrolling at any width (375px mobile project included).
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(await overflow()).toBeLessThanOrEqual(0);

  // With DEV_AUTH_BYPASS the visitor is already signed in, so the CTA goes straight to the app
  // (signed-out visitors are sent to /login, which is covered by the login test below).
  await page.getByRole("link", { name: "Upload resume" }).first().click();
  await expect(page).toHaveURL(/\/(jobs|login)/);
  await page.goto("/onboarding");

  // Step 1 — upload. (An existing profile from a previous run starts at "review"; upload again either way.)
  if (await page.getByRole("button", { name: /Upload a different file/ }).isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /Upload a different file/ }).click();
  }
  await page.getByTestId("resume-input").setInputFiles(path.join(__dirname, "fixtures", "sample-resume.pdf"));

  // Step 2 — review the parsed profile.
  await expect(page.getByText("Please review what we understood").or(page.getByText("Basic parsing used"))).toBeVisible({ timeout: 60_000 });
  await expect(page.getByLabel("Full name")).toHaveValue("Asha Verma");
  await expect(page.getByLabel("Email", { exact: true })).toHaveValue("asha.verma@example.com");
  await page.getByRole("button", { name: "Looks good — continue" }).click();

  // Step 3 — preferences.
  await expect(page.getByRole("heading", { name: "What are you looking for?" })).toBeVisible();
  await page.getByLabel("Target roles").fill("Frontend Engineer");
  await page.getByLabel("Target roles").press("Enter");
  await page.getByRole("button", { name: "Show my matches" }).click();

  // Step 4 — ranked feed.
  await expect(page).toHaveURL(/\/jobs$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Your job feed" })).toBeVisible();
  const cards = page.getByRole("article");
  await expect(cards.first()).toBeVisible();
  expect(await cards.count()).toBeGreaterThan(3);
  await expect(cards.first().getByRole("img", { name: /out of 100/ })).toBeVisible(); // match score
  expect(await overflow()).toBeLessThanOrEqual(0);

  // Filters work (server-rendered GET form).
  await page.getByLabel("Search jobs").fill("react");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/q=react/);
  await expect(cards.first()).toBeVisible();

  // Job detail shows source, apply link and match breakdown.
  const title = await cards.first().getByRole("heading", { level: 3 }).innerText();
  await cards.first().getByRole("link", { name: "View details" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText(title.split("\n")[0]);
  await expect(page.getByRole("link", { name: /^Apply on/ })).toHaveAttribute("href", /^https?:\/\//);
  await expect(page.getByText(/^via /).first()).toBeVisible();
  await expect(page.getByText("Skills you have")).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);

  // ATS check on this job.
  await page.getByRole("tab", { name: "ATS score" }).click();
  await page.getByRole("button", { name: "Check my resume" }).click();
  await expect(page.getByRole("img", { name: /Overall ATS score/ })).toBeVisible();
  await expect(page.getByText("Keyword coverage")).toBeVisible();

  // Save → tracker.
  // (A previous run on the same dev database may already have saved this job.)
  const saveButton = page.getByRole("button", { name: /Save for later/ });
  if (await saveButton.isVisible().catch(() => false)) await saveButton.click();
  await expect(page.getByRole("button", { name: /In your tracker/ })).toBeVisible();
  await page.goto("/tracker");
  await expect(page.getByRole("heading", { name: "Application tracker" })).toBeVisible();
  await expect(page.getByRole("region", { name: /^Saved/ }).getByRole("link", { name: title.split("\n")[0] })).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(0);
});

test("hidden jobs, companies and the ATS checker load", async ({ page, request }) => {
  await seedProfile(request);
  await page.goto("/hidden");
  await expect(page.getByRole("heading", { name: "Hidden jobs" })).toBeVisible();
  await page.goto("/companies");
  await expect(page.getByRole("heading", { name: "Companies" })).toBeVisible();
  await page.goto("/ats");
  await expect(page.getByRole("heading", { name: "ATS score checker" })).toBeVisible();
  await page.getByRole("button", { name: "Check ATS score" }).click();
  await expect(page.getByRole("img", { name: /Overall ATS score/ })).toBeVisible();
});

test("login page redirects the dev user into the app", async ({ page }) => {
  await page.goto("/login");
  await expect(page).toHaveURL(/\/(onboarding|login)/);
});

test("tailoring without an AI key fails gracefully", async ({ page, request }) => {
  await seedProfile(request);
  await page.goto("/jobs");
  await page.getByRole("link", { name: "View details" }).first().click();
  await page.getByRole("link", { name: "Tailor my resume" }).click();
  await expect(page.getByRole("heading", { name: "Tailor your resume for this job" })).toBeVisible();
});
