import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_site_configurations_body_type" AS ENUM('heading', 'paragraph');
  CREATE TABLE "payload"."site_configurations_navigation_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"href" varchar
  );
  
  CREATE TABLE "payload"."site_configurations_footer_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"label" varchar,
  	"href" varchar
  );
  
  CREATE TABLE "payload"."site_configurations_body" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"type" "payload"."enum_site_configurations_body_type" DEFAULT 'paragraph',
  	"text" varchar
  );
  
  ALTER TABLE "payload"."site_configurations" ADD COLUMN "statement" varchar;
  ALTER TABLE "payload"."site_configurations" ADD COLUMN "tagline" varchar;
  ALTER TABLE "payload"."site_configurations" ADD COLUMN "site_name" varchar;
  ALTER TABLE "payload"."site_configurations_navigation_items" ADD CONSTRAINT "site_configurations_navigation_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations_footer_links" ADD CONSTRAINT "site_configurations_footer_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations_body" ADD CONSTRAINT "site_configurations_body_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "site_configurations_navigation_items_order_idx" ON "payload"."site_configurations_navigation_items" USING btree ("_order");
  CREATE INDEX "site_configurations_navigation_items_parent_id_idx" ON "payload"."site_configurations_navigation_items" USING btree ("_parent_id");
  CREATE INDEX "site_configurations_footer_links_order_idx" ON "payload"."site_configurations_footer_links" USING btree ("_order");
  CREATE INDEX "site_configurations_footer_links_parent_id_idx" ON "payload"."site_configurations_footer_links" USING btree ("_parent_id");
  CREATE INDEX "site_configurations_body_order_idx" ON "payload"."site_configurations_body" USING btree ("_order");
  CREATE INDEX "site_configurations_body_parent_id_idx" ON "payload"."site_configurations_body" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE IF EXISTS "payload"."site_configurations_navigation_items" CASCADE;
  DROP TABLE IF EXISTS "payload"."site_configurations_footer_links" CASCADE;
  DROP TABLE IF EXISTS "payload"."site_configurations_body" CASCADE;
  ALTER TABLE "payload"."site_configurations" DROP COLUMN IF EXISTS "statement";
  ALTER TABLE "payload"."site_configurations" DROP COLUMN IF EXISTS "tagline";
  ALTER TABLE "payload"."site_configurations" DROP COLUMN IF EXISTS "site_name";
  DROP TYPE "payload"."enum_site_configurations_body_type";`)
}
