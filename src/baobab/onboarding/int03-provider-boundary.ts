/** The disposable INT-03 CMS provider's fixture boundary (Infrastructure owns
 * the database and its teardown). Checked before Payload config is imported or
 * a connection opens: a single flag must never select an arbitrary database.
 */
export const FIXTURE_STATES = ['published', 'withdrawn', 'draft'] as const;
export type FixtureState = (typeof FIXTURE_STATES)[number];
export interface ProviderRun {
  readonly command: 'apply' | 'state' | 'verify';
  readonly state: FixtureState;
  readonly runId: string;
}

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

function refuse(reason: string): never {
  throw new Error('INT03_PROVIDER_REFUSED:' + reason);
}

/**
 * `apply` (published), `state <s>` or `verify <s>`, only with explicit
 * opt-in, the development profile, a 16-hex run id that names the database
 * `cms_int03_<run id>`, a loopback or single-label host (a container service
 * name; managed database endpoints have dots), and no object store or SSO.
 */
export function providerRun(argv: readonly string[], env: Readonly<Record<string, string | undefined>>): ProviderRun {
  const [command, state, ...rest] = argv;
  const known = (value: string | undefined): value is FixtureState => FIXTURE_STATES.includes(value as FixtureState);
  if (rest.length || !(command === 'apply' ? state === undefined : (command === 'state' || command === 'verify') && known(state))) {
    refuse('COMMAND');
  }
  if (env.CMS_INT03_PROVIDER !== 'synthetic-disposable') refuse('OPT_IN');
  if (env.BAOBAB_ENVIRONMENT !== 'development' || env.NODE_ENV === 'production') refuse('ENVIRONMENT');
  const runId = env.CMS_INT03_RUN_ID ?? '';
  if (!/^[0-9a-f]{16}$/.test(runId)) refuse('RUN_ID');
  let database: URL;
  try {
    database = new URL(env.DATABASE_URL ?? '');
  } catch {
    refuse('DATABASE');
  }
  if (database.protocol !== 'postgresql:' || database.search || database.hash ||
      !(LOOPBACK.includes(database.hostname) || /^[a-z][a-z0-9-]{0,62}$/.test(database.hostname)) ||
      database.pathname !== '/cms_int03_' + runId) refuse('DATABASE');
  if (env.S3_ENDPOINT || env.S3_BUCKET || env.BAOBAB_IAM_OIDC_ISSUER) refuse('INTEGRATION');
  return { command: command as ProviderRun['command'], state: command === 'apply' ? 'published' : state as FixtureState, runId };
}
