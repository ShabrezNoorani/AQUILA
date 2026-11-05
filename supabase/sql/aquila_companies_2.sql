-- This only creates or changes mt_ objects and touches nothing else.
--
-- Lets a tag have any kind (for example type, place, food), not only "type" or "place".
-- The repo has no copy of the SQL that created mt_tags, so this cannot know whether the database
-- limits kind. It handles both ways the limit could have been made, and does nothing if there
-- is no limit. Safe to run more than once.

DO $$
DECLARE
  c record;
BEGIN
  -- 1. Remove any CHECK rule on mt_tags that mentions kind (for example kind in ('type','place')).
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.mt_tags'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%kind%'
      AND conname <> 'mt_tags_kind_not_blank'
  LOOP
    EXECUTE format('ALTER TABLE public.mt_tags DROP CONSTRAINT %I', c.conname);
  END LOOP;

  -- 2. If kind is an enum type with a fixed list, make it plain text. The enum type itself is
  --    left in place, in case anything else uses it.
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'mt_tags' AND column_name = 'kind'
      AND data_type = 'USER-DEFINED'
  ) THEN
    ALTER TABLE public.mt_tags ALTER COLUMN kind TYPE text USING kind::text;
  END IF;

  -- 3. A kind must still not be blank.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.mt_tags'::regclass AND conname = 'mt_tags_kind_not_blank'
  ) THEN
    ALTER TABLE public.mt_tags ADD CONSTRAINT mt_tags_kind_not_blank CHECK (btrim(kind) <> '');
  END IF;
END $$;
