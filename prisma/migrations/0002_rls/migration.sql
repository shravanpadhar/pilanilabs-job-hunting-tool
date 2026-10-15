-- Row Level Security (Supabase).
--
-- The app talks to Postgres through Prisma with a privileged role (which bypasses RLS) and always
-- scopes queries by the signed-in user. These policies are defence in depth: they guarantee that
-- anything reaching the database through Supabase's public API (anon / authenticated keys) can only
-- see a user's own resumes, matches, tailored resumes and applications.
--
-- The block is a no-op on plain PostgreSQL (no `auth` schema), so local development is unaffected.

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
    RAISE NOTICE 'Supabase auth schema not found - skipping RLS policies.';
    RETURN;
  END IF;

  -- Tables where every row belongs to one user ("userId" = auth.uid()).
  FOREACH tbl IN ARRAY ARRAY['Resume', 'Preferences', 'Match', 'TailoredResume', 'Application', 'SavedSearch', 'AiUsage', 'ReferralDraft', 'AlertLog']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS own_rows ON %I', tbl);
    EXECUTE format(
      'CREATE POLICY own_rows ON %I FOR ALL TO authenticated USING ("userId" = auth.uid()) WITH CHECK ("userId" = auth.uid())',
      tbl
    );
  END LOOP;

  -- Users can read and update only their own profile row.
  ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS own_profile_select ON "User";
  DROP POLICY IF EXISTS own_profile_update ON "User";
  CREATE POLICY own_profile_select ON "User" FOR SELECT TO authenticated USING (id = auth.uid());
  CREATE POLICY own_profile_update ON "User" FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

  -- Shared reference data: readable by signed-in users, writable only by the service role.
  FOREACH tbl IN ARRAY ARRAY['Job', 'CompanyProfile', 'CompanyBoard']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', tbl);
    EXECUTE format('DROP POLICY IF EXISTS read_all ON %I', tbl);
    EXECUTE format('CREATE POLICY read_all ON %I FOR SELECT TO authenticated USING (true)', tbl);
  END LOOP;

  -- Community reviews: everyone signed in can read; authors manage their own.
  ALTER TABLE "CompanyReview" ENABLE ROW LEVEL SECURITY;
  DROP POLICY IF EXISTS reviews_read ON "CompanyReview";
  DROP POLICY IF EXISTS reviews_write ON "CompanyReview";
  CREATE POLICY reviews_read ON "CompanyReview" FOR SELECT TO authenticated USING (true);
  CREATE POLICY reviews_write ON "CompanyReview" FOR ALL TO authenticated USING ("userId" = auth.uid()) WITH CHECK ("userId" = auth.uid());

  -- Operational logs: no policies = no access through the public API.
  ALTER TABLE "FetchRun" ENABLE ROW LEVEL SECURITY;
END
$$;
