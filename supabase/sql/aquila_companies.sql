-- This only creates mt_ objects and touches nothing else.
--
-- Competitor companies for AQUILA, and a company link on each listing.
-- Run once in the Supabase SQL editor. Nothing here touches AURELIA or any non-mt_ table
-- except adding one column to mt_listings, which is itself an mt_ table.
--
-- Policy: owner-only, like the other mt_ tables. No mt_ SQL file existed in the repo to copy
-- from, so compare this policy with the ones on mt_listings before running it.

CREATE TABLE mt_companies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid default auth.uid(),
  name text not null,
  is_own boolean not null default false,
  created_at timestamptz not null default now()
);

ALTER TABLE mt_companies ENABLE ROW LEVEL SECURITY;

-- Only the AQUILA owner (same id as src/lib/owner.ts) may read or change companies.
CREATE POLICY mt_companies_owner_only ON mt_companies
  FOR ALL
  TO authenticated
  USING (auth.uid() = '34baa0f9-5f19-47a9-8129-60e6da9853b3'::uuid)
  WITH CHECK (auth.uid() = '34baa0f9-5f19-47a9-8129-60e6da9853b3'::uuid);

ALTER TABLE mt_listings ADD COLUMN IF NOT EXISTS company_id uuid references mt_companies(id) on delete set null;

-- Company names are unique, ignoring capitals and outer spaces.
CREATE UNIQUE INDEX IF NOT EXISTS mt_companies_name_key ON mt_companies (lower(btrim(name)));
