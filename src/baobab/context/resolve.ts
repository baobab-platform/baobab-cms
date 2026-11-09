import { randomUUID } from 'node:crypto';
import type { BaobabContext, CapabilityId, PlatformContext } from './types.js';
import { contextConflict, invalidTenant, missingContext, unauthorizedContextSwitch } from './errors.js';

/**
 * Structural request shape this resolver needs. `payload.PayloadRequest`
 * satisfies this without a hard dependency, which keeps context resolution
 * unit-testable without booting Payload or a database.
 */
export interface ContextActor {
  id: string | number;
  canonicalActorId?: string | null;
  tenantId?: string | null;
  legalEntityId?: string | null;
  digitalEstateIds?: string[] | null;
  marketIds?: string[] | null;
  locales?: string[] | null;
  capabilities?: CapabilityId[] | null;
  platformAdministrator?: boolean | null;
}

export interface ContextRequest {
  user?: ContextActor | null;
  headers: { get(name: string): string | null };
}

const HEADER_CORRELATION_ID = 'x-baobab-correlation-id';
const HEADER_DIGITAL_ESTATE = 'x-baobab-digital-estate-id';
const HEADER_MARKET = 'x-baobab-market-id';
const HEADER_LOCALE = 'x-baobab-locale';

export interface ResolveContextOptions {
  /**
   * Digital estate the caller wants to act within, e.g. supplied by a
   * trusted digital-estate backend/gateway. Validated against the actor's
   * authorized bindings — never trusted blindly (ADR-0012 §30-32, §75).
   */
  requestedDigitalEstateId?: string;
  requestedMarketId?: string;
  requestedLocale?: string;
}

function resolveAuthorizedDimension(params: {
  requested: string | undefined;
  authorized: string[] | undefined | null;
  dimensionName: string;
}): string | undefined {
  const { requested, authorized, dimensionName } = params;
  if (!requested) return undefined;
  // An absent/empty grant list grants NO estate, market or locale authority.
  // Values from request headers are only selectors; never entitlements (ADR-0012 §31).
  if (!authorized?.includes(requested)) {
    throw unauthorizedContextSwitch(
      `requested ${dimensionName} "${requested}" is not among the actor's authorized bindings`,
    );
  }
  return requested;
}

/**
 * Resolve the trusted canonical context for an authenticated request.
 *
 * This function fails closed (throws `ContextResolutionError`) whenever
 * context is missing, ambiguous, unauthorized or internally inconsistent.
 * Callers MUST NOT catch this error and substitute a default context — see
 * ADR-0012 §73-77.
 */
export function resolveContext(req: ContextRequest, options: ResolveContextOptions = {}): BaobabContext {
  const correlationId = req.headers.get(HEADER_CORRELATION_ID) || randomUUID();

  const user = req.user;
  if (!user) {
    throw missingContext('request has no authenticated actor');
  }

  const actorId = (user.canonicalActorId && user.canonicalActorId.trim()) || String(user.id);
  if (!actorId) {
    throw missingContext('authenticated actor has neither a canonical nor a local identity');
  }

  const isPlatformAdmin = user.platformAdministrator === true;
  const tenantId = user.tenantId && user.tenantId.trim();

  if (!tenantId) {
    // A platform administrator MAY operate with no bound tenant at all
    // (e.g. managing the Tenants collection itself) — that is an explicit
    // platform-scoped context, not a tenant with a missing id
    // (ADR-0012 §33, §10 — never inferred, always deliberate).
    if (isPlatformAdmin) {
      return {
        kind: 'platform',
        actorId,
        capabilities: user.capabilities ?? [],
        isPlatformAdmin: true,
        correlationId,
      };
    }
    throw invalidTenant('actor is not bound to a canonical tenant');
  }

  const digitalEstateId = resolveAuthorizedDimension({
    requested: options.requestedDigitalEstateId ?? req.headers.get(HEADER_DIGITAL_ESTATE) ?? undefined,
    authorized: user.digitalEstateIds,
    dimensionName: 'digital estate',
  });

  const marketId = resolveAuthorizedDimension({
    requested: options.requestedMarketId ?? req.headers.get(HEADER_MARKET) ?? undefined,
    authorized: user.marketIds,
    dimensionName: 'market',
  });

  const locale = resolveAuthorizedDimension({
    requested: options.requestedLocale ?? req.headers.get(HEADER_LOCALE) ?? undefined,
    authorized: user.locales,
    dimensionName: 'locale',
  });

  return {
    kind: 'tenant',
    tenantId,
    legalEntityId: user.legalEntityId ?? undefined,
    digitalEstateId,
    marketId,
    locale,
    actorId,
    capabilities: user.capabilities ?? [],
    isPlatformAdmin,
    correlationId,
  };
}

/**
 * Non-throwing variant for call sites (e.g. Payload `access` functions)
 * that must fail closed by returning `false`/deny rather than raising an
 * unhandled exception mid-request.
 */
export function tryResolveContext(req: ContextRequest, options: ResolveContextOptions = {}): BaobabContext | null {
  try {
    return resolveContext(req, options);
  } catch {
    return null;
  }
}

/**
 * Explicit platform-scoped context for background jobs, migrations and
 * reconciliation tooling (ADR-0012 §33). Never derive this from a request —
 * it must be deliberately constructed by trusted system code.
 */
export function createSystemContext(params: {
  actorId: string;
  capabilities?: CapabilityId[];
  correlationId?: string;
}): PlatformContext {
  return {
    kind: 'platform',
    actorId: params.actorId,
    capabilities: params.capabilities ?? [],
    isPlatformAdmin: true,
    correlationId: params.correlationId ?? randomUUID(),
  };
}

/**
 * Validates that two resolved contexts agree on tenancy — used where a
 * record's stored tenant must be cross-checked against the effective
 * request context before a mutation is allowed (ADR-0012 §19, §75).
 */
export function assertMatchingTenant(context: BaobabContext, recordTenantId: string | undefined | null): void {
  if (context.kind === 'platform') return;
  if (!recordTenantId) {
    throw contextConflict('record has no tenant ownership to compare against the request context');
  }
  if (recordTenantId !== context.tenantId) {
    throw contextConflict(
      `record tenant "${recordTenantId}" does not match request context tenant "${context.tenantId}"`,
    );
  }
}
