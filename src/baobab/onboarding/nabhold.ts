/** Nabhold compatibility entry point. Its non-production/local-only and
 * delivery-only restrictions are enforced by the shared estate reconciler. */
import { NABHOLD } from './profiles.js';
import { onboardEstate, type ProjectionRepository, type OnboardingOptions } from './estate.js';
export { NABHOLD };
export * from './estate.js';
export const onboardNabhold = (repo: ProjectionRepository, options: OnboardingOptions) => onboardEstate(repo, NABHOLD, options);
