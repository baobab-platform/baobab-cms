import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."tenants" ADD COLUMN "control_plane_tenant_id" varchar;
  CREATE UNIQUE INDEX "tenants_control_plane_tenant_id_idx" ON "payload"."tenants" USING btree ("control_plane_tenant_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX "payload"."tenants_control_plane_tenant_id_idx";
  ALTER TABLE "payload"."tenants" DROP COLUMN "control_plane_tenant_id";`)
}
