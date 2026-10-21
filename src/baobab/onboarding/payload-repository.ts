import type { CollectionSlug, Payload, Where } from 'payload';
import { SYSTEM_ACTOR } from '../context/system-actor.js';
import type { ContentSeedRepository } from './nabhold-content.js';

type Row = Record<string, unknown> & { id: string };
/** Trusted local provisioning adapter. No HTTP route exposes this port. The
 * profile reconciler enforces ownership; real collection/outbox hooks still run
 * under the existing explicit system context. It creates no persisted actor. */
export function createPayloadEstateRepository(payload: Payload): ContentSeedRepository {
  const find = async (collection: string, where: Where, limit: number) =>
    (await payload.find({ collection: collection as CollectionSlug, where, limit, depth: 0, overrideAccess: true })).docs as unknown as Row[];
  return {
    find: (collection, field, value, limit) => find(collection, { [field]: { equals: value } }, limit),
    findScoped: (collection, tenant, contentKey, kind, scope) => find(collection, { and: [
      { tenant: { equals: tenant } }, { contentKey: { equals: contentKey } },
      ...(scope ? [{ digitalEstate: { equals: scope.digitalEstateId } }, { locale: { equals: scope.locale } }] : []),
      ...(kind ? [{ kind: { equals: kind } }] : []),
    ] }, 3),
    create: async (collection, data) => await payload.create({ collection: collection as CollectionSlug,
      data: data as never, user: SYSTEM_ACTOR as never, overrideAccess: true }) as unknown as Row,
    update: async (collection, id, data) => await payload.update({ collection: collection as CollectionSlug,
      id, data: data as never, user: SYSTEM_ACTOR as never, overrideAccess: true }) as unknown as Row,
  };
}
