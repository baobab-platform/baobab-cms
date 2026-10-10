import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "payload"."enum_portfolio_companies_content_scope" AS ENUM('PLATFORM', 'TENANT', 'LEGAL_ENTITY', 'DIGITAL_ESTATE', 'MARKET', 'LOCALE');
  CREATE TYPE "payload"."enum_portfolio_companies_publication_state" AS ENUM('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');
  CREATE TYPE "payload"."enum_portfolio_companies_visibility" AS ENUM('public', 'registered', 'client', 'premium', 'board');
  CREATE TYPE "payload"."enum_portfolio_companies_status" AS ENUM('active', 'dormant', 'exited');
  CREATE TYPE "payload"."enum_sectors_content_scope" AS ENUM('PLATFORM', 'TENANT', 'LEGAL_ENTITY', 'DIGITAL_ESTATE', 'MARKET', 'LOCALE');
  CREATE TYPE "payload"."enum_sectors_publication_state" AS ENUM('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');
  CREATE TYPE "payload"."enum_sectors_visibility" AS ENUM('public', 'registered', 'client', 'premium', 'board');
  CREATE TYPE "payload"."enum_insights_content_scope" AS ENUM('PLATFORM', 'TENANT', 'LEGAL_ENTITY', 'DIGITAL_ESTATE', 'MARKET', 'LOCALE');
  CREATE TYPE "payload"."enum_insights_publication_state" AS ENUM('DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED');
  CREATE TYPE "payload"."enum_insights_visibility" AS ENUM('public', 'registered', 'client', 'premium', 'board');
  CREATE TYPE "payload"."enum_insights_content_type" AS ENUM('insight', 'research-note', 'market-brief', 'sector-outlook', 'trade-intelligence', 'investment-thesis', 'regulatory-alert', 'white-paper', 'annual-review', 'press-release');
  CREATE TABLE "payload"."portfolio_companies" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_entity_id" varchar,
  	"tenant_id" uuid NOT NULL,
  	"organisation_id" uuid NOT NULL,
  	"digital_estate_id" uuid,
  	"market_id" uuid,
  	"locale" varchar,
  	"content_scope" "payload"."enum_portfolio_companies_content_scope" DEFAULT 'TENANT' NOT NULL,
  	"content_key" varchar,
  	"slug" varchar NOT NULL,
  	"publication_state" "payload"."enum_portfolio_companies_publication_state" DEFAULT 'DRAFT' NOT NULL,
  	"effective_from" timestamp(3) with time zone,
  	"effective_to" timestamp(3) with time zone,
  	"visibility" "payload"."enum_portfolio_companies_visibility" DEFAULT 'public' NOT NULL,
  	"name" varchar NOT NULL,
  	"legal_name" varchar,
  	"strapline" varchar,
  	"summary" varchar NOT NULL,
  	"description" varchar,
  	"sector" varchar,
  	"markets" varchar,
  	"website" varchar,
  	"logo_id" uuid,
  	"hero_media_id" uuid,
  	"investment_thesis" varchar,
  	"strategic_role" varchar,
  	"status" "payload"."enum_portfolio_companies_status" DEFAULT 'active',
  	"subject_organisation_id" varchar,
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
  
  CREATE TABLE "payload"."sectors" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_entity_id" varchar,
  	"tenant_id" uuid NOT NULL,
  	"organisation_id" uuid NOT NULL,
  	"digital_estate_id" uuid,
  	"market_id" uuid,
  	"locale" varchar,
  	"content_scope" "payload"."enum_sectors_content_scope" DEFAULT 'TENANT' NOT NULL,
  	"content_key" varchar,
  	"slug" varchar NOT NULL,
  	"publication_state" "payload"."enum_sectors_publication_state" DEFAULT 'DRAFT' NOT NULL,
  	"effective_from" timestamp(3) with time zone,
  	"effective_to" timestamp(3) with time zone,
  	"visibility" "payload"."enum_sectors_visibility" DEFAULT 'public' NOT NULL,
  	"name" varchar NOT NULL,
  	"summary" varchar NOT NULL,
  	"description" varchar,
  	"hero_media_id" uuid,
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
  
  CREATE TABLE "payload"."insights_authors" (
  	"_order" integer NOT NULL,
  	"_parent_id" uuid NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar NOT NULL,
  	"title" varchar,
  	"avatar_id" uuid
  );
  
  CREATE TABLE "payload"."insights" (
  	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  	"canonical_entity_id" varchar,
  	"tenant_id" uuid NOT NULL,
  	"organisation_id" uuid NOT NULL,
  	"digital_estate_id" uuid,
  	"market_id" uuid,
  	"locale" varchar,
  	"content_scope" "payload"."enum_insights_content_scope" DEFAULT 'TENANT' NOT NULL,
  	"content_key" varchar,
  	"slug" varchar NOT NULL,
  	"publication_state" "payload"."enum_insights_publication_state" DEFAULT 'DRAFT' NOT NULL,
  	"effective_from" timestamp(3) with time zone,
  	"effective_to" timestamp(3) with time zone,
  	"visibility" "payload"."enum_insights_visibility" DEFAULT 'public' NOT NULL,
  	"title" varchar NOT NULL,
  	"excerpt" varchar,
  	"body" jsonb NOT NULL,
  	"content_type" "payload"."enum_insights_content_type" DEFAULT 'insight' NOT NULL,
  	"published_at" timestamp(3) with time zone NOT NULL,
  	"hero_media_id" uuid,
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
  
  CREATE TABLE "payload"."insights_texts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer NOT NULL,
  	"parent_id" uuid NOT NULL,
  	"path" varchar NOT NULL,
  	"text" varchar
  );
  
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "portfolio_companies_id" uuid;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "sectors_id" uuid;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD COLUMN "insights_id" uuid;
  ALTER TABLE "payload"."portfolio_companies" ADD CONSTRAINT "portfolio_companies_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "payload"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."portfolio_companies" ADD CONSTRAINT "portfolio_companies_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "payload"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."portfolio_companies" ADD CONSTRAINT "portfolio_companies_digital_estate_id_digital_estates_id_fk" FOREIGN KEY ("digital_estate_id") REFERENCES "payload"."digital_estates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."portfolio_companies" ADD CONSTRAINT "portfolio_companies_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "payload"."markets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."portfolio_companies" ADD CONSTRAINT "portfolio_companies_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."portfolio_companies" ADD CONSTRAINT "portfolio_companies_hero_media_id_media_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."portfolio_companies" ADD CONSTRAINT "portfolio_companies_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."sectors" ADD CONSTRAINT "sectors_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "payload"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."sectors" ADD CONSTRAINT "sectors_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "payload"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."sectors" ADD CONSTRAINT "sectors_digital_estate_id_digital_estates_id_fk" FOREIGN KEY ("digital_estate_id") REFERENCES "payload"."digital_estates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."sectors" ADD CONSTRAINT "sectors_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "payload"."markets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."sectors" ADD CONSTRAINT "sectors_hero_media_id_media_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."sectors" ADD CONSTRAINT "sectors_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."insights_authors" ADD CONSTRAINT "insights_authors_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."insights_authors" ADD CONSTRAINT "insights_authors_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "payload"."insights"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."insights" ADD CONSTRAINT "insights_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "payload"."tenants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."insights" ADD CONSTRAINT "insights_organisation_id_organisations_id_fk" FOREIGN KEY ("organisation_id") REFERENCES "payload"."organisations"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."insights" ADD CONSTRAINT "insights_digital_estate_id_digital_estates_id_fk" FOREIGN KEY ("digital_estate_id") REFERENCES "payload"."digital_estates"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."insights" ADD CONSTRAINT "insights_market_id_markets_id_fk" FOREIGN KEY ("market_id") REFERENCES "payload"."markets"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."insights" ADD CONSTRAINT "insights_hero_media_id_media_id_fk" FOREIGN KEY ("hero_media_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."insights" ADD CONSTRAINT "insights_seo_open_graph_image_id_media_id_fk" FOREIGN KEY ("seo_open_graph_image_id") REFERENCES "payload"."media"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload"."insights_texts" ADD CONSTRAINT "insights_texts_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "payload"."insights"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "portfolio_companies_canonical_entity_id_idx" ON "payload"."portfolio_companies" USING btree ("canonical_entity_id");
  CREATE INDEX "portfolio_companies_tenant_idx" ON "payload"."portfolio_companies" USING btree ("tenant_id");
  CREATE INDEX "portfolio_companies_organisation_idx" ON "payload"."portfolio_companies" USING btree ("organisation_id");
  CREATE INDEX "portfolio_companies_digital_estate_idx" ON "payload"."portfolio_companies" USING btree ("digital_estate_id");
  CREATE INDEX "portfolio_companies_market_idx" ON "payload"."portfolio_companies" USING btree ("market_id");
  CREATE INDEX "portfolio_companies_locale_idx" ON "payload"."portfolio_companies" USING btree ("locale");
  CREATE INDEX "portfolio_companies_content_scope_idx" ON "payload"."portfolio_companies" USING btree ("content_scope");
  CREATE INDEX "portfolio_companies_content_key_idx" ON "payload"."portfolio_companies" USING btree ("content_key");
  CREATE INDEX "portfolio_companies_slug_idx" ON "payload"."portfolio_companies" USING btree ("slug");
  CREATE INDEX "portfolio_companies_publication_state_idx" ON "payload"."portfolio_companies" USING btree ("publication_state");
  CREATE INDEX "portfolio_companies_logo_idx" ON "payload"."portfolio_companies" USING btree ("logo_id");
  CREATE INDEX "portfolio_companies_hero_media_idx" ON "payload"."portfolio_companies" USING btree ("hero_media_id");
  CREATE INDEX "portfolio_companies_subject_organisation_id_idx" ON "payload"."portfolio_companies" USING btree ("subject_organisation_id");
  CREATE INDEX "portfolio_companies_seo_seo_open_graph_image_idx" ON "payload"."portfolio_companies" USING btree ("seo_open_graph_image_id");
  CREATE INDEX "portfolio_companies_updated_at_idx" ON "payload"."portfolio_companies" USING btree ("updated_at");
  CREATE INDEX "portfolio_companies_created_at_idx" ON "payload"."portfolio_companies" USING btree ("created_at");
  CREATE UNIQUE INDEX "sectors_canonical_entity_id_idx" ON "payload"."sectors" USING btree ("canonical_entity_id");
  CREATE INDEX "sectors_tenant_idx" ON "payload"."sectors" USING btree ("tenant_id");
  CREATE INDEX "sectors_organisation_idx" ON "payload"."sectors" USING btree ("organisation_id");
  CREATE INDEX "sectors_digital_estate_idx" ON "payload"."sectors" USING btree ("digital_estate_id");
  CREATE INDEX "sectors_market_idx" ON "payload"."sectors" USING btree ("market_id");
  CREATE INDEX "sectors_locale_idx" ON "payload"."sectors" USING btree ("locale");
  CREATE INDEX "sectors_content_scope_idx" ON "payload"."sectors" USING btree ("content_scope");
  CREATE INDEX "sectors_content_key_idx" ON "payload"."sectors" USING btree ("content_key");
  CREATE INDEX "sectors_slug_idx" ON "payload"."sectors" USING btree ("slug");
  CREATE INDEX "sectors_publication_state_idx" ON "payload"."sectors" USING btree ("publication_state");
  CREATE INDEX "sectors_hero_media_idx" ON "payload"."sectors" USING btree ("hero_media_id");
  CREATE INDEX "sectors_seo_seo_open_graph_image_idx" ON "payload"."sectors" USING btree ("seo_open_graph_image_id");
  CREATE INDEX "sectors_updated_at_idx" ON "payload"."sectors" USING btree ("updated_at");
  CREATE INDEX "sectors_created_at_idx" ON "payload"."sectors" USING btree ("created_at");
  CREATE INDEX "insights_authors_order_idx" ON "payload"."insights_authors" USING btree ("_order");
  CREATE INDEX "insights_authors_parent_id_idx" ON "payload"."insights_authors" USING btree ("_parent_id");
  CREATE INDEX "insights_authors_avatar_idx" ON "payload"."insights_authors" USING btree ("avatar_id");
  CREATE UNIQUE INDEX "insights_canonical_entity_id_idx" ON "payload"."insights" USING btree ("canonical_entity_id");
  CREATE INDEX "insights_tenant_idx" ON "payload"."insights" USING btree ("tenant_id");
  CREATE INDEX "insights_organisation_idx" ON "payload"."insights" USING btree ("organisation_id");
  CREATE INDEX "insights_digital_estate_idx" ON "payload"."insights" USING btree ("digital_estate_id");
  CREATE INDEX "insights_market_idx" ON "payload"."insights" USING btree ("market_id");
  CREATE INDEX "insights_locale_idx" ON "payload"."insights" USING btree ("locale");
  CREATE INDEX "insights_content_scope_idx" ON "payload"."insights" USING btree ("content_scope");
  CREATE INDEX "insights_content_key_idx" ON "payload"."insights" USING btree ("content_key");
  CREATE INDEX "insights_slug_idx" ON "payload"."insights" USING btree ("slug");
  CREATE INDEX "insights_publication_state_idx" ON "payload"."insights" USING btree ("publication_state");
  CREATE INDEX "insights_published_at_idx" ON "payload"."insights" USING btree ("published_at");
  CREATE INDEX "insights_hero_media_idx" ON "payload"."insights" USING btree ("hero_media_id");
  CREATE INDEX "insights_seo_seo_open_graph_image_idx" ON "payload"."insights" USING btree ("seo_open_graph_image_id");
  CREATE INDEX "insights_updated_at_idx" ON "payload"."insights" USING btree ("updated_at");
  CREATE INDEX "insights_created_at_idx" ON "payload"."insights" USING btree ("created_at");
  CREATE INDEX "insights_texts_order_parent" ON "payload"."insights_texts" USING btree ("order","parent_id");
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_portfolio_companies_fk" FOREIGN KEY ("portfolio_companies_id") REFERENCES "payload"."portfolio_companies"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sectors_fk" FOREIGN KEY ("sectors_id") REFERENCES "payload"."sectors"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload"."payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_insights_fk" FOREIGN KEY ("insights_id") REFERENCES "payload"."insights"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_portfolio_companies_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("portfolio_companies_id");
  CREATE INDEX "payload_locked_documents_rels_sectors_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("sectors_id");
  CREATE INDEX "payload_locked_documents_rels_insights_id_idx" ON "payload"."payload_locked_documents_rels" USING btree ("insights_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload"."portfolio_companies" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."sectors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."insights_authors" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."insights" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload"."insights_texts" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "payload"."portfolio_companies" CASCADE;
  DROP TABLE "payload"."sectors" CASCADE;
  DROP TABLE "payload"."insights_authors" CASCADE;
  DROP TABLE "payload"."insights" CASCADE;
  DROP TABLE "payload"."insights_texts" CASCADE;
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_portfolio_companies_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_sectors_fk";
  
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_insights_fk";
  
  DROP INDEX "payload"."payload_locked_documents_rels_portfolio_companies_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_sectors_id_idx";
  DROP INDEX "payload"."payload_locked_documents_rels_insights_id_idx";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "portfolio_companies_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "sectors_id";
  ALTER TABLE "payload"."payload_locked_documents_rels" DROP COLUMN "insights_id";
  DROP TYPE "payload"."enum_portfolio_companies_content_scope";
  DROP TYPE "payload"."enum_portfolio_companies_publication_state";
  DROP TYPE "payload"."enum_portfolio_companies_visibility";
  DROP TYPE "payload"."enum_portfolio_companies_status";
  DROP TYPE "payload"."enum_sectors_content_scope";
  DROP TYPE "payload"."enum_sectors_publication_state";
  DROP TYPE "payload"."enum_sectors_visibility";
  DROP TYPE "payload"."enum_insights_content_scope";
  DROP TYPE "payload"."enum_insights_publication_state";
  DROP TYPE "payload"."enum_insights_visibility";
  DROP TYPE "payload"."enum_insights_content_type";`)
}
