import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  handleContentResolve,
  parseContentResolveRequest,
  publicationStateFromStatus,
  type ContentEntryRecord,
  type ContentResolveDependencies,
  type TrustedContentContext,
} from './contract.js';
import { InheritanceMode } from './types.js';
import type { ResolutionPolicy } from './types.js';
import { ContentScope } from '../tenancy/scope.js';

const context: TrustedContentContext = {
  tenantId: 'tenant-a',
  correlationId: '7a8b9c0d-1e2f-4a3b-8c5d-6e7f8a9b0c1d',
  traceId: '0af7651916cd43dd8448eb211c80319c',
  previewPermitted: false,
};

const inheritPolicy: ResolutionPolicy = {
  contentType: 'page',
  inheritanceMode: InheritanceMode.INHERIT,
  supportedScopes: [ContentScope.DIGITAL_ESTATE, ContentScope.MARKET, ContentScope.LOCALE],
  localeFallback: { 'en-ZA': ['en'] },
};

function entry(overrides: Partial<ContentEntryRecord>): ContentEntryRecord {
  return {
    id: overrides.id ?? 'e1',
    tenantId: 'tenant-a',
    contentKey: 'home',
    publicationState: 'PUBLISHED',
    data: { title: 'Home' },
    ...overrides,
  };
}

function deps(records: ContentEntryRecord[], policy: ResolutionPolicy | null = inheritPolicy): ContentResolveDependencies {
  return {
    loadCandidates: async () => records,
    policyFor: () => policy ?? undefined,
  };
}

const request = { tenant_id: 'tenant-a', content_key: 'home' };

describe('parseContentResolveRequest', () => {
  it('accepts the minimal request and nulls for optional members', () => {
    expect(parseContentResolveRequest(request).ok).toBe(true);
    expect(
      parseContentResolveRequest({
        ...request,
        legal_entity_id: null,
        digital_estate_id: null,
        market_id: null,
        locale: null,
        effective_time: null,
        preview_mode: null,
      }).ok,
    ).toBe(true);
  });

  it('rejects unknown, missing and malformed members', () => {
    const cases: [unknown, string][] = [
      [{ ...request, role: 'admin' }, 'role'],
      [{ content_key: 'home' }, 'tenant_id'],
      [{ tenant_id: 'tenant-a' }, 'content_key'],
      [{ ...request, content_key: 'x'.repeat(501) }, 'content_key'],
      [{ ...request, locale: 'english' }, 'locale'],
      [{ ...request, locale: 'EN' }, 'locale'],
      [{ ...request, effective_time: 'yesterday' }, 'effective_time'],
      [{ ...request, preview_mode: 'true' }, 'preview_mode'],
      [{ ...request, market_id: '' }, 'market_id'],
    ];
    for (const [body, field] of cases) {
      const result = parseContentResolveRequest(body);
      expect(result.ok, JSON.stringify(body)).toBe(false);
      if (!result.ok) expect(result.errors.map((e) => e.field)).toContain(field);
    }
  });

  it('rejects a body that is not an object', () => {
    for (const body of [null, 'x', 1, [], undefined]) {
      expect(parseContentResolveRequest(body).ok).toBe(false);
    }
  });
});

describe('handleContentResolve', () => {
  it('returns the exact match with a snake_case record and trace', async () => {
    const outcome = await handleContentResolve(
      { ...request, digital_estate_id: 'estate-a', market_id: 'za', locale: 'en' },
      context,
      deps([entry({ id: 'broad' }), entry({ id: 'exact', digitalEstateId: 'estate-a', marketId: 'za', locale: 'en' })]),
    );

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.body.matched_scope).toBe('EXACT');
    expect(outcome.body.record).toMatchObject({
      id: 'exact',
      tenant_id: 'tenant-a',
      content_key: 'home',
      digital_estate_id: 'estate-a',
      market_id: 'za',
      locale: 'en',
      publication_state: 'PUBLISHED',
      effective_from: null,
      data: { title: 'Home' },
    });
    expect(outcome.body.provenance.inheritance_mode).toBe('INHERIT');
    expect(outcome.body.provenance.trace[0]).toMatchObject({
      scope_level: { locale: 'en', market_id: 'za', digital_estate_id: 'estate-a' },
      match_count: 1,
    });
  });

  it('falls back to a broader entry and says so', async () => {
    const outcome = await handleContentResolve(
      { ...request, digital_estate_id: 'estate-a', locale: 'en' },
      context,
      deps([entry({ id: 'broad' })]),
    );

    expect(outcome.ok && outcome.body.matched_scope).toBe('FALLBACK');
    expect(outcome.ok && outcome.body.record?.id).toBe('broad');
  });

  it('follows the explicit locale fallback chain', async () => {
    const outcome = await handleContentResolve(
      { ...request, locale: 'en-ZA' },
      context,
      deps([entry({ id: 'en-entry', locale: 'en' })]),
    );

    expect(outcome.ok && outcome.body.record?.id).toBe('en-entry');
    expect(outcome.ok && outcome.body.matched_scope).toBe('FALLBACK');
  });

  it('answers 200 with a null record and NONE when nothing is eligible', async () => {
    const outcome = await handleContentResolve(request, context, deps([]));

    expect(outcome).toMatchObject({ ok: true, status: 200, body: { record: null, matched_scope: 'NONE' } });
  });

  it('does not return unpublished content by default', async () => {
    const outcome = await handleContentResolve(request, context, deps([entry({ publicationState: 'DRAFT' })]));

    expect(outcome.ok && outcome.body.matched_scope).toBe('NONE');
  });

  it('refuses a tenant that differs from the verified context', async () => {
    const outcome = await handleContentResolve({ ...request, tenant_id: 'tenant-b' }, context, deps([entry({})]));

    expect(outcome).toMatchObject({ ok: false, status: 403, problem: { code: 'TENANT_CONTEXT_MISMATCH' } });
  });

  it('never returns another tenant’s record even if the loader leaks it', async () => {
    const outcome = await handleContentResolve(
      request,
      context,
      deps([entry({ id: 'foreign', tenantId: 'tenant-b' })]),
    );

    expect(outcome.ok && outcome.body.record).toBeNull();
  });

  it('refuses preview unless the context permits it, then returns drafts', async () => {
    const draft = entry({ id: 'draft', publicationState: 'DRAFT' });
    const denied = await handleContentResolve({ ...request, preview_mode: true }, context, deps([draft]));
    expect(denied).toMatchObject({ ok: false, status: 403, problem: { code: 'CONTENT_PREVIEW_NOT_PERMITTED' } });

    const allowed = await handleContentResolve(
      { ...request, preview_mode: true },
      { ...context, previewPermitted: true },
      deps([draft]),
    );
    expect(allowed.ok && allowed.body.record?.id).toBe('draft');
  });

  it('answers 404 for a content key with no policy', async () => {
    const outcome = await handleContentResolve(request, context, deps([], null));

    expect(outcome).toMatchObject({ ok: false, status: 404, problem: { code: 'CONTENT_TYPE_UNKNOWN' } });
  });

  it('answers 422 for COMPOSE policies, which a single record cannot represent', async () => {
    const compose: ResolutionPolicy = { ...inheritPolicy, inheritanceMode: InheritanceMode.COMPOSE };
    const outcome = await handleContentResolve(request, context, deps([entry({})], compose));

    expect(outcome).toMatchObject({ ok: false, status: 422, problem: { code: 'CONTENT_COMPOSE_UNSUPPORTED' } });
  });

  it('answers 409 when two equally specific entries are eligible', async () => {
    const outcome = await handleContentResolve(request, context, deps([entry({ id: 'a' }), entry({ id: 'b' })]));

    expect(outcome).toMatchObject({ ok: false, status: 409, problem: { code: 'CONTENT_AMBIGUOUS' } });
  });

  it('answers 400 with field errors for an invalid body and does not touch the loader', async () => {
    let called = false;
    const outcome = await handleContentResolve({ content_key: 'home' }, context, {
      loadCandidates: async () => {
        called = true;
        return [];
      },
      policyFor: () => inheritPolicy,
    });

    expect(called).toBe(false);
    expect(outcome).toMatchObject({ ok: false, status: 400, problem: { code: 'CONTENT_REQUEST_INVALID' } });
    expect(!outcome.ok && outcome.problem.errors?.[0]).toMatchObject({ field: 'tenant_id' });
  });

  it('produces problem documents that carry the required fields', async () => {
    const outcome = await handleContentResolve({ ...request, tenant_id: 'x' }, context, deps([]));

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    const p = outcome.problem;
    expect(p.code).toMatch(/^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+$/);
    expect(p.type).toMatch(/^https:\/\//);
    expect(p.correlation_id).toBe(context.correlationId);
    expect(p.retryable).toBe(false);
    expect(p.status).toBe(outcome.status);
  });

  it('lets unexpected failures propagate instead of masking them as business outcomes', async () => {
    await expect(
      handleContentResolve(request, context, {
        loadCandidates: async () => {
          throw new Error('database down');
        },
        policyFor: () => inheritPolicy,
      }),
    ).rejects.toThrow('database down');
  });
});

describe('publicationStateFromStatus', () => {
  it('maps page statuses onto contract states and defaults to DRAFT', () => {
    expect(publicationStateFromStatus('published')).toBe('PUBLISHED');
    expect(publicationStateFromStatus('archived')).toBe('ARCHIVED');
    expect(publicationStateFromStatus('unpublished')).toBe('UNPUBLISHED');
    expect(publicationStateFromStatus('draft')).toBe('DRAFT');
    expect(publicationStateFromStatus(undefined)).toBe('DRAFT');
  });
});

// Conformance against the real Shared schemas. Runs only when a Shared
// checkout is available (set SHARED_CONTRACTS_DIR, or place it at ../shared).
const sharedDir = process.env.SHARED_CONTRACTS_DIR ?? path.resolve(process.cwd(), '../shared/contracts');
const responseSchemaPath = path.join(sharedDir, 'content/v1/content-resolve-response.schema.json');
const requestSchemaPath = path.join(sharedDir, 'content/v1/content-resolve-request.schema.json');

describe.skipIf(!existsSync(responseSchemaPath))('conformance with Shared content/v1', () => {
  type Schema = { required?: string[]; properties?: Record<string, unknown>; additionalProperties?: boolean };
  const load = (file: string) => JSON.parse(readFileSync(file, 'utf8')) as { $defs: Record<string, Schema> };

  function expectConforms(value: Record<string, unknown>, schema: Schema, label: string) {
    const allowed = Object.keys(schema.properties ?? {});
    for (const key of Object.keys(value)) expect(allowed, `${label}.${key} is not in the schema`).toContain(key);
    for (const key of schema.required ?? []) expect(Object.keys(value), `${label}.${key} is required`).toContain(key);
  }

  it('emits a response whose members match the schema', async () => {
    const defs = load(responseSchemaPath).$defs;
    const outcome = await handleContentResolve(
      { ...request, digital_estate_id: 'estate-a', locale: 'en' },
      context,
      deps([entry({ id: 'x', digitalEstateId: 'estate-a', locale: 'en' })]),
    );
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expectConforms(outcome.body as unknown as Record<string, unknown>, defs.ContentResolveResponse, 'response');
    expectConforms(outcome.body.record as unknown as Record<string, unknown>, defs.ResolvedContentEntry, 'record');
    expectConforms(outcome.body.provenance as unknown as Record<string, unknown>, defs.ResolutionProvenance, 'provenance');
    for (const step of outcome.body.provenance.trace) {
      expectConforms(step as unknown as Record<string, unknown>, defs.ResolutionTraceStep, 'trace');
    }
  });

  it('accepts every member the request schema defines', () => {
    const defs = load(requestSchemaPath).$defs;
    const members = Object.keys(defs.ContentResolveRequest.properties ?? {});
    const full = {
      tenant_id: 't',
      content_key: 'k',
      legal_entity_id: 'le',
      digital_estate_id: 'de',
      market_id: 'm',
      locale: 'en-US',
      effective_time: '2026-10-08T09:00:00Z',
      preview_mode: false,
    };

    expect(Object.keys(full).sort()).toEqual([...members].sort());
    expect(parseContentResolveRequest(full).ok).toBe(true);
  });
});
