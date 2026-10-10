import { describe, expect, it } from 'vitest';
import Users from '../../collections/Users.js';
import SiteConfigurations from '../../collections/SiteConfigurations.js';
import PortfolioCompanies from '../../collections/PortfolioCompanies.js';
import {
  PublicationDeniedError,
  platformAdministratorOnlyField,
  publicationGuardBeforeChange,
  requiredPermissions,
  asPageState,
  createPublicationGuard,
} from './publication.js';

type U = {
  id: string;
  tenantId?: string;
  editorialRoles?: string[];
  capabilities?: string[];
  digitalEstateIds?: string[];
  platformAdministrator?: boolean;
};
const req = (user: U | null) => ({ user, headers: new Headers() }) as never;
const run = (
  user: U | null,
  operation: 'create' | 'update',
  data: Record<string, unknown>,
  originalDoc?: Record<string, unknown>,
) => () => publicationGuardBeforeChange({ data, originalDoc, operation, req: req(user), collection: {} as never, context: {} as never });

const actor = (roles: string[], extra: Partial<U> = {}): U => ({
  id: 'u1', tenantId: 'tn_a', editorialRoles: roles, capabilities: ['content.management', 'content.publish'], ...extra,
});

describe('requiredPermissions', () => {
  it('maps transitions to permissions', () => {
    expect(requiredPermissions({ operation: 'create', next: 'DRAFT' })).toEqual(['create']);
    expect(requiredPermissions({ operation: 'create', next: 'PUBLISHED' })).toEqual(['create', 'publish']);
    expect(requiredPermissions({ operation: 'update', previous: 'DRAFT', next: 'PUBLISHED' })).toEqual(['update', 'publish']);
    expect(requiredPermissions({ operation: 'update', previous: 'PUBLISHED', next: 'PUBLISHED' })).toEqual(['update', 'publish']);
    expect(requiredPermissions({ operation: 'update', previous: 'PUBLISHED', next: 'UNPUBLISHED' })).toEqual(['update', 'unpublish']);
    expect(requiredPermissions({ operation: 'update', previous: 'PUBLISHED', next: 'DRAFT' })).toEqual(['update', 'unpublish']);
    expect(requiredPermissions({ operation: 'update', previous: 'DRAFT', next: 'ARCHIVED' })).toEqual(['update', 'archive']);
    expect(requiredPermissions({ operation: 'update', previous: 'DRAFT', next: 'DRAFT' })).toEqual(['update']);
  });
});

describe('publicationGuardBeforeChange', () => {
  it('lets an author draft but not publish', () => {
    const author = actor(['AUTHOR']);
    expect(run(author, 'create', { publicationState: 'DRAFT' })).not.toThrow();
    expect(run(author, 'update', { publicationState: 'PUBLISHED' }, { publicationState: 'DRAFT' })).toThrow(PublicationDeniedError);
  });

  it('stops an editor changing live content', () => {
    const editor = actor(['EDITOR']);
    expect(run(editor, 'update', { publicationState: 'PUBLISHED', title: 'x' }, { publicationState: 'PUBLISHED' })).toThrow(PublicationDeniedError);
    expect(run(editor, 'update', { title: 'x' }, { publicationState: 'PUBLISHED' })).toThrow(PublicationDeniedError);
  });

  it('lets a publisher publish only with content.publish, and a publisher alone cannot edit', () => {
    const publisher = actor(['EDITOR', 'PUBLISHER']);
    expect(run(publisher, 'update', { publicationState: 'PUBLISHED' }, { publicationState: 'DRAFT' })).not.toThrow();
    const noCap = actor(['EDITOR', 'PUBLISHER'], { capabilities: ['content.management'] });
    expect(run(noCap, 'update', { publicationState: 'PUBLISHED' }, { publicationState: 'DRAFT' })).toThrow(PublicationDeniedError);
    expect(run(actor(['PUBLISHER']), 'update', { publicationState: 'PUBLISHED' }, { publicationState: 'DRAFT' })).toThrow(PublicationDeniedError);
  });

  it('denies viewers, reviewers, role-less users and unresolvable contexts', () => {
    for (const roles of [['VIEWER'], ['REVIEWER'], []]) {
      expect(run(actor(roles), 'create', { publicationState: 'DRAFT' })).toThrow(PublicationDeniedError);
    }
    expect(run(null, 'create', { publicationState: 'DRAFT' })).toThrow(PublicationDeniedError);
    expect(run({ id: 'x', editorialRoles: ['CONTENT_ADMINISTRATOR'] }, 'create', {})).toThrow(PublicationDeniedError); // no tenant
  });

  it('respects the actor estate bindings', () => {
    const bound = actor(['CONTENT_ADMINISTRATOR'], { digitalEstateIds: ['estate-1'] });
    expect(run(bound, 'create', { digitalEstate: 'estate-1' })).not.toThrow();
    expect(run(bound, 'create', { digitalEstate: 'estate-2' })).toThrow(PublicationDeniedError);
  });

  it('lets a platform administrator through', () => {
    expect(run({ id: 's', platformAdministrator: true }, 'create', { publicationState: 'PUBLISHED' })).not.toThrow();
  });

  it('ignores unknown roles', () => {
    expect(run(actor(['SUPERUSER']), 'create', {})).toThrow(PublicationDeniedError);
  });
});

describe('wiring', () => {
  it.each([SiteConfigurations, PortfolioCompanies])('$slug runs the guard before change and delete', (c) => {
    expect(c.hooks?.beforeChange).toContain(publicationGuardBeforeChange);
    expect(c.hooks?.beforeDelete?.length).toBeGreaterThan(0);
  });

  it('only a platform administrator may change identity and entitlement fields on a user', () => {
    const guarded = [
      'tenantId', 'legalEntityId', 'digitalEstateIds', 'marketIds', 'locales', 'editorialRoles',
      'capabilities', 'serviceIdentity', 'tenantID', 'organisationID', 'region', 'roles',
    ];
    for (const name of guarded) {
      const f = Users.fields.find((x) => 'name' in x && x.name === name) as { access?: { update?: unknown } };
      expect(f?.access?.update, name).toBe(platformAdministratorOnlyField);
    }
    const call = (admin: boolean) => platformAdministratorOnlyField({ req: { user: { platformAdministrator: admin } } } as never);
    expect(call(true)).toBe(true);
    expect(call(false)).toBe(false);
    expect(platformAdministratorOnlyField({ req: {} } as never)).toBe(false);
  });
});


describe('createPublicationGuard for pages (transitional)', () => {
  const guard = createPublicationGuard({ stateField: 'status', readState: asPageState, transitional: true });
  const change = (user: U | null, operation: 'create' | 'update', data: Record<string, unknown>, originalDoc?: Record<string, unknown>) => () =>
    guard.beforeChange({ data, originalDoc, operation, req: req(user), collection: {} as never, context: {} as never });

  it('maps the page status values onto editorial states', () => {
    expect(asPageState('draft')).toBe('DRAFT');
    expect(asPageState('published')).toBe('PUBLISHED');
    expect(asPageState('archived')).toBe('ARCHIVED');
    expect(asPageState('PUBLISHED')).toBeUndefined();
    expect(asPageState(undefined)).toBeUndefined();
  });

  it('enforces an editor who has editorial roles', () => {
    const author = actor(['AUTHOR']);
    expect(change(author, 'create', { status: 'draft' })).not.toThrow();
    expect(change(author, 'update', { status: 'published' }, { status: 'draft' })).toThrow(PublicationDeniedError);
    expect(change(author, 'create', { status: 'published' })).toThrow(PublicationDeniedError);
    const editor = actor(['EDITOR']);
    expect(change(editor, 'update', { title: 'x' }, { status: 'published' })).toThrow(PublicationDeniedError);
    const publisher = actor(['EDITOR', 'PUBLISHER']);
    expect(change(publisher, 'update', { status: 'published' }, { status: 'draft' })).not.toThrow();
    expect(change(publisher, 'update', { status: 'draft' }, { status: 'published' })).not.toThrow(); // PUBLISHER holds unpublish
    expect(change(actor(['EDITOR']), 'update', { status: 'draft' }, { status: 'published' })).toThrow(PublicationDeniedError);
  });

  it('leaves a legacy editor with no editorial roles on the access layer only (documented transitional gap)', () => {
    const legacy = actor([]);
    expect(change(legacy, 'update', { status: 'published' }, { status: 'draft' })).not.toThrow();
  });

  it('still denies an unauthenticated actor and passes a platform administrator', () => {
    expect(change(null, 'create', { status: 'draft' })).toThrow(PublicationDeniedError);
    expect(change(actor([], { platformAdministrator: true }), 'update', { status: 'published' }, { status: 'draft' })).not.toThrow();
  });

  it('is strict once transitional is off', () => {
    const strict = createPublicationGuard({ stateField: 'status', readState: asPageState });
    expect(() =>
      strict.beforeChange({ data: { status: 'published' }, originalDoc: { status: 'draft' }, operation: 'update', req: req(actor([])), collection: {} as never, context: {} as never }),
    ).toThrow(PublicationDeniedError);
  });
});
