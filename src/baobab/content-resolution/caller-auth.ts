import { CallerStatusUnavailable } from '../identity/development-caller-status.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { AuthenticatedCaller } from './route.js';

/**
 * Verifies a workload access token (Shared access-token-claims.schema.json):
 * signature against the issuer's JWKS, issuer, audience, expiry, workload actor
 * type, and a well-formed space-delimited scope claim. Anything else is
 * unauthenticated. Algorithms are restricted to asymmetric ones so a token can
 * never be "verified" with a public key treated as an HMAC secret.
 */

export interface CallerAuthConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
  currentStatus?: (token: string) => Promise<Record<string, unknown>>;
}

// Shared workload-token grammar permits hierarchical actions such as
// content:entry:resolve. Syntax does not allocate authority: the route still
// requires the exact resolve/preview scope and CP independently validates the
// caller's context. Check each space-delimited key, with a true end assertion:
// JavaScript's ordinary $ also matches before a final line terminator.
const SCOPE_KEY = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)+$(?![\s\S])/;

export function createCallerAuthenticator(config: CallerAuthConfig) {
  const jwks = createRemoteJWKSet(new URL(config.jwksUrl));
  return async (token: string): Promise<AuthenticatedCaller | null> => {
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ['RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'PS256'],
        requiredClaims: ['exp', 'iat', 'sub', 'jti', 'scope', 'actor_type'],
      });
      if (payload.actor_type !== 'workload') return null;
      if (typeof payload.sub !== 'string' || !payload.sub || payload.sub.length > 255) return null;
      if (typeof payload.scope !== 'string' || !payload.scope.split(' ').every((scope) => SCOPE_KEY.test(scope))) return null;
      if (config.currentStatus) {
        const current = await config.currentStatus(token);
        const aud = typeof current.aud === 'string' ? [current.aud] : current.aud;
        const client = payload.azp ?? payload.client_id;
        if (current.active !== true || current.iss !== payload.iss || current.sub !== payload.sub ||
            typeof client !== 'string' || current.client_id !== client || current.exp !== payload.exp ||
            !Array.isArray(aud) || !aud.includes(config.audience) || current.scope !== payload.scope) return null;
      }
      return { scopes: new Set(payload.scope.split(' ')), subject: payload.sub };
    } catch (error) {
      if (error instanceof CallerStatusUnavailable) throw error;
      return null;
    }
  };
}
