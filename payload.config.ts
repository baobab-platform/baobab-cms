import path from 'path';
import { fileURLToPath } from 'url';
import { buildConfig } from 'payload';
import { postgresAdapter } from '@payloadcms/db-postgres';
import { lexicalEditor } from '@payloadcms/richtext-lexical';
import { s3Storage } from '@payloadcms/storage-s3';

import Users from './src/collections/Users.js';
import Tenants from './src/collections/Tenants.js';
import Organisations from './src/collections/Organisations.js';
import Regions from './src/collections/Regions.js';
import DigitalEstates from './src/collections/DigitalEstates.js';
import Markets from './src/collections/Markets.js';
import Pages from './src/collections/Pages.js';
import ProductContent from './src/collections/ProductContent.js';
import PortfolioCompanies from './src/collections/PortfolioCompanies.js';
import Sectors from './src/collections/Sectors.js';
import Insights from './src/collections/Insights.js';
import Media from './src/collections/Media.js';
import Outbox from './src/collections/Outbox.js';
import AuditLog from './src/collections/AuditLog.js';
import MappingProjections from './src/collections/MappingProjections.js';
import { healthEndpoints } from './src/baobab/observability/endpoints.js';
import { oidcEndpoints } from './src/baobab/identity/oidc-endpoints.js';

const filename = fileURLToPath(import.meta.url);
const dirname = path.dirname(filename);

export default buildConfig({
  secret: process.env.PAYLOAD_SECRET || 'change-me-in-production',
  admin: {
    user: Users.slug,
    meta: {
      titleSuffix: '- Baobab Content Engine',
    },
  },
  editor: lexicalEditor(),
  db: postgresAdapter({
    pool: {
      connectionString:
        process.env.DATABASE_URL || 'postgresql://payload:payload@postgres:5432/payload',
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl:
        process.env.PGSSLMODE === 'require'
          ? { rejectUnauthorized: false }
          : undefined,
    },
    schemaName: 'payload',
    idType: 'uuid',
    migrationDir: path.resolve(dirname, './migrations'),
  }),
  collections: [
    // Identity / actors
    Users,
    // Platform context projections (ADR-0012, ADR-0014)
    Tenants,
    Organisations,
    Regions,
    DigitalEstates,
    Markets,
    // Editorial content (ADR-0011 domain authority)
    Pages,
    ProductContent,
    // Corporate editorial content read by corporate digital estates
    PortfolioCompanies,
    Sectors,
    Insights,
    Media,
    // Internal system collections (hidden from ordinary editors)
    Outbox,
    AuditLog,
    MappingProjections,
  ],
  // OIDC endpoints are always registered; they 404 at runtime when
  // BAOBAB_IAM_OIDC_ISSUER is unset (src/baobab/identity/sso.ts's
  // isOidcConfigured()) rather than being conditionally added here, so the
  // config's shape doesn't change based on environment.
  endpoints: [...healthEndpoints, ...oidcEndpoints],
  plugins: [
    s3Storage({
      collections: { media: true },
      bucket: process.env.S3_BUCKET || 'baobab-media',
      // Disabled unless an endpoint is configured — local development can
      // still run against the filesystem-free default, but production
      // MUST set S3_ENDPOINT/S3_BUCKET (ADR-0016 §10-13). The bundled
      // docker-compose MinIO service sets these for you.
      enabled: Boolean(process.env.S3_ENDPOINT || process.env.S3_BUCKET),
      config: {
        region: process.env.S3_REGION || 'us-east-1',
        endpoint: process.env.S3_ENDPOINT,
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE !== 'false',
        credentials: {
          accessKeyId: process.env.S3_ACCESS_KEY_ID || 'minioadmin',
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || 'minioadmin',
        },
      },
    }),
  ],
  graphQL: {
    disable: false,
  },
  cors: [process.env.CORS_ORIGIN || '*'],
  csrf: [process.env.CSRF_ORIGIN || 'http://localhost:3000'],
  typescript: {
    outputFile: path.resolve(dirname, 'src/payload-types.ts'),
  },
  localization: {
    locales: ['en', 'fr', 'af'],
    defaultLocale: 'en',
  },
});
