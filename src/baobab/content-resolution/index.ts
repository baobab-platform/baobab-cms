export { InheritanceMode, OPTIONAL_DIMENSION_PRIORITY, AmbiguousResolutionError } from './types.js';
export type {
  OptionalDimension,
  PublicationState,
  ResolvableRecord,
  ResolutionRequest,
  ResolutionPolicy,
  ResolutionResult,
  ResolutionTraceStep,
} from './types.js';
export { buildSpecificityLevels, isEligible, matchesLevel } from './specificity.js';
export type { SpecificityLevel } from './specificity.js';
export { resolveLocaleChain } from './fallback.js';
export { isPublicationEligible, isTemporallyEligible } from './eligibility.js';
export { resolveContent, resolveComposedContent } from './resolver.js';
export {
  handleContentResolve,
  parseContentResolveRequest,
  publicationStateFromStatus,
} from './contract.js';
export type {
  ContentEntryRecord,
  ContentResolveDependencies,
  ContentResolveOutcome,
  ContentResolveRequestDto,
  ContentResolveResponseDto,
  ProblemDetails,
  TrustedContentContext,
} from './contract.js';
