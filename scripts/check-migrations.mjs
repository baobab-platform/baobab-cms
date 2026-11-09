import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// ADR-0019: an applied migration is a reviewed TS implementation, a
// recoverable schema snapshot, and an entry in the deterministic registry.
export function checkMigrationInventory(dir) {
  const names = readdirSync(dir)
    .filter((name) => /^\d{8}_\d{6}.*\.ts$/.test(name))
    .map((name) => name.slice(0, -3)).sort();
  const index = readFileSync(join(dir, 'index.ts'), 'utf8');
  const registered = [...index.matchAll(/name:\s*['"]([0-9]{8}_[0-9]{6}[\w-]*)['"]/g)].map((m) => m[1]);
  const imported = [...index.matchAll(/from\s+['"]\.\/([0-9]{8}_[0-9]{6}[\w-]*)\.js['"]/g)].map((m) => m[1]);
  if (names.length === 0) throw new Error('No governed migrations found');
  if (new Set(registered).size !== registered.length || new Set(imported).size !== imported.length) {
    throw new Error('Duplicate migration registration or import');
  }
  if (JSON.stringify(registered) !== JSON.stringify(names) || JSON.stringify(imported) !== JSON.stringify(names)) {
    throw new Error('Migration registry/imports differ from timestamp-ordered migration files');
  }
  for (const name of names) {
    const snapshot = JSON.parse(readFileSync(join(dir, name + '.json'), 'utf8'));
    if (!snapshot || typeof snapshot !== 'object') throw new Error(`Invalid schema snapshot: ${name}`);
    const sql = readFileSync(join(dir, name + '.ts'), 'utf8');
    if (!/export\s+(?:async\s+)?(?:function|const)\s+up\b/.test(sql) ||
        !/export\s+(?:async\s+)?(?:function|const)\s+down\b/.test(sql)) {
      throw new Error(`Migration ${name} lacks up/down operations`);
    }
  }
  return names;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const names = checkMigrationInventory(join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations'));
  process.stdout.write(`Verified ${names.length} registered Payload migrations and schema snapshots\n`);
}
