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
}

const SCOPE = /^[a-z][a-z0-9.-]*:[a-z][a-z0-9.-]*(?: [a-z][a-z0-9.-]*:[a-z][a-z0-9.-]*)*$/;

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
      if (typeof payload.scope !== 'string' || !SCOPE.test(payload.scope)) return null;
      return { scopes: new Set(payload.scope.split(' ')) };
    } catch {
      return null;
    }
  };
}
