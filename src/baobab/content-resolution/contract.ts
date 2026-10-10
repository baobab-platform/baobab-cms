import { resolveContent } from './resolver.js';
import { AmbiguousResolutionError, InheritanceMode } from './types.js';
import type {
  OptionalDimension,
  PublicationState,
  ResolutionPolicy,
  ResolutionRequest,
  ResolutionTraceStep,
  ResolvableRecord,
} from './types.js';

/**
 * Handler logic for the canonical `content.entry.resolve` capability, against
 * baobab-platform/shared contracts/content/v1 (ContentResolveRequest and
 * ContentResolveResponse) and errors/v1 (problem details).
 *
 * This module is transport-free on purpose. It does not choose an HTTP route
 * or an authentication scheme: Shared publishes no OpenAPI for content/v1
 * yet, and the route must not be invented here. A route adapter supplies the
 * trusted context (from verified workload identity) and the two data
 * dependencies, and maps the outcome to an HTTP response.
 *
 * Fail-closed rules:
 * - the request's `tenant_id` is a *claim*; it must equal the tenant from the
 *   trusted context, otherwise the request is refused;
 * - candidates are filtered to the trusted tenant before resolution, so a
 *   faulty loader cannot leak another tenant's content;
 * - `preview_mode` (draft content) is honoured only when the trusted context
 *   permits it;
 * - an ambiguous result is an error, never an arbitrary pick.
 */

export interface ContentEntryRecord extends ResolvableRecord {
  data: Record<string, unknown>;
}

export interface TrustedContentContext {
  /** Tenant from verified identity and context resolution; never from the request body. */
  tenantId: string;
  correlationId: string;
  traceId?: string;
  /** True only for callers entitled to read unpublished content. */
  previewPermitted: boolean;
}

export interface ContentResolveDependencies {
  /** Candidate records for one content key. Must already be scoped to the tenant; the handler re-checks. */
  loadCandidates(tenantId: string, contentKey: string): Promise<ContentEntryRecord[]>;
  /** Policy (inheritance mode, supported scopes, locale fallback) for the content key; undefined if unknown. */
  policyFor(contentKey: string): ResolutionPolicy | undefined;
}

export interface ContentResolveRequestDto {
  tenant_id: string;
  content_key: string;
  legal_entity_id?: string | null;
  digital_estate_id?: string | null;
  market_id?: string | null;
  locale?: string | null;
  effective_time?: string | null;
  preview_mode?: boolean | null;
}

export interface ResolvedContentEntryDto {
  id: string;
  tenant_id: string;
  content_key: string;
  legal_entity_id: string | null;
  digital_estate_id: string | null;
  market_id: string | null;
  locale: string | null;
  publication_state: PublicationState;
  effective_from: string | null;
  effective_to: string | null;
  data: Record<string, unknown>;
}

export interface ContentResolveResponseDto {
  record: ResolvedContentEntryDto | null;
  matched_scope: 'EXACT' | 'FALLBACK' | 'NONE';
  provenance: {
    trace: { scope_level: Record<string, string | null>; locale_attempted: string | null; match_count: number }[];
    inheritance_mode: InheritanceMode;
  };
}

export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: string;
  correlation_id: string;
  trace_id?: string;
  retryable: boolean;
  errors?: { code: string; field?: string; message: string }[];
}

export type ContentResolveOutcome =
  | { ok: true; status: 200; body: ContentResolveResponseDto }
  | { ok: false; status: number; problem: ProblemDetails };

const PROBLEM_BASE = 'https://docs.baobab-platform.com/problems/';
const REQUEST_FIELDS = new Set([
  'tenant_id',
  'content_key',
  'legal_entity_id',
  'digital_estate_id',
  'market_id',
  'locale',
  'effective_time',
  'preview_mode',
]);
const LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

type FieldError = { code: string; field: string; message: string };

function boundedString(
  body: Record<string, unknown>,
  field: string,
  max: number,
  required: boolean,
  errors: FieldError[],
): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) {
    if (required) errors.push({ code: 'FIELD_REQUIRED', field, message: `${field} is required` });
    return undefined;
  }
  if (typeof value !== 'string' || value.length < 1 || value.length > max) {
    errors.push({ code: 'FIELD_INVALID', field, message: `${field} must be a string of 1 to ${max} characters` });
    return undefined;
  }
  return value;
}

/** Validates a body against ContentResolveRequest (additionalProperties: false). */
export function parseContentResolveRequest(
  body: unknown,
): { ok: true; value: ContentResolveRequestDto } | { ok: false; errors: FieldError[] } {
  const errors: FieldError[] = [];

  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { ok: false, errors: [{ code: 'BODY_INVALID', field: '/', message: 'Request body must be a JSON object' }] };
  }
  const input = body as Record<string, unknown>;

  for (const key of Object.keys(input)) {
    if (!REQUEST_FIELDS.has(key)) {
      errors.push({ code: 'FIELD_UNKNOWN', field: key, message: `${key} is not a recognised field` });
    }
  }

  const tenant_id = boundedString(input, 'tenant_id', 255, true, errors);
  const content_key = boundedString(input, 'content_key', 500, true, errors);
  const legal_entity_id = boundedString(input, 'legal_entity_id', 255, false, errors);
  const digital_estate_id = boundedString(input, 'digital_estate_id', 255, false, errors);
  const market_id = boundedString(input, 'market_id', 255, false, errors);

  let locale: string | undefined;
  if (input.locale !== undefined && input.locale !== null) {
    if (typeof input.locale !== 'string' || !LOCALE.test(input.locale)) {
      errors.push({ code: 'FIELD_INVALID', field: 'locale', message: "locale must look like 'en' or 'en-US'" });
    } else {
      locale = input.locale;
    }
  }

  let effective_time: string | undefined;
  if (input.effective_time !== undefined && input.effective_time !== null) {
    if (
      typeof input.effective_time !== 'string' ||
      !DATE_TIME.test(input.effective_time) ||
      Number.isNaN(Date.parse(input.effective_time))
    ) {
      errors.push({ code: 'FIELD_INVALID', field: 'effective_time', message: 'effective_time must be an RFC 3339 date-time' });
    } else {
      effective_time = input.effective_time;
    }
  }

  let preview_mode: boolean | undefined;
  if (input.preview_mode !== undefined && input.preview_mode !== null) {
    if (typeof input.preview_mode !== 'boolean') {
      errors.push({ code: 'FIELD_INVALID', field: 'preview_mode', message: 'preview_mode must be a boolean' });
    } else {
      preview_mode = input.preview_mode;
    }
  }

  if (errors.length > 0 || tenant_id === undefined || content_key === undefined) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: { tenant_id, content_key, legal_entity_id, digital_estate_id, market_id, locale, effective_time, preview_mode },
  };
}

function problem(
  context: TrustedContentContext,
  status: number,
  slug: string,
  code: string,
  title: string,
  detail: string,
  extra: Partial<ProblemDetails> = {},
): ContentResolveOutcome {
  return {
    ok: false,
    status,
    problem: {
      type: `${PROBLEM_BASE}${slug}`,
      title,
      status,
      detail,
      code,
      correlation_id: context.correlationId,
      ...(context.traceId ? { trace_id: context.traceId } : {}),
      retryable: false,
      ...extra,
    },
  };
}

function toResponse(
  record: ContentEntryRecord | null,
  matchedScope: 'EXACT' | 'FALLBACK' | 'NONE',
  trace: ResolutionTraceStep[],
  policy: ResolutionPolicy,
): ContentResolveResponseDto {
  return {
    record: record
      ? {
          id: record.id,
          tenant_id: record.tenantId,
          content_key: record.contentKey,
          legal_entity_id: record.legalEntityId ?? null,
          digital_estate_id: record.digitalEstateId ?? null,
          market_id: record.marketId ?? null,
          locale: record.locale ?? null,
          publication_state: record.publicationState,
          effective_from: record.effectiveFrom ?? null,
          effective_to: record.effectiveTo ?? null,
          data: record.data,
        }
      : null,
    matched_scope: matchedScope,
    provenance: {
      trace: trace.map((step) => ({
        scope_level: Object.fromEntries(
          (Object.entries(step.level) as [OptionalDimension, string | undefined][]).map(([dimension, value]) => [
            toSnake(dimension),
            value ?? null,
          ]),
        ),
        locale_attempted: step.localeAttempted ?? null,
        match_count: step.matchCount,
      })),
      inheritance_mode: policy.inheritanceMode,
    },
  };
}

function toSnake(dimension: OptionalDimension): string {
  return { legalEntityId: 'legal_entity_id', digitalEstateId: 'digital_estate_id', marketId: 'market_id', locale: 'locale' }[
    dimension
  ];
}

/** Resolves one content entry. Business outcomes are returned, not thrown. */
export async function handleContentResolve(
  body: unknown,
  context: TrustedContentContext,
  deps: ContentResolveDependencies,
): Promise<ContentResolveOutcome> {
  const parsed = parseContentResolveRequest(body);
  if (!parsed.ok) {
    return problem(context, 400, 'invalid-request', 'CONTENT_REQUEST_INVALID', 'Invalid request', 'The request does not match ContentResolveRequest.', {
      errors: parsed.errors.slice(0, 50),
    });
  }
  const dto = parsed.value;

  if (dto.tenant_id !== context.tenantId) {
    return problem(context, 403, 'content-context-rejected', 'CONTENT_CONTEXT_REJECTED', 'Context rejected', 'The request context cannot be used by this caller.');
  }

  if (dto.preview_mode === true && !context.previewPermitted) {
    return problem(context, 403, 'preview-not-permitted', 'CONTENT_PREVIEW_NOT_PERMITTED', 'Preview not permitted', 'The caller may not read unpublished content.');
  }

  const policy = deps.policyFor(dto.content_key);
  if (!policy) {
    return problem(context, 404, 'content-type-unknown', 'CONTENT_TYPE_UNKNOWN', 'Unknown content type', 'No resolution policy is defined for this content key.');
  }

  if (policy.inheritanceMode === InheritanceMode.COMPOSE) {
    return problem(
      context,
      422,
      'unsupported-inheritance-mode',
      'CONTENT_COMPOSE_UNSUPPORTED',
      'Composed content is not resolvable here',
      'COMPOSE content needs a composition response; content/v1 returns a single record.',
    );
  }

  const request: ResolutionRequest = {
    tenantId: context.tenantId,
    contentKey: dto.content_key,
    legalEntityId: dto.legal_entity_id ?? undefined,
    digitalEstateId: dto.digital_estate_id ?? undefined,
    marketId: dto.market_id ?? undefined,
    locale: dto.locale ?? undefined,
    effectiveTime: dto.effective_time ?? undefined,
    previewMode: dto.preview_mode ?? false,
  };

  const loaded = await deps.loadCandidates(context.tenantId, dto.content_key);
  const candidates = loaded.filter((record) => record.tenantId === context.tenantId);

  try {
    const result = resolveContent(request, candidates, policy);
    const record = result.record as ContentEntryRecord | null;

    return { ok: true, status: 200, body: toResponse(record, result.matchedScope, result.trace, policy) };
  } catch (error) {
    if (error instanceof AmbiguousResolutionError) {
      return problem(context, 409, 'content-ambiguous', 'CONTENT_AMBIGUOUS', 'Ambiguous content', 'More than one equally specific entry is eligible; the editorial data needs correcting.');
    }
    throw error;
  }
}

/** Page status values onto the contract's publication states (ADR-0012 §44). */
export function publicationStateFromStatus(status: string | undefined): PublicationState {
  switch (status) {
    case 'published':
      return 'PUBLISHED';
    case 'archived':
      return 'ARCHIVED';
    case 'unpublished':
      return 'UNPUBLISHED';
    default:
      return 'DRAFT';
  }
}
