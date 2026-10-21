/** Codes are CMS-local selectors, never CP identities. Independently governed
 * estates supply their own profile; no corporate hierarchy grants tenant access. */
export interface EstateProfile {
  readonly firstPartyId?: string;
  readonly legalIdentityNote?: string;
  readonly registryName: string;
  readonly tenantCode: string;
  readonly organisationCode: string;
  readonly marketCode: string;
  readonly estateCode: string;
  readonly marketName: string;
  readonly estateName: string;
  readonly locale: string;
  readonly currency: string;
  readonly geography: readonly string[];
  readonly serviceEmail?: string;
  readonly maxProjectionAgeMs: number;
}

export const NABHOLD = {
  firstPartyId: 'NABHOLD',
  legalIdentityNote: 'The CIPC identity is recorded in the Shared registry as a claim (shared#252). The Control Plane has not verified it. The CMS deliberately stores none of the registration facts.',
  /**
   * Display (trading) name used for CMS labels and public copy. Shared's first-party registry holds the
   * CIPC legal name, "NABHOLD GROUP AFRICA (Pty) Ltd" (shared#252); the CMS stores no legal facts. See the runbook.
   */
  registryName: 'Nabhold Group Africa',
  tenantCode: 'nabhold',
  organisationCode: 'nabhold',
  marketCode: 'nabhold_za',
  estateCode: 'nabhold-corporate',
  locale: 'en-ZA',
  currency: 'ZAR',
  geography: ['ZA'],
  marketName: 'Nabhold South Africa',
  estateName: 'Nabhold Group Africa corporate estate',
  serviceEmail: 'svc-nabhold-content@baobab-cms.invalid',
  /** Maximum age of a projection before verification reports it stale. */
  maxProjectionAgeMs: 7 * 24 * 60 * 60 * 1000,
} as const;

