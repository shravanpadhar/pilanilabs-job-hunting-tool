-- Row Level Security for the outreach engine (Supabase). No-op on plain PostgreSQL, like 0002_rls.
--
-- The app reaches Postgres through Prisma with a privileged role (bypasses RLS) and scopes every query
-- itself. These policies are defence in depth for the public Supabase API (anon / authenticated keys),
-- and they are deliberately STRICTER than 0002: outreach tables are READ-ONLY for signed-in users.
-- Approval records, recipients, schedules and credits can therefore only ever be written by the server.

DO $$
DECLARE
  tbl text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'auth')
     OR NOT EXISTS (
       SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'auth' AND p.proname = 'uid'
     )
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    RAISE NOTICE 'Supabase auth schema not found - skipping outreach RLS policies.';
    RETURN;
  END IF;

  -- Owner read-only: rows with a direct "userId".
  FOREACH tbl IN ARRAY ARRAY['OutreachProfile', 'OutreachCampaign', 'CreditLedger']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS own_rows_read ON %I', tbl);
    EXECUTE format('CREATE POLICY own_rows_read ON %I FOR SELECT TO authenticated USING ("userId" = auth.uid())', tbl);
  END LOOP;

  -- Owner read-only through the campaign.
  ALTER TABLE "OutreachTarget" ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS own_rows_read ON "OutreachTarget";
  CREATE POLICY own_rows_read ON "OutreachTarget" FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM "OutreachCampaign" c WHERE c.id = "OutreachTarget"."campaignId" AND c."userId" = auth.uid())
  );

  ALTER TABLE "OutreachMessage" ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS own_rows_read ON "OutreachMessage";
  CREATE POLICY own_rows_read ON "OutreachMessage" FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "OutreachTarget" t JOIN "OutreachCampaign" c ON c.id = t."campaignId"
      WHERE t.id = "OutreachMessage"."targetId" AND c."userId" = auth.uid()
    )
  );

  ALTER TABLE "LinkedInStep" ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS own_rows_read ON "LinkedInStep";
  CREATE POLICY own_rows_read ON "LinkedInStep" FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "OutreachTarget" t JOIN "OutreachCampaign" c ON c.id = t."campaignId"
      WHERE t.id = "LinkedInStep"."targetId" AND c."userId" = auth.uid()
    )
  );

  ALTER TABLE "Reply" ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS own_rows_read ON "Reply";
  CREATE POLICY own_rows_read ON "Reply" FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM "OutreachMessage" m
      JOIN "OutreachTarget" t ON t.id = m."targetId"
      JOIN "OutreachCampaign" c ON c.id = t."campaignId"
      WHERE m.id = "Reply"."messageId" AND c."userId" = auth.uid()
    )
  );

  -- Server-only: RLS enabled and NO policies, so the public API can read or write nothing.
  -- ConnectedAccount holds encrypted mailbox tokens; the others are compliance / cost data.
  FOREACH tbl IN ARRAY ARRAY['ConnectedAccount', 'SuppressionEntry', 'AuditEvent', 'ProviderUsage', 'AppSetting']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;

  -- Private (user-pasted) jobs: shared jobs stay readable by everyone signed in; a private job
  -- is readable only by its owner. Replaces the blanket "read_all" policy from 0002.
  DROP POLICY IF EXISTS read_all ON "Job";
  DROP POLICY IF EXISTS read_shared_or_own ON "Job";
  CREATE POLICY read_shared_or_own ON "Job" FOR SELECT TO authenticated
    USING ("ownerUserId" IS NULL OR "ownerUserId" = auth.uid());
END
$$;
