import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Builds a throw-away database that looks like Supabase (an `auth` schema with `auth.uid()` and an
 * `authenticated` role), applies every migration, seeds two users, and proves the outreach RLS policies:
 * owners can READ their own rows, nobody can read another user's rows, and the public API role can never
 * write approvals, read mailbox tokens, or touch the compliance tables.
 */
const ADMIN_URL = process.env.DATABASE_URL!.replace(/\/[^/]*$/, "/postgres");
const DB_NAME = `rls_test_${Date.now()}`;
const A = randomUUID();
const B = randomUUID();

let admin: pg.Client;
let db: pg.Client;

/** Run `fn` as the Supabase `authenticated` role signed in as `uid`, inside a rolled-back transaction. */
async function asUser<T>(uid: string, fn: (q: (sql: string, params?: unknown[]) => Promise<pg.QueryResult>) => Promise<T>): Promise<T> {
  await db.query("BEGIN");
  try {
    await db.query("SET LOCAL ROLE authenticated");
    await db.query("SELECT set_config('app.uid', $1, true)", [uid]);
    return await fn((sql, params) => db.query(sql, params));
  } finally {
    await db.query("ROLLBACK");
  }
}

beforeAll(async () => {
  admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${DB_NAME}"`);
  await admin.query("DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF; END $$");

  db = new pg.Client({ connectionString: ADMIN_URL.replace(/\/postgres$/, `/${DB_NAME}`) });
  await db.connect();
  await db.query("CREATE SCHEMA auth");
  await db.query("CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('app.uid', true), '')::uuid $$");

  const dir = path.join(process.cwd(), "prisma", "migrations");
  for (const m of readdirSync(dir).filter((d) => /^\d/.test(d)).sort()) {
    await db.query(readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
  }
  // Supabase grants table privileges to the API roles; RLS is what restricts them.
  await db.query("GRANT USAGE ON SCHEMA public, auth TO authenticated");
  await db.query("GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated");
  await db.query("GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated");

  // Seed as the owner role (bypasses RLS).
  for (const [id, email] of [[A, "a@example.com"], [B, "b@example.com"]]) await db.query(`INSERT INTO "User"(id, email) VALUES ($1, $2)`, [id, email]);
  for (const [uid, tag] of [[A, "a"], [B, "b"]]) {
    await db.query(`INSERT INTO "OutreachProfile"("userId", "updatedAt") VALUES ($1, now())`, [uid]);
    await db.query(`INSERT INTO "OutreachCampaign"(id, "userId", "jobSnapshot", "companyKey") VALUES ($1, $2, '{}', 'acme')`, [`c-${tag}`, uid]);
    await db.query(`INSERT INTO "OutreachTarget"(id, "campaignId", "fullName", "roleType", "dataProvider", "updatedAt") VALUES ($1, $2, 'P', 'RECRUITER', 'fake', now())`, [`t-${tag}`, `c-${tag}`]);
    await db.query(`INSERT INTO "OutreachMessage"(id, "targetId", channel, step, body, "updatedAt") VALUES ($1, $2, 'EMAIL', 1, 'hello', now())`, [`m-${tag}`, `t-${tag}`]);
    await db.query(`INSERT INTO "LinkedInStep"(id, "targetId", "updatedAt") VALUES ($1, $2, now())`, [`l-${tag}`, `t-${tag}`]);
    await db.query(`INSERT INTO "Reply"(id, "messageId", "providerMessageId", "receivedAt", snippet) VALUES ($1, $2, $3, now(), 'thanks')`, [`r-${tag}`, `m-${tag}`, `pm-${tag}`]);
    await db.query(`INSERT INTO "ConnectedAccount"(id, "userId", provider, "accountEmail", "encryptedRefreshToken", scopes) VALUES ($1, $2, 'GMAIL', $3, 'v1.secret', '{}')`, [`ca-${tag}`, uid, `${tag}@gmail.com`]);
    await db.query(`INSERT INTO "CreditLedger"(id, "userId", delta, reason, "refType", "refId") VALUES ($1, $2, 5, 'TRIAL_GRANT', 'trial', $3)`, [`cl-${tag}`, uid, uid]);
    await db.query(`INSERT INTO "ProviderUsage"(id, "userId", provider, operation, "costMicros") VALUES ($1, $2, 'fake', 'search', 10)`, [`pu-${tag}`, uid]);
  }
  await db.query(`INSERT INTO "SuppressionEntry"(id, "emailHash", reason) VALUES ('s1', 'hash1', 'OPT_OUT')`);
  await db.query(`INSERT INTO "AuditEvent"(id, "userId", action, "entityType") VALUES ('ae1', $1, 'x', 'y')`, [A]);
  await db.query(`INSERT INTO "AppSetting"(key, value, "updatedAt") VALUES ('k', '{}', now())`);
  const job = (id: string, owner: string | null) =>
    db.query(`INSERT INTO "Job"(id, source, "externalId", title, company, "companySlug", "descriptionText", "postedAt", "applyUrl", "dedupeHash", "ownerUserId") VALUES ($1, 's', $1, 'T', 'C', 'c', 'd', now(), 'https://x.example', $1, $2)`, [id, owner]);
  await job("job-shared", null);
  await job("job-a", A);
});

afterAll(async () => {
  await db?.end();
  if (admin) {
    await admin.query(`DROP DATABASE IF EXISTS "${DB_NAME}" WITH (FORCE)`);
    await admin.end();
  }
});

describe("outreach RLS (Supabase-shaped database)", () => {
  it("owners can read their own outreach rows at every level, and only theirs", async () => {
    await asUser(A, async (q) => {
      for (const [table, expected] of [["OutreachProfile", 1], ["OutreachCampaign", 1], ["OutreachTarget", 1], ["OutreachMessage", 1], ["LinkedInStep", 1], ["Reply", 1], ["CreditLedger", 1]] as const) {
        const r = await q(`SELECT count(*)::int AS n FROM "${table}"`);
        expect(r.rows[0].n, table).toBe(expected);
      }
      expect((await q(`SELECT id FROM "OutreachMessage"`)).rows[0].id).toBe("m-a");
      expect((await q(`SELECT id FROM "Reply"`)).rows[0].id).toBe("r-a");
    });
    await asUser(B, async (q) => {
      expect((await q(`SELECT id FROM "OutreachCampaign"`)).rows.map((r) => r.id)).toEqual(["c-b"]);
      expect((await q(`SELECT id FROM "OutreachMessage" WHERE id = 'm-a'`)).rows).toHaveLength(0);
    });
  });

  it("signed-out (no uid) sees nothing", async () => {
    await asUser("", async (q) => {
      for (const t of ["OutreachCampaign", "OutreachTarget", "OutreachMessage", "Reply", "CreditLedger"]) expect((await q(`SELECT 1 FROM "${t}"`)).rows, t).toHaveLength(0);
    });
  });

  it("the public API can never write outreach data: approvals, recipients, credits are server-only", async () => {
    await asUser(A, async (q) => {
      // No INSERT policy at all -> rejected outright.
      await expect(q(`INSERT INTO "OutreachMessage"(id, "targetId", channel, step, body, "updatedAt") VALUES ('x', 't-a', 'EMAIL', 2, 'sneaky', now())`)).rejects.toThrow(/row-level security/);
    });
    await asUser(A, async (q) => {
      // No UPDATE/DELETE policy -> the owner's own row is simply not writable (0 rows affected).
      expect((await q(`UPDATE "OutreachMessage" SET "approvedTextHash" = 'forged' WHERE id = 'm-a'`)).rowCount).toBe(0);
      expect((await q(`UPDATE "OutreachTarget" SET email = 'attacker@example.com' WHERE id = 't-a'`)).rowCount).toBe(0);
      expect((await q(`DELETE FROM "OutreachMessage" WHERE id = 'm-a'`)).rowCount).toBe(0);
    });
    await asUser(A, async (q) => {
      await expect(q(`INSERT INTO "CreditLedger"(id, "userId", delta, reason, "refType", "refId") VALUES ('free', $1, 1000, 'ADJUSTMENT', 'x', 'y')`, [A])).rejects.toThrow(/row-level security/);
    });
    const check = await db.query(`SELECT "approvedTextHash" FROM "OutreachMessage" WHERE id = 'm-a'`);
    expect(check.rows[0].approvedTextHash).toBeNull();
  });

  it("mailbox tokens and compliance/cost tables are unreachable from the public API", async () => {
    await asUser(A, async (q) => {
      for (const t of ["ConnectedAccount", "SuppressionEntry", "AuditEvent", "ProviderUsage", "AppSetting"]) {
        expect((await q(`SELECT 1 FROM "${t}"`)).rows, t).toHaveLength(0);
      }
      await expect(q(`INSERT INTO "SuppressionEntry"(id, "emailHash", reason) VALUES ('hack', 'h', 'MANUAL')`)).rejects.toThrow(/row-level security/);
    });
  });

  it("private jobs are visible only to their owner; shared jobs to everyone", async () => {
    await asUser(A, async (q) => expect((await q(`SELECT id FROM "Job" ORDER BY id`)).rows.map((r) => r.id)).toEqual(["job-a", "job-shared"]));
    await asUser(B, async (q) => expect((await q(`SELECT id FROM "Job" ORDER BY id`)).rows.map((r) => r.id)).toEqual(["job-shared"]));
  });

  it("the migrations are a no-op on plain Postgres (no auth schema)", async () => {
    const plain = `rls_plain_${Date.now()}`;
    await admin.query(`CREATE DATABASE "${plain}"`);
    const c = new pg.Client({ connectionString: ADMIN_URL.replace(/\/postgres$/, `/${plain}`) });
    await c.connect();
    try {
      const dir = path.join(process.cwd(), "prisma", "migrations");
      for (const m of readdirSync(dir).filter((d) => /^\d/.test(d)).sort()) await c.query(readFileSync(path.join(dir, m, "migration.sql"), "utf8"));
      const r = await c.query(`SELECT count(*)::int AS n FROM pg_tables WHERE schemaname = 'public' AND rowsecurity`);
      expect(r.rows[0].n).toBe(0);
    } finally {
      await c.end();
      await admin.query(`DROP DATABASE IF EXISTS "${plain}" WITH (FORCE)`);
    }
  });
});
