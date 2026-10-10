import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."site_configurations_navigation_children" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_configurations_navigation" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_configurations_footer_columns_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_configurations_footer_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_configurations_settings_social" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_configurations_profile_sections" DISABLE ROW LEVEL SECURITY;
  DROP TABLE IF EXISTS "payload"."site_configurations_navigation_children" CASCADE;
  DROP TABLE IF EXISTS "payload"."site_configurations_navigation" CASCADE;
  DROP TABLE IF EXISTS "payload"."site_configurations_footer_columns_links" CASCADE;
  DROP TABLE IF EXISTS "payload"."site_configurations_footer_columns" CASCADE;
  DROP TABLE IF EXISTS "payload"."site_configurations_settings_social" CASCADE;
  DROP TABLE IF EXISTS "payload"."site_configurations_profile_sections" CASCADE;
  ALTER TABLE "payload"."site_configurations" DROP CONSTRAINT IF EXISTS "site_configurations_settings_logo_id_media_id_fk";
  
  DROP INDEX IF EXISTS "payload"."site_configurations_settings_settings_logo_idx";
  ALTER TABLE "payload"."pages" ADD COLUMN "eyebrow" varchar;
  ALTER TABLE "payload"."pages" ADD COLUMN "headline" varchar;
  ALTER TABLE "payload"."pages" ADD COLUMN "introduction" varchar;
  ALTER TABLE "payload"."pages" ADD COLUMN "institutional_statement" varchar;
  ALTER TABLE "payload"."pages" ADD COLUMN "primary_cta_label" varchar;
  ALTER TABLE "payload"."pages" ADD COLUMN "primary_cta_href" varchar;
  ALTER TABLE "payload"."pages" ADD COLUMN "secondary_cta_label" varchar;
  ALTER TABLE "payload"."pages" ADD COLUMN "secondary_cta_href" varchar;
  ALTER TABLE "payload"."site_configurations" DROP COLUMN IF EXISTS "footer_legal_line";
  ALTER TABLE "payload"."site_configurations" DROP COLUMN IF EXISTS "settings_site_name";
  ALTER TABLE "payload"."site_configurations" DROP COLUMN IF EXISTS "settings_tagline";
  ALTER TABLE "payload"."site_configurations" DROP COLUMN IF EXISTS "settings_logo_id";
  ALTER TABLE "payload"."site_configurations" DROP COLUMN IF EXISTS "profile_headline";
  ALTER TABLE "payload"."site_configurations" DROP COLUMN IF EXISTS "profile_summary";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "payload"."site_configurations_navigation_children" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item_label" varchar,
  	"item_href" varchar
  );
  
  CREATE TABLE "payload"."site_configurations_navigation" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item_label" varchar,
  	"item_href" varchar
  );
  
  CREATE TABLE "payload"."site_configurations_footer_columns_links" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"item_label" varchar,
  	"item_href" varchar
  );
  
  CREATE TABLE "payload"."site_configurations_footer_columns" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar
  );
  
  CREATE TABLE "payload"."site_configurations_settings_social" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"network" varchar,
  	"url" varchar
  );
  
  CREATE TABLE "payload"."site_configurations_profile_sections" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"heading" varchar,
  	"body" varchar
  );
  
  ALTER TABLE "payload"."site_configurations" ADD COLUMN "footer_legal_line" varchar;
  ALTER TABLE "payload"."site_configurations" ADD COLUMN "settings_site_name" varchar;
  ALTER TABLE "payload"."site_configurations" ADD COLUMN "settings_tagline" varchar;
  ALTER TABLE "payload"."site_configurations" ADD COLUMN "settings_logo_id" uuid;
  ALTER TABLE "payload"."site_configurations" ADD COLUMN "profile_headline" varchar;
  ALTER TABLE "payload"."site_configurations" ADD COLUMN "profile_summary" varchar;
  ALTER TABLE "payload"."site_configurations_navigation_children" ADD CONSTRAINT "site_configurations_navigation_children_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations_navigation" ADD CONSTRAINT "site_configurations_navigation_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations_footer_columns_links" ADD CONSTRAINT "site_configurations_footer_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations_footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations_footer_columns" ADD CONSTRAINT "site_configurations_footer_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations_settings_social" ADD CONSTRAINT "site_configurations_settings_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations_profile_sections" ADD CONSTRAINT "site_configurations_profile_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "site_configurations_navigation_children_order_idx" ON "payload"."site_configurations_navigation_children" USING btree ("_order");
  CREATE INDEX "site_configurations_navigation_children_parent_id_idx" ON "payload"."site_configurations_navigation_children" USING btree ("_parent_id");
  CREATE INDEX "site_configurations_navigation_order_idx" ON "payload"."site_configurations_navigation" USING btree ("_order");
  CREATE INDEX "site_configurations_navigation_parent_id_idx" ON "payload"."site_configurations_navigation" USING btree ("_parent_id");
  CREATE INDEX "site_configurations_footer_columns_links_order_idx" ON "payload"."site_configurations_footer_columns_links" USING btree ("_order");
  CREATE INDEX "site_configurations_footer_columns_links_parent_id_idx" ON "payload"."site_configurations_footer_columns_links" USING btree ("_parent_id");
  CREATE INDEX "site_configurations_footer_columns_order_idx" ON "payload"."site_configurations_footer_columns" USING btree ("_order");
  CREATE INDEX "site_configurations_footer_columns_parent_id_idx" ON "payload"."site_configurations_footer_columns" USING btree ("_parent_id");
  CREATE INDEX "site_configurations_settings_social_order_idx" ON "payload"."site_configurations_settings_social" USING btree ("_order");
  CREATE INDEX "site_configurations_settings_social_parent_id_idx" ON "payload"."site_configurations_settings_social" USING btree ("_parent_id");
  CREATE INDEX "site_configurations_profile_sections_order_idx" ON "payload"."site_configurations_profile_sections" USING btree ("_order");
  CREATE INDEX "site_configurations_profile_sections_parent_id_idx" ON "payload"."site_configurations_profile_sections" USING btree ("_parent_id");
  ALTER TABLE "payload"."site_configurations" ADD CONSTRAINT "site_configurations_settings_logo_id_media_id_fk" FOREIGN KEY ("settings_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "site_configurations_settings_settings_logo_idx" ON "payload"."site_configurations" USING btree ("settings_logo_id");
  ALTER TABLE "payload"."pages" DROP COLUMN IF EXISTS "eyebrow";
  ALTER TABLE "payload"."pages" DROP COLUMN IF EXISTS "headline";
  ALTER TABLE "payload"."pages" DROP COLUMN IF EXISTS "introduction";
  ALTER TABLE "payload"."pages" DROP COLUMN IF EXISTS "institutional_statement";
  ALTER TABLE "payload"."pages" DROP COLUMN IF EXISTS "primary_cta_label";
  ALTER TABLE "payload"."pages" DROP COLUMN IF EXISTS "primary_cta_href";
  ALTER TABLE "payload"."pages" DROP COLUMN IF EXISTS "secondary_cta_label";
  ALTER TABLE "payload"."pages" DROP COLUMN IF EXISTS "secondary_cta_href";`)
}
