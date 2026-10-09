import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."organisations" ADD COLUMN "control_plane_organisation_id" varchar;
  CREATE UNIQUE INDEX "organisations_control_plane_organisation_id_idx" ON "payload"."organisations" USING btree ("control_plane_organisation_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "payload"."organisations_control_plane_organisation_id_idx";
  ALTER TABLE "payload"."organisations" DROP COLUMN IF EXISTS "control_plane_organisation_id";`)
}
