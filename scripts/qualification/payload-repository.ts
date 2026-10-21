/** Payload Local API adapter for the onboarding/seed repository ports.
 * Trusted qualification code only: reads bypass access control and writes use
 * the explicit system actor, but every write still runs the collection hooks.
 */
import { type CollectionSlug, type Payload, type Where } from 'payload';
import { SYSTEM_ACTOR } from '../../src/baobab/context/system-actor.js';
import type { ProjectionRepository } from '../../src/baobab/onboarding/nabhold.js';
import type { ContentSeedRepository } from '../../src/baobab/onboarding/nabhold-content.js';

export type Row = Record<string, unknown> & { id: string };

export function payloadRepository(payload: Payload) {
  const find = async (collection: string, where: Where, limit: number) =>
    (await payload.find({ collection: collection as CollectionSlug, where, limit, depth: 0, overrideAccess: true })).docs as unknown as Row[];
  const repo: ProjectionRepository & ContentSeedRepository = {
    find: (collection, field, value, limit) => find(collection, { [field]: { equals: value } }, limit),
    findScoped: (collection, tenant, contentKey, kind, scope) => find(collection, { and: [
      { tenant: { equals: tenant } }, { contentKey: { equals: contentKey } }, ...(scope ? [{ digitalEstate: { equals: scope.digitalEstateId } }, { locale: { equals: scope.locale } }] : []), ...(kind ? [{ kind: { equals: kind } }] : []),
    ] }, 3),
    create: async (collection, data) => await payload.create({ collection: collection as CollectionSlug,
      data: data as never, user: SYSTEM_ACTOR as never, overrideAccess: true }) as unknown as Row,
    update: async (collection, id, data) => await payload.update({ collection: collection as CollectionSlug,
      id, data: data as never, user: SYSTEM_ACTOR as never, overrideAccess: true }) as unknown as Row,
  };
  return { find, repo };
}
