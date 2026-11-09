import type { CanonicalMapping, ExternalReference, MappingProvenance, MappingScope } from './types.js';

export interface CreateMappingInput {
  canonicalEntityId?: string;
  canonicalEntityType: string;
  externalReference: ExternalReference;
  scope: MappingScope;
  provenance: MappingProvenance;
  confidence?: number;
  /** Required — mapping creation SHALL be idempotent (ADR-0013 §80). */
  idempotencyKey: string;
}

/**
 * Mapping resolution boundary (ADR-0013 §41-43, §73). Payload SHALL NOT
 * query the Control Plane database directly — every canonical-identity
 * lookup and mapping mutation goes through an implementation of this
 * interface.
 *
 * This is the single swap-in point for a real Control Plane HTTP/gRPC
 * client. Nothing outside this package should import a concrete resolver
 * implementation directly; consumers depend on `MappingResolver`.
 */
export interface MappingResolver {
  resolveByExternalReference(ref: ExternalReference, scope: MappingScope): Promise<CanonicalMapping | null>;
  resolveByCanonicalId(canonicalEntityId: string, scope: MappingScope): Promise<CanonicalMapping[]>;
  createMapping(input: CreateMappingInput): Promise<CanonicalMapping>;
}

export class MappingResolverUnavailableError extends Error {
  constructor(reason: string) {
    super(`Mapping resolver unavailable: ${reason}`);
    this.name = 'MappingResolverUnavailableError';
  }
}

/**
 * Fail-closed default. No real Control Plane mapping service exists in
 * this environment yet; rather than silently guessing equivalence from
 * slugs/names/SKUs (explicitly prohibited — ADR-0013 §51, §83), every call
 * fails loudly so callers implement the documented degradation policy for
 * their operation instead of getting incorrect data.
 */
export class UnavailableMappingResolver implements MappingResolver {
  async resolveByExternalReference(): Promise<CanonicalMapping | null> {
    throw new MappingResolverUnavailableError('no Control Plane mapping service is configured');
  }

  async resolveByCanonicalId(): Promise<CanonicalMapping[]> {
    throw new MappingResolverUnavailableError('no Control Plane mapping service is configured');
  }

  async createMapping(): Promise<CanonicalMapping> {
    throw new MappingResolverUnavailableError('no Control Plane mapping service is configured');
  }
}

/**
 * In-memory resolver for tests and local development. Explicitly
 * non-production: it holds no durable state and is single-process only.
 * Real deployments MUST provide an HTTP/gRPC-backed implementation of
 * `MappingResolver` pointed at the Control Plane mapping service.
 */
export class InMemoryMappingResolver implements MappingResolver {
  private readonly mappings: CanonicalMapping[] = [];
  private readonly seenIdempotencyKeys = new Map<string, CanonicalMapping>();

  private matchesScope(mapping: CanonicalMapping, scope: MappingScope): boolean {
    if (mapping.scope.tenantId !== scope.tenantId) return false;
    // A caller missing a narrower dimension must NOT see mappings scoped
    // to that legal entity, digital estate, or market (ADR-0013 §15–17).
    // Broader-scope mappings may still apply in a narrower resolved context.
    if (mapping.scope.legalEntityId && mapping.scope.legalEntityId !== scope.legalEntityId) return false;
    if (mapping.scope.digitalEstateId && mapping.scope.digitalEstateId !== scope.digitalEstateId) return false;
    if (mapping.scope.marketId && mapping.scope.marketId !== scope.marketId) return false;
    return true;
  }

  async resolveByExternalReference(ref: ExternalReference, scope: MappingScope): Promise<CanonicalMapping | null> {
    const candidates = this.mappings.filter(
      (m) =>
        m.externalReference.engine === ref.engine &&
        m.externalReference.engineInstanceId === ref.engineInstanceId &&
        m.externalReference.externalType === ref.externalType &&
        m.externalReference.externalId === ref.externalId &&
        m.lifecycleState === 'ACTIVE' &&
        this.matchesScope(m, scope),
    );
    if (candidates.length > 1) {
      throw new Error('AMBIGUOUS: more than one active mapping matched this external reference and scope');
    }
    return candidates[0] ?? null;
  }

  async resolveByCanonicalId(canonicalEntityId: string, scope: MappingScope): Promise<CanonicalMapping[]> {
    return this.mappings.filter((m) => m.canonicalEntityId === canonicalEntityId && this.matchesScope(m, scope));
  }

  async createMapping(input: CreateMappingInput): Promise<CanonicalMapping> {
    const existing = this.seenIdempotencyKeys.get(input.idempotencyKey);
    if (existing) return existing;

    const canonicalEntityId = input.canonicalEntityId ?? crypto.randomUUID();
    const mapping: CanonicalMapping = {
      canonicalEntityId,
      canonicalEntityType: input.canonicalEntityType,
      externalReference: input.externalReference,
      scope: input.scope,
      lifecycleState: 'ACTIVE',
      provenance: input.provenance,
      confidence: input.confidence,
      validFrom: new Date().toISOString(),
    };
    this.mappings.push(mapping);
    this.seenIdempotencyKeys.set(input.idempotencyKey, mapping);
    return mapping;
  }
}
