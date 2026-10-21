import type { Field } from 'payload';
import { issueCanonicalEntityId } from './canonical.js';

/**
 * The canonical identity field every canonicalisable collection carries
 * (ADR-0013 §5, §30). Server-assigned once on create, immutable afterwards
 * — a Payload ID, slug or title change never touches this value. CP-owned
 * projections leave this unresolved until an issued value is supplied; only
 * CMS-owned content identities may be minted here.
 */
export function canonicalIdField(params: { name?: string; entityType: string; authority?: 'cms' | 'control-plane' }): Field {
  const issue = () => params.authority === 'control-plane' ? undefined : issueCanonicalEntityId();
  return {
    name: params.name ?? 'canonicalEntityId',
    type: 'text',
    unique: true,
    index: true,
    admin: {
      position: 'sidebar',
      readOnly: true,
      description: `Canonical ${params.entityType} identity (ADR-0013). Immutable once assigned; independent of the Payload id, slug and title.`,
    },
    access: {
      update: () => false,
    },
    hooks: {
      beforeChange: [
        ({ value, operation, originalDoc }) => {
          if (operation === 'create') {
            return value || issue();
          }
          // Immutable on update — always keep the originally assigned value.
          return originalDoc?.[params.name ?? 'canonicalEntityId'] ?? value ?? issue();
        },
      ],
    },
  };
}
