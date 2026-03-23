import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { Context, MiddlewareHandler, Next } from "hono";
import type { AuthVariables } from "./types.js";

export type { UserContext, AuthVariables } from "./types.js";

export interface ValidateJwtOptions {
  /** Keycloak issuer URL, e.g. http://localhost:8080/realms/yata */
  issuer: string;
  /** Keycloak JWKS endpoint URL */
  jwksUri: string;
  /** How many milliseconds to cache the JWKS. Default: 24 hours. */
  cacheDuration?: number;
}

interface CachedJwks {
  jwks: ReturnType<typeof createRemoteJWKSet>;
  fetchedAt: number;
}

/** Parses Keycloak realm roles from the JWT payload. */
function extractRoles(payload: JWTPayload): string[] {
  const realmAccess = (payload as Record<string, unknown>)["realm_access"] as
    | { roles?: string[] }
    | undefined;
  return realmAccess?.roles ?? [];
}

/**
 * Hono middleware that validates a Keycloak JWT from the Authorization header.
 * Attaches `{ userId, email, roles }` to context via `c.set("user", ...)`.
 * Returns 401 if the token is missing or invalid.
 */
export function validateJwt(options: ValidateJwtOptions): MiddlewareHandler<{ Variables: AuthVariables }> {
  const cacheDuration = options.cacheDuration ?? 24 * 60 * 60 * 1000;
  let cache: CachedJwks | null = null;

  function getJwks() {
    const now = Date.now();
    if (!cache || now - cache.fetchedAt > cacheDuration) {
      cache = {
        jwks: createRemoteJWKSet(new URL(options.jwksUri)),
        fetchedAt: now,
      };
    }
    return cache.jwks;
  }

  return async (c: Context<{ Variables: AuthVariables }>, next: Next) => {
    const authHeader = c.req.header("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, getJwks(), {
        issuer: options.issuer,
      });

      const userId = (payload.sub as string) ?? "";
      const email = (payload.email as string) ?? "";
      const roles = extractRoles(payload);

      c.set("user", { userId, email, roles });
    } catch {
      // Key may be rotated — try once with a fresh JWKS fetch
      cache = null;
      try {
        const { payload } = await jwtVerify(token, getJwks(), {
          issuer: options.issuer,
        });
        const userId = (payload.sub as string) ?? "";
        const email = (payload.email as string) ?? "";
        const roles = extractRoles(payload);
        c.set("user", { userId, email, roles });
      } catch {
        return c.json({ error: "Unauthorized" }, 401);
      }
    }

    await next();
  };
}

/**
 * Hono middleware that requires the authenticated user to have a specific role.
 * Must be used after `validateJwt`. Returns 403 if the role is missing.
 */
export function requireRole(role: string): MiddlewareHandler<{ Variables: AuthVariables }> {
  return async (c: Context<{ Variables: AuthVariables }>, next: Next) => {
    const user = c.get("user");
    if (!user?.roles.includes(role)) {
      return c.json({ error: "Forbidden" }, 403);
    }
    await next();
  };
}

/**
 * Returns the authenticated user from the Hono context.
 * Throws if `validateJwt` middleware has not run.
 */
export function getUser(c: Context<{ Variables: AuthVariables }>) {
  const user = c.get("user");
  if (!user) throw new Error("User context not set — validateJwt middleware must run first");
  return user;
}
