import { syntheticEstateProfile, type CanonicalReferences } from './estate-profile.js';

/** This boundary selects only a private, run-specific disposable database.
 * Unknown deployment/environment names fail closed before importing config or
 * opening a connection. It never supplies an IAM identity or a CP reference. */
export function int03FixtureBoundary(env: Record<string, string | undefined>, args: string[]) {
  const runId = env.CMS_INT03_RUN_ID ?? '';
  const action = args[0];
  if (!/^[0-9a-f]{16}$/.test(runId) || args.length !== 1 ||
      !['seed', 'verify', 'publish', 'withdraw', 'draft'].includes(action) ||
      env.BAOBAB_ENVIRONMENT !== 'ci' || (env.PAYLOAD_SECRET?.length ?? 0) < 32 || env.CMS_INT03_FIXTURE !== 'synthetic-disposable' ||
      env.S3_ENDPOINT || env.S3_BUCKET || env.BAOBAB_IAM_OIDC_ISSUER) throw new Error('Disposable fixture boundary refused');
  const database = new URL(env.DATABASE_URL ?? '');
  // Reuse the existing PG17 component job's explicit loopback boundary for
  // source regression only. The Infrastructure provider still uses cms-db on
  // its private network; it exposes no host ports.
  const loopbackComponent = env.GITHUB_ACTIONS === 'true' && env.CMS_PG17_COMPONENT_QUALIFICATION === 'synthetic-disposable' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(database.hostname);
  if (database.protocol !== 'postgresql:' || (database.hostname !== 'cms-db' && !loopbackComponent) ||
      database.port && database.port !== '5432' || database.pathname !== '/cms_int03_' + runId || database.search || database.hash ||
      !database.username || !database.password) throw new Error('Disposable fixture database refused');
  return { runId, action };
}


/** Mechanical handoff from the later connected runner. Parsing supplied IDs
 * does not verify CP issuance, owner relationships, grants or authorisation.
 * The runner must obtain those independently from actual current CP APIs.
 * Canonical one-line JSON also refuses duplicate keys without a second parser. */
export function int03ReferenceDeclaration(raw: string | undefined, runId: string): Readonly<CanonicalReferences> {
  const unresolved = syntheticEstateProfile(runId).canonicalReferences;
  if (raw === undefined) return unresolved;
  if (Buffer.byteLength(raw, 'utf8') > 4096) throw new Error('Invalid fixture reference declaration');
  let value: unknown;
  try { value = JSON.parse(raw); } catch { throw new Error('Invalid fixture reference declaration'); }
  if (!value || typeof value !== 'object' || Array.isArray(value) || raw.trim() !== JSON.stringify(value)) {
    throw new Error('Invalid fixture reference declaration');
  }
  const document = value as Record<string, unknown>;
  if (Object.keys(document).sort().join(',') !== 'references,run_id,schema' ||
      document.schema !== 'cms.int03.reference-declaration.v1' || document.run_id !== runId ||
      !document.references || typeof document.references !== 'object' || Array.isArray(document.references) ||
      Object.keys(document.references).sort().join(',') !== 'digitalEstate,legalEntity,market,organisation,tenant') {
    throw new Error('Invalid fixture reference declaration');
  }
  const refs = syntheticEstateProfile(runId, document.references as CanonicalReferences).canonicalReferences;
  const missing = Object.values(refs).filter(reference => reference === 'UNRESOLVED').length;
  if (missing !== 0 && missing !== 5) throw new Error('Incomplete fixture reference declaration');
  return refs;
}
