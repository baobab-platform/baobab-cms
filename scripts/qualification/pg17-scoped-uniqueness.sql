-- ADR-0012 / ADR-0021: PostgreSQL 17 concurrency invariant witness.
-- Run only against the disposable CI database AFTER a CMS content fixture
-- has seeded a tenant + Organisation. All probes roll back.
BEGIN;

DO $$
DECLARE
  scoped_tenant uuid;
  scoped_org uuid;
  test_slug text := 'cms-unique-' || substr(md5(clock_timestamp()::text), 1, 12);
BEGIN
  SELECT tenant_id, organisation_id INTO scoped_tenant, scoped_org
  FROM payload.pages LIMIT 1;
  IF scoped_tenant IS NULL OR scoped_org IS NULL THEN
    RAISE EXCEPTION 'PG17 scoped uniqueness witness requires a persisted page fixture';
  END IF;

  IF (
    SELECT count(*)
    FROM pg_index ix
    JOIN pg_class idx ON idx.oid = ix.indexrelid
    JOIN pg_namespace ns ON ns.oid = idx.relnamespace
    WHERE ns.nspname = 'payload'
      AND idx.relname IN ('pages_tenant_estate_locale_slug_uidx',
                          'site_configurations_tenant_estate_locale_kind_uidx')
      AND ix.indisunique AND ix.indnullsnotdistinct
  ) <> 2 THEN
    RAISE EXCEPTION 'Both scoped unique indexes must use NULLS NOT DISTINCT';
  END IF;

  INSERT INTO payload.pages (tenant_id, organisation_id, digital_estate_id, locale, title, slug)
  VALUES (scoped_tenant, scoped_org, NULL, NULL, 'Uniqueness test A', test_slug);

  BEGIN
    INSERT INTO payload.pages (tenant_id, organisation_id, digital_estate_id, locale, title, slug)
    VALUES (scoped_tenant, scoped_org, NULL, NULL, 'Duplicate must fail', test_slug);
    RAISE EXCEPTION 'Duplicate page (null estate + locale) unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'Page null-scope duplicate correctly refused';
  END;

  -- Different locale is a different legitimate scope for the same page slug.
  INSERT INTO payload.pages (tenant_id, organisation_id, digital_estate_id, locale, title, slug)
  VALUES (scoped_tenant, scoped_org, NULL, 'en-ZA', 'Localized distinct scope', test_slug);

  INSERT INTO payload.site_configurations
    (tenant_id, organisation_id, digital_estate_id, locale, title, slug, kind)
  VALUES (scoped_tenant, scoped_org, NULL, NULL, 'Uniqueness test singleton A', test_slug, 'navigation');

  BEGIN
    INSERT INTO payload.site_configurations
      (tenant_id, organisation_id, digital_estate_id, locale, title, slug, kind)
    VALUES (scoped_tenant, scoped_org, NULL, NULL, 'Duplicate singleton must fail', test_slug, 'navigation');
    RAISE EXCEPTION 'Duplicate site singleton (null estate + locale) unexpectedly accepted';
  EXCEPTION WHEN unique_violation THEN
    RAISE NOTICE 'Singleton null-scope duplicate correctly refused';
  END;

  -- Distinct locale for an otherwise identical site singleton is permitted.
  INSERT INTO payload.site_configurations
    (tenant_id, organisation_id, digital_estate_id, locale, title, slug, kind)
  VALUES (scoped_tenant, scoped_org, NULL, 'en-ZA', 'Localized singleton', test_slug, 'navigation');
END $$;

ROLLBACK;
