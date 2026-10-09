import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_site_configurations_content_scope" AS ENUM('PLATFORM', 'TENANT', 'LEGAL_ENTITY', 'DIGITAL_ESTATE', 'MARKET', 'LOCALE');
  CREATE TYPE "payload"."enum_site_configurations_publication_state" AS ENUM('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');
  CREATE TYPE "payload"."enum_site_configurations_visibility" AS ENUM('public', 'registered', 'client', 'premium', 'board');
  CREATE TYPE "payload"."enum_site_configurations_kind" AS ENUM('navigation', 'footer', 'site-settings', 'group-profile');
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
  
  CREATE TABLE "payload"."site_configurations" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_entity_id" varchar,
  	"tenant_id" uuid NOT NULL,
  	"organisation_id" uuid NOT NULL,
  	"digital_estate_id" uuid,
  	"market_id" uuid,
  	"locale" varchar,
  	"content_scope" "payload"."enum_site_configurations_content_scope" DEFAULT 'TENANT' NOT NULL,
  	"content_key" varchar,
  	"slug" varchar NOT NULL,
  	"publication_state" "payload"."enum_site_configurations_publication_state" DEFAULT 'DRAFT' NOT NULL,
  	"effective_from" timestamp(3) with time zone,
  	"effective_to" timestamp(3) with time zone,
  	"visibility" "payload"."enum_site_configurations_visibility" DEFAULT 'public' NOT NULL,
  	"title" varchar NOT NULL,
  	"kind" "payload"."enum_site_configurations_kind" NOT NULL,
  	"footer_legal_line" varchar,
  	"settings_site_name" varchar,
  	"settings_tagline" varchar,
  	"settings_logo_id" uuid,
  	"profile_headline" varchar,
  	"profile_summary" varchar,
  	"seo_title" varchar,
  	"seo_description" varchar,
  	"seo_open_graph_title" varchar,
  	"seo_open_graph_description" varchar,
  	"seo_open_graph_image_id" uuid,
  	"seo_canonical_override" varchar,
  	"seo_robots_index" boolean DEFAULT true,
  	"seo_robots_follow" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "site_configurations_id" uuid;
  ALTER TABLE "payload"."site_configurations_navigation_children" ADD CONSTRAINT "site_configurations_navigation_children_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations_navigation"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations_navigation" ADD CONSTRAINT "site_configurations_navigation_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations_footer_columns_links" ADD CONSTRAINT "site_configurations_footer_columns_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations_footer_columns"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations_footer_columns" ADD CONSTRAINT "site_configurations_footer_columns_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations_settings_social" ADD CONSTRAINT "site_configurations_settings_social_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations_profile_sections" ADD CONSTRAINT "site_configurations_profile_sections_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."site_configurations"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations" ADD CONSTRAINT "site_configurations_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "payload"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations" ADD CONSTRAINT "site_configurations_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "payload"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations" ADD CONSTRAINT "site_configurations_digital_estate_id_digital_estates_id_fk" FOREIGN KEY ("digital_estate_id") REFERENCES "payload"."digital_estates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations" ADD CONSTRAINT "site_configurations_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "payload"."markets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations" ADD CONSTRAINT "site_configurations_settings_logo_id_media_id_fk" FOREIGN KEY ("settings_logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."site_configurations" ADD CONSTRAINT "site_configurations_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
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
  CREATE UNIQUE INDEX "site_configurations_canonical_entity_id_idx" ON "payload"."site_configurations" USING btree ("canonical_entity_id");
  CREATE INDEX "site_configurations_tenant_idx" ON "payload"."site_configurations" USING btree ("tenant_id");
  CREATE INDEX "site_configurations_organisation_idx" ON "payload"."site_configurations" USING btree ("organisation_id");
  CREATE INDEX "site_configurations_digital_estate_idx" ON "payload"."site_configurations" USING btree ("digital_estate_id");
  CREATE INDEX "site_configurations_market_idx" ON "payload"."site_configurations" USING btree ("market_id");
  CREATE INDEX "site_configurations_locale_idx" ON "payload"."site_configurations" USING btree ("locale");
  CREATE INDEX "site_configurations_content_scope_idx" ON "payload"."site_configurations" USING btree ("content_scope");
  CREATE INDEX "site_configurations_content_key_idx" ON "payload"."site_configurations" USING btree ("content_key");
  CREATE INDEX "site_configurations_slug_idx" ON "payload"."site_configurations" USING btree ("slug");
  CREATE INDEX "site_configurations_publication_state_idx" ON "payload"."site_configurations" USING btree ("publication_state");
  CREATE INDEX "site_configurations_kind_idx" ON "payload"."site_configurations" USING btree ("kind");
  CREATE INDEX "site_configurations_settings_settings_logo_idx" ON "payload"."site_configurations" USING btree ("settings_logo_id");
  CREATE INDEX "site_configurations_seo_seo_open_graph_image_idx" ON "payload"."site_configurations" USING btree ("seo_open_graph_image_id");
  CREATE INDEX "site_configurations_updated_at_idx" ON "payload"."site_configurations" USING btree ("updated_at");
  CREATE INDEX "site_configurations_created_at_idx" ON "payload"."site_configurations" USING btree ("created_at");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_site_configurations_fk" FOREIGN KEY ("site_configurations_id") REFERENCES "payload"."site_configurations"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_site_configurations_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("site_configurations_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."site_configurations_navigation_children" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_configurations_navigation" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_configurations_footer_columns_links" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_configurations_footer_columns" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_configurations_settings_social" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_configurations_profile_sections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."site_configurations" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."site_configurations_navigation_children" CASCADE;
  DROP TABLE "payload"."site_configurations_navigation" CASCADE;
  DROP TABLE "payload"."site_configurations_footer_columns_links" CASCADE;
  DROP TABLE "payload"."site_configurations_footer_columns" CASCADE;
  DROP TABLE "payload"."site_configurations_settings_social" CASCADE;
  DROP TABLE "payload"."site_configurations_profile_sections" CASCADE;
  DROP TABLE "payload"."site_configurations" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_site_configurations_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_site_configurations_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "site_configurations_id";
  DROP TYPE "payload"."enum_site_configurations_content_scope";
  DROP TYPE "payload"."enum_site_configurations_publication_state";
  DROP TYPE "payload"."enum_site_configurations_visibility";
  DROP TYPE "payload"."enum_site_configurations_kind";`)
}
