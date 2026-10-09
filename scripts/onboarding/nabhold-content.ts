#!/usr/bin/env tsx
/**
 * Seeds DRAFT-only starter content for the Nabhold estate (home, navigation, footer, site-settings, group-profile).
 *
 *   tsx scripts/onboarding/nabhold-content.ts                              # dry-run (default)
 *   tsx scripts/onboarding/nabhold-content.ts --verify
 *   tsx scripts/onboarding/nabhold-content.ts --apply --projection-mode local
 *
 * Run scripts/onboarding/nabhold.ts first. Existing records are never changed. Nothing is published.
 */
import { getPayload } from 'payload';
import config from '../../payload.config.js';
import { SYSTEM_ACTOR } from '../../src/baobab/context/system-actor.js';
import { detectEnvironment, type Mode } from '../../src/baobab/onboarding/nabhold.js';
import { seedNabholdContent, type ContentSeedRepository } from '../../src/baobab/onboarding/nabhold-content.js';

function parse(argv: string[]) {
  const modes: Mode[] = [];
  let projectionMode: 'local' | 'none' = 'none';
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') modes.push('apply');
    else if (a === '--verify') modes.push('verify');
    else if (a === '--dry-run') modes.push('dry-run');
    else if (a === '--projection-mode' && argv[++i] === 'local') projectionMode = 'local';
    else throw new Error(`Unknown or invalid argument: ${a}`);
  }
  if (modes.length > 1) throw new Error('Choose only one of --dry-run, --apply, --verify');
  return { mode: modes[0] ?? 'dry-run', projectionMode };
}

async function main(): Promise<number> {
  const args = parse(process.argv.slice(2));
  const payload = await getPayload({ config });
  const find = async (collection: string, where: Record<string, unknown>, limit: number) =>
    (await payload.find({ collection: collection as 'pages', where: where as never, limit, depth: 0, overrideAccess: true })).docs as never as Array<
      Record<string, unknown> & { id: string }
    >;
  const repo: ContentSeedRepository = {
    find: (collection, field, value, limit) => find(collection, { [field]: { equals: value } }, limit),
    findScoped: (collection, tenantId, contentKey, kind) =>
      find(collection, { and: [{ tenant: { equals: tenantId } }, { contentKey: { equals: contentKey } }, ...(kind ? [{ kind: { equals: kind } }] : [])] }, 3),
    create: async (collection, data) =>
      (await payload.create({ collection: collection as 'pages', data: data as never, user: SYSTEM_ACTOR as never, overrideAccess: true })) as never,
    update: async () => {
      throw new Error('Content seeding never updates records.');
    },
  };
  const report = await seedNabholdContent(repo, { ...args, environment: detectEnvironment(process.env) });
  console.log(JSON.stringify(report, null, 2));
  return (args.mode === 'dry-run' ? report.blockers.length === 0 : report.converged) ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error('Nabhold content seeding failed:', error instanceof Error ? error.message : 'unknown error');
    process.exit(2);
  },
);
