import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres';

/**
 * ADR-0012 §65–66 and accepted ADR-0021: a validation read is not atomic.
 * PostgreSQL 17 NULLS NOT DISTINCT enforces the full scope even when no
 * estate or locale is selected. Existing duplicates abort the migration:
 * they must be reconciled without silently discarding canonical content.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM "payload"."pages"
        GROUP BY "tenant_id", "digital_estate_id", "locale", "slug"
        HAVING count(*) > 1
      ) THEN
        RAISE EXCEPTION 'ADR-0012: duplicate page scoped slugs require governed reconciliation before migration';
      END IF;
      IF EXISTS (
        SELECT 1 FROM "payload"."site_configurations"
        GROUP BY "tenant_id", "digital_estate_id", "locale", "kind"
        HAVING count(*) > 1
      ) THEN
        RAISE EXCEPTION 'ADR-0021: duplicate site singleton scopes require governed reconciliation before migration';
      END IF;
    END $$;
    CREATE UNIQUE INDEX "pages_tenant_estate_locale_slug_uidx"
      ON "payload"."pages" ("tenant_id", "digital_estate_id", "locale", "slug")
      NULLS NOT DISTINCT;
    CREATE UNIQUE INDEX "site_configurations_tenant_estate_locale_kind_uidx"
      ON "payload"."site_configurations" ("tenant_id", "digital_estate_id", "locale", "kind")
      NULLS NOT DISTINCT;
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "payload"."site_configurations_tenant_estate_locale_kind_uidx";
    DROP INDEX IF EXISTS "payload"."pages_tenant_estate_locale_slug_uidx";
  `);
}
