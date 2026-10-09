import * as migration_20260905_121418_initial_schema from './20260905_121418_initial_schema.js';
import * as migration_20260912_172242 from './20260912_172242.js';
import * as migration_20261008_210243_corporate_content from './20261008_210243_corporate_content.js';
import * as migration_20261009_055853_site_configurations from './20261009_055853_site_configurations.js';

export const migrations = [
  {
    up: migration_20260905_121418_initial_schema.up,
    down: migration_20260905_121418_initial_schema.down,
    name: '20260905_121418_initial_schema',
  },
  {
    up: migration_20260912_172242.up,
    down: migration_20260912_172242.down,
    name: '20260912_172242',
  },
  {
    up: migration_20261008_210243_corporate_content.up,
    down: migration_20261008_210243_corporate_content.down,
    name: '20261008_210243_corporate_content',
  },
  {
    up: migration_20261009_055853_site_configurations.up,
    down: migration_20261009_055853_site_configurations.down,
    name: '20261009_055853_site_configurations'
  },
];
