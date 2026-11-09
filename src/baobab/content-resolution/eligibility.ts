import type { ResolvableRecord } from './types.js';

/** ADR-0014 §45-46 — only eligible publication state participates in resolution. */
export function isPublicationEligible(record: ResolvableRecord, previewMode: boolean | undefined): boolean {
  if (previewMode) return record.publicationState !== 'ARCHIVED';
  return record.publicationState === 'PUBLISHED';
}

/** Reject invalid/missing temporal boundaries rather than silently treating NaN as eligible. */
export function isTemporallyEligible(record: ResolvableRecord, atISO: string): boolean {
  const at = Date.parse(atISO);
  if (!Number.isFinite(at)) return false;
  const from = record.effectiveFrom === undefined ? undefined : Date.parse(record.effectiveFrom);
  const to = record.effectiveTo === undefined ? undefined : Date.parse(record.effectiveTo);
  if (from !== undefined && !Number.isFinite(from)) return false;
  if (to !== undefined && !Number.isFinite(to)) return false;
  if (from !== undefined && to !== undefined && from > to) return false;
  if (from !== undefined && at < from) return false;
  if (to !== undefined && at > to) return false;
  return true;
}
