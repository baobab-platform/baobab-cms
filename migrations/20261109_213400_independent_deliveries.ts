import type { MigrateUpArgs, MigrateDownArgs } from '@payloadcms/db-postgres';
import { sql } from '@payloadcms/db-postgres';

/**
 * ADR-0018: the Payload outbox is canonical broker delivery only.
 * Estate deliveries have their own durable acknowledgement/lease state.
 * cms_delivery is a deliberately separate SQL-managed operational schema;
 * its tables are not Payload content collections or an authoritative CP registry.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    CREATE SCHEMA IF NOT EXISTS cms_delivery;

    CREATE TABLE cms_delivery.bindings (
      destination_key varchar(160) PRIMARY KEY,
      tenant_id varchar(160) NOT NULL,
      digital_estate_id varchar(160) NOT NULL,
      endpoint_url varchar(2048) NOT NULL,
      adapter varchar(40) NOT NULL DEFAULT 'SIGNED_WEBHOOK'
        CHECK (adapter IN ('SIGNED_WEBHOOK', 'NABHOLD_LEGACY')),
      enabled boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT binding_identity_nonempty CHECK (
        length(trim(destination_key)) > 0
        AND length(trim(tenant_id)) > 0
        AND length(trim(digital_estate_id)) > 0
        AND length(trim(endpoint_url)) > 0
      )
    );
    CREATE INDEX cms_delivery_bindings_context_idx
      ON cms_delivery.bindings (tenant_id, digital_estate_id, enabled);

    CREATE FUNCTION cms_delivery.prevent_binding_reassignment() RETURNS trigger
    LANGUAGE plpgsql AS $baobab_receipt$
    BEGIN
      IF NEW.destination_key IS DISTINCT FROM OLD.destination_key
         OR NEW.tenant_id IS DISTINCT FROM OLD.tenant_id
         OR NEW.digital_estate_id IS DISTINCT FROM OLD.digital_estate_id
         OR NEW.endpoint_url IS DISTINCT FROM OLD.endpoint_url
         OR NEW.adapter IS DISTINCT FROM OLD.adapter THEN
        RAISE EXCEPTION 'ADR-0018: delivery binding identity is immutable; register a new destination';
      END IF;
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $baobab_receipt$;
    CREATE TRIGGER cms_delivery_binding_immutable
      BEFORE UPDATE ON cms_delivery.bindings
      FOR EACH ROW EXECUTE FUNCTION cms_delivery.prevent_binding_reassignment();

    CREATE TABLE cms_delivery.receipts (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id varchar NOT NULL REFERENCES payload.outbox(event_id) ON DELETE RESTRICT,
      destination_key varchar(160) NOT NULL REFERENCES cms_delivery.bindings(destination_key) ON DELETE RESTRICT,
      tenant_id varchar(160) NOT NULL,
      digital_estate_id varchar(160) NOT NULL,
      status varchar(32) NOT NULL DEFAULT 'PENDING'
        CHECK (status IN ('PENDING', 'PUBLISHING', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'DELIVERED')),
      claim_token uuid,
      lease_until timestamptz,
      attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
      next_attempt_at timestamptz,
      acknowledged_at timestamptz,
      acknowledgment_kind varchar(48),
      acknowledgment_code integer,
      acknowledgment_reference varchar(160),
      last_error varchar(400),
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT cms_delivery_receipts_event_destination_uidx UNIQUE (event_id, destination_key),
      CONSTRAINT cms_delivery_receipts_lease_shape CHECK (
        (status = 'PUBLISHING' AND claim_token IS NOT NULL AND lease_until IS NOT NULL)
        OR (status <> 'PUBLISHING' AND claim_token IS NULL AND lease_until IS NULL)
      )
    );
    CREATE INDEX cms_delivery_receipts_due_idx
      ON cms_delivery.receipts (destination_key, status, next_attempt_at, lease_until, created_at);
    CREATE INDEX cms_delivery_receipts_tenant_idx
      ON cms_delivery.receipts (tenant_id, digital_estate_id);

    CREATE FUNCTION cms_delivery.capture_content_event() RETURNS trigger
    LANGUAGE plpgsql AS $$
    BEGIN
      -- The event is committed with each destination's PENDING receipt.
      -- Never manufacture a destination from a tenant display name.
      IF NEW.event_type LIKE 'content.%'
         AND EXISTS (
           SELECT 1 FROM cms_delivery.bindings b WHERE b.enabled
             AND b.tenant_id = NEW.tenant
             AND b.digital_estate_id = NEW.envelope->>'digitalEstateId'
         ) THEN
        IF NEW.tenant IS NULL OR NEW.event_id IS DISTINCT FROM NEW.envelope->>'eventId'
           OR NEW.tenant IS DISTINCT FROM NEW.envelope->>'tenantId' THEN
          RAISE EXCEPTION 'ADR-0018: invalid canonical outbox event context';
        END IF;
        INSERT INTO cms_delivery.receipts (
          event_id, destination_key, tenant_id, digital_estate_id, status
        )
        SELECT NEW.event_id, b.destination_key, b.tenant_id, b.digital_estate_id, 'PENDING'
        FROM cms_delivery.bindings b
        WHERE b.enabled
          AND b.tenant_id = NEW.tenant
          AND b.digital_estate_id = NEW.envelope->>'digitalEstateId'
        ON CONFLICT (event_id, destination_key) DO NOTHING;
      END IF;
      RETURN NEW;
    END;
    $$;
    CREATE TRIGGER cms_delivery_content_outbox_insert
      AFTER INSERT ON payload.outbox
      FOR EACH ROW EXECUTE FUNCTION cms_delivery.capture_content_event();

    CREATE FUNCTION cms_delivery.prevent_canonical_event_mutation() RETURNS trigger
    LANGUAGE plpgsql AS $baobab_receipt$
    BEGIN
      IF NEW.event_id IS DISTINCT FROM OLD.event_id
         OR NEW.tenant IS DISTINCT FROM OLD.tenant
         OR NEW.event_type IS DISTINCT FROM OLD.event_type
         OR NEW.canonical_entity_id IS DISTINCT FROM OLD.canonical_entity_id
         OR NEW.envelope IS DISTINCT FROM OLD.envelope THEN
        RAISE EXCEPTION 'ADR-0018: immutable canonical event identity and payload cannot be rewritten';
      END IF;
      RETURN NEW;
    END;
    $baobab_receipt$;
    CREATE TRIGGER cms_delivery_outbox_event_immutable
      BEFORE UPDATE ON payload.outbox
      FOR EACH ROW EXECUTE FUNCTION cms_delivery.prevent_canonical_event_mutation();
  `);
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP TRIGGER IF EXISTS cms_delivery_outbox_event_immutable ON payload.outbox;
    DROP FUNCTION IF EXISTS cms_delivery.prevent_canonical_event_mutation();
    DROP TRIGGER IF EXISTS cms_delivery_content_outbox_insert ON payload.outbox;
    DROP FUNCTION IF EXISTS cms_delivery.capture_content_event();
    DROP TABLE IF EXISTS cms_delivery.receipts;
    DROP TRIGGER IF EXISTS cms_delivery_binding_immutable ON cms_delivery.bindings;
    DROP FUNCTION IF EXISTS cms_delivery.prevent_binding_reassignment();
    DROP TABLE IF EXISTS cms_delivery.bindings;
    DROP SCHEMA IF EXISTS cms_delivery;
  `);
}
