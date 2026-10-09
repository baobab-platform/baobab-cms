import * as migration_20260905_121418_initial_schema from './20260905_121418_initial_schema.js';
import * as migration_20260912_172242 from './20260912_172242.js';
import * as migration_20261008_210243_corporate_content from './20261008_210243_corporate_content.js';
import * as migration_20261009_055853_site_configurations from './20261009_055853_site_configurations.js';
import * as migration_20261009_060938_tenant_control_plane_id from './20261009_060938_tenant_control_plane_id.js';
import * as migration_20261009_073426_drop_singleton_fields from './20261009_073426_drop_singleton_fields.js';
import * as migration_20261009_073430_add_estate_shaped_fields from './20261009_073430_add_estate_shaped_fields.js';
import * as migration_20261009_083520_organisation_control_plane_id from './20261009_083520_organisation_control_plane_id.js';

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
    name: '20261009_055853_site_configurations',
  },
  {
    up: migration_20261009_060938_tenant_control_plane_id.up,
    down: migration_20261009_060938_tenant_control_plane_id.down,
    name: '20261009_060938_tenant_control_plane_id',
  },
  {
    up: migration_20261009_073426_drop_singleton_fields.up,
    down: migration_20261009_073426_drop_singleton_fields.down,
    name: '20261009_073426_drop_singleton_fields',
  },
  {
    up: migration_20261009_073430_add_estate_shaped_fields.up,
    down: migration_20261009_073430_add_estate_shaped_fields.down,
    name: '20261009_073430_add_estate_shaped_fields',
  },
  {
    up: migration_20261009_083520_organisation_control_plane_id.up,
    down: migration_20261009_083520_organisation_control_plane_id.down,
    name: '20261009_083520_organisation_control_plane_id'
  },
];
