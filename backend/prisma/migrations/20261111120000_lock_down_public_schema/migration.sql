-- Only the backend reads and writes these tables, connecting as the table
-- owner. On Supabase, the `public` schema is also exposed through the REST
-- Data API to the `anon` and `authenticated` roles, whose key ships in web
-- clients. This closes that path:
--
-- 1. RLS on every table, with no policies: those roles see no rows. The owner
--    (the backend) is not affected.
-- 2. Their table privileges are revoked, now and for tables created later.
--
-- On a plain Postgres without those roles, step 2 is skipped.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
  END IF;
END $$;
