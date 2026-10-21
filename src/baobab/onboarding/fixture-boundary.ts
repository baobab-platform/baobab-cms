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
