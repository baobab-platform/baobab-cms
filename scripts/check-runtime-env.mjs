/**
 * ADR-0011 / ADR-0020 — validate production runtime configuration before
 * listening. This runs at process start, not during Next's build (where
 * production credentials must never be required or baked into artifacts).
 */
export function validateRuntimeEnvironment(env) {
  if (env.NODE_ENV !== 'production') return;
  const required = ['PAYLOAD_SECRET', 'DATABASE_URL', 'S3_BUCKET', 'CORS_ORIGIN', 'CSRF_ORIGIN'];
  for (const key of required) {
    if (!env[key]?.trim()) throw new Error(`Production configuration missing ${key}`);
  }
  if (env.PAYLOAD_SECRET.length < 32 || /^(change-me|super-secret-change-me)/i.test(env.PAYLOAD_SECRET)) {
    throw new Error('Production PAYLOAD_SECRET must be a non-default secret of at least 32 characters');
  }
  for (const name of ['CORS_ORIGIN', 'CSRF_ORIGIN']) {
    let origin;
    try { origin = new URL(env[name]); } catch { throw new Error(`Invalid ${name} origin`); }
    if (origin.protocol !== 'https:' || origin.origin !== env[name] || origin.username || origin.password) {
      throw new Error(`Production ${name} must be an exact HTTPS origin`);
    }
  }
  if (env.S3_ENDPOINT) {
    let endpoint;
    try { endpoint = new URL(env.S3_ENDPOINT); } catch { throw new Error('Invalid S3_ENDPOINT URL'); }
    if (endpoint.protocol !== 'https:') throw new Error('Production S3_ENDPOINT must use HTTPS');
  }
  if (Boolean(env.S3_ACCESS_KEY_ID) !== Boolean(env.S3_SECRET_ACCESS_KEY)) {
    throw new Error('Provide both S3 static credentials or neither (IAM/workload identity)');
  }
  if (env.S3_ACCESS_KEY_ID === 'minioadmin' || env.S3_SECRET_ACCESS_KEY === 'minioadmin') {
    throw new Error('Development MinIO credentials cannot be used in production');
  }
  if (env.PGSSLMODE !== 'require') {
    throw new Error('Production PostgreSQL connections must require certificate-verified TLS (PGSSLMODE=require)');
  }
}

if (process.argv[1]?.endsWith('check-runtime-env.mjs')) {
  validateRuntimeEnvironment(process.env);
}
