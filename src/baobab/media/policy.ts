/** ADR-0016 §20 — explicit access classification; null never means public. */
export const MediaAccessClass = {
  PUBLIC: 'PUBLIC',
  RESTRICTED: 'RESTRICTED',
  PRIVATE: 'PRIVATE',
} as const;
export type MediaAccessClass = (typeof MediaAccessClass)[keyof typeof MediaAccessClass];

/** ADR-0016 §42 — upload lifecycle. */
export const MediaLifecycleState = {
  UPLOADING: 'UPLOADING',
  SCANNING: 'SCANNING',
  READY: 'READY',
  QUARANTINED: 'QUARANTINED',
  PUBLISHED: 'PUBLISHED',
} as const;
export type MediaLifecycleState = (typeof MediaLifecycleState)[keyof typeof MediaLifecycleState];

export interface MediaUploadPolicy {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
}

/** ADR-0016 §38-39 — governed default; not a hard-coded organisation-specific rule. */
export const DEFAULT_MEDIA_UPLOAD_POLICY: MediaUploadPolicy = {
  maxSizeBytes: 25 * 1024 * 1024,
  allowedMimeTypes: [
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/avif',
    'image/svg+xml',
    'application/pdf',
  ],
};

export function isMimeTypeAllowed(mimeType: string, policy: MediaUploadPolicy = DEFAULT_MEDIA_UPLOAD_POLICY): boolean {
  return policy.allowedMimeTypes.includes(mimeType.toLowerCase());
}

export function isSizeAllowed(sizeBytes: number, policy: MediaUploadPolicy = DEFAULT_MEDIA_UPLOAD_POLICY): boolean {
  return Number.isFinite(sizeBytes) && sizeBytes > 0 && sizeBytes <= policy.maxSizeBytes;
}

/**
 * ADR-0016 §40 — a lightweight, dependency-free heuristic for the most
 * common unsafe-SVG payloads (inline script, event handlers, javascript:
 * URIs). This is not a substitute for a real malware/content scanner —
 * see `docs/architecture/media.md` for the documented scanner integration
 * point — but it catches the obvious cases before anything reaches
 * storage.
 */
export function containsUnsafeSvgMarkup(svgContent: string): boolean {
  const lowered = svgContent.toLowerCase();
  return (
    lowered.includes('<script') ||
    lowered.includes('javascript:') ||
    /on[a-z]+\s*=/.test(lowered) ||
    lowered.includes('<foreignobject')
  );
}

/** ADR-0016 §15 — logical storage partitioning is defence in depth, not the sole control. */
export function buildTenantScopedStorageKey(params: {
  tenantId: string;
  canonicalMediaId: string;
  filename: string;
}): string {
  // Object-store prefixes are not an authority boundary, but must never
  // accept traversal or ambiguous identity segments from external callers.
  const safeIdentity = (value: string, name: string) => {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/.test(value) || value === '..') {
      throw new Error(`Invalid ${name} in media storage key`);
    }
    return value;
  };
  const safeName = params.filename.split(/[\\/]/).pop()?.replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!safeName || safeName === '.' || safeName === '..') throw new Error('Invalid media filename');
  return `tenants/${safeIdentity(params.tenantId, 'tenant')}/media/${safeIdentity(params.canonicalMediaId, 'canonical media ID')}/${safeName}`;
}
