import type { BaobabContext } from '../context/types.js';
import { DEFAULT_ROLE_PERMISSIONS, type EditorialRole, type Permission } from './roles.js';

export interface AuthorizationRequest {
  context: BaobabContext;
  roles: EditorialRole[];
  permission: Permission;
  /** The resource's tenant owner, when checking a specific resource. */
  resourceTenantId?: string;
  /** The resource's digital-estate scope, when checking a specific resource. */
  resourceDigitalEstateId?: string;
  /** Digital estates this actor is authorized for; empty/undefined = unrestricted within tenant. */
  actorDigitalEstateIds?: string[];
  rolePermissions?: Record<EditorialRole, Permission[]>;
}

/**
 * Default-deny authorization evaluator (ADR-0017 §29-30, §428
 * "actor + resource + operation + context", never role name alone).
 *
 * Every branch that is not an explicit `true` returns `false` — there is
 * no fallback "if unsure, allow" path.
 */
export function isAuthorized(request: AuthorizationRequest): boolean {
  const { context } = request;

  if (context.isPlatformAdmin) return true;
  if (context.kind !== 'tenant') return false;

  if (request.resourceTenantId && request.resourceTenantId !== context.tenantId) {
    return false;
  }

  // An absent or empty estate grant does not imply all estates within a tenant.
  // Explicit estate-scoped operations require a matching actor binding.
  if (request.resourceDigitalEstateId && !request.actorDigitalEstateIds?.includes(request.resourceDigitalEstateId)) {
    return false;
  }

  const table = request.rolePermissions ?? DEFAULT_ROLE_PERMISSIONS;
  const allowed = new Set(request.roles.flatMap((role) => table[role] ?? []));
  return allowed.has(request.permission);
}

/** ADR-0017 §36-37 — capability gates whether a context may use a function at all. */
export function hasCapability(context: BaobabContext, capability: string): boolean {
  if (context.isPlatformAdmin) return true;
  return context.capabilities.includes(capability);
}
