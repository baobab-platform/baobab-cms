import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, FieldAccess } from 'payload';
import { tryResolveContext, type ContextRequest } from '../context/resolve.js';
import { isAuthorized } from './evaluator.js';
import { Capability, EditorialRole, Permission } from './roles.js';

/**
 * Role-based write and publication rules for editorial collections
 * (ADR-0017 §17-23, §26, §72: publishing is distinct from editing).
 *
 * The collection access functions only check tenant and the coarse
 * `content.management` capability. These hooks add the role layer:
 *
 *   create ......................... CREATE
 *   update (draft/unpublished) ..... UPDATE
 *   -> PUBLISHED ................... PUBLISH   (and capability content.publish)
 *   editing a PUBLISHED record ..... PUBLISH   (so an editor cannot change live content)
 *   PUBLISHED -> UNPUBLISHED/DRAFT . UNPUBLISH
 *   -> ARCHIVED .................... ARCHIVE
 *   delete a PUBLISHED record ...... UNPUBLISH first
 *
 * A platform administrator passes. An authenticated actor with no resolvable
 * context, or no editorial roles, passes nothing. The rules default to deny.
 */

export type EditorialState = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';

export interface PublicationChange {
  operation: 'create' | 'update';
  previous?: EditorialState;
  next: EditorialState;
}

/** The permissions a change needs. Empty means none beyond create/update. */
export function requiredPermissions(change: PublicationChange): Permission[] {
  const { operation, previous, next } = change;
  const needed: Permission[] = [operation === 'create' ? Permission.CREATE : Permission.UPDATE];

  if (next === 'PUBLISHED' && previous !== 'PUBLISHED') needed.push(Permission.PUBLISH);
  else if (next === 'PUBLISHED' && previous === 'PUBLISHED') needed.push(Permission.PUBLISH);
  else if (previous === 'PUBLISHED' && (next === 'UNPUBLISHED' || next === 'DRAFT')) needed.push(Permission.UNPUBLISH);

  if (next === 'ARCHIVED' && previous !== 'ARCHIVED') needed.push(Permission.ARCHIVE);
  return needed;
}

interface EditorialUser {
  editorialRoles?: string[] | null;
  capabilities?: string[] | null;
  digitalEstateIds?: string[] | null;
  platformAdministrator?: boolean | null;
}

const relId = (value: unknown): string | undefined => {
  if (typeof value === 'object' && value !== null) {
    const id = (value as { id?: unknown }).id;
    return id === undefined ? undefined : String(id);
  }
  return value === undefined || value === null ? undefined : String(value);
};

export class PublicationDeniedError extends Error {
  readonly status = 403;
  constructor(permission: string) {
    super(`Not permitted: this change needs the "${permission}" permission.`);
    this.name = 'PublicationDeniedError';
  }
}

function assertPermitted(req: unknown, permissions: Permission[], estateId: string | undefined): void {
  const r = req as ContextRequest & { user?: EditorialUser | null };
  const context = tryResolveContext(r);
  if (!context) throw new PublicationDeniedError(permissions[0]);
  if (context.isPlatformAdmin) return;

  const user = r.user as EditorialUser;
  const roles = (user.editorialRoles ?? []).filter((role): role is EditorialRole =>
    (Object.values(EditorialRole) as string[]).includes(role),
  );

  for (const permission of permissions) {
    const allowed = isAuthorized({
      context,
      roles,
      permission,
      resourceDigitalEstateId: estateId,
      actorDigitalEstateIds: user.digitalEstateIds ?? undefined,
    });
    if (!allowed) throw new PublicationDeniedError(permission);
    if (permission === Permission.PUBLISH && !(user.capabilities ?? []).includes(Capability.CONTENT_PUBLISH)) {
      throw new PublicationDeniedError('publish (capability content.publish)');
    }
  }
}

const STATES: EditorialState[] = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'];
const asState = (value: unknown): EditorialState | undefined =>
  STATES.includes(value as EditorialState) ? (value as EditorialState) : undefined;

export const publicationGuardBeforeChange: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  if (operation !== 'create' && operation !== 'update') return data;
  const previous = operation === 'update' ? asState(originalDoc?.publicationState) : undefined;
  const next = asState(data?.publicationState) ?? previous ?? 'DRAFT';
  const estate = relId(data?.digitalEstate) ?? relId(originalDoc?.digitalEstate);
  assertPermitted(req, requiredPermissions({ operation, previous, next }), estate);
  return data;
};

export const publicationGuardBeforeDelete: CollectionBeforeDeleteHook = async ({ id, req, collection }) => {
  const doc = await req.payload.findByID({
    collection: collection.slug as never,
    id,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const state = asState((doc as { publicationState?: unknown } | null)?.publicationState);
  const estate = relId((doc as { digitalEstate?: unknown } | null)?.digitalEstate);
  const needed: Permission[] = [Permission.DELETE];
  if (state === 'PUBLISHED') needed.push(Permission.UNPUBLISH);
  assertPermitted(req, needed, estate);
};

/**
 * Field access for identity and entitlement fields on a user. Only a platform
 * administrator may change them, so no editor can raise their own roles,
 * capabilities or tenant binding. SSO provisioning and seed scripts use
 * overrideAccess and are unaffected.
 */
export const platformAdministratorOnlyField: FieldAccess = ({ req }) => req.user?.platformAdministrator === true;
