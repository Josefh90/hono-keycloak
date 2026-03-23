# @josefh90/hono-keycloak

Hono middleware for **Keycloak JWT authentication**.

Validates `Authorization: Bearer <token>` headers against a Keycloak realm, attaches the authenticated user to the request context, and provides a role-guard middleware.

## Install

```bash
npm install @josefh90/hono-keycloak
```

Configure your `.npmrc` to use GitHub Packages for the `@josefh90` scope:

```
@josefh90:registry=https://npm.pkg.github.com
```

## Usage

### Basic setup

```ts
import { Hono } from "hono";
import { validateJwt, requireRole, getUser } from "@josefh90/hono-keycloak";

const app = new Hono();

// Protect all routes under /api
app.use(
  "/api/*",
  validateJwt({
    issuer: "https://your-keycloak.example.com/realms/your-realm",
    jwksUri: "https://your-keycloak.example.com/realms/your-realm/protocol/openid-connect/certs",
  })
);

app.get("/api/me", (c) => {
  const user = getUser(c);
  return c.json({ userId: user.userId, email: user.email, roles: user.roles });
});

// Role guard — returns 403 if the user doesn't have the "admin" role
app.delete("/api/admin/resource", requireRole("admin"), (c) => {
  return c.json({ ok: true });
});
```

### TypeScript types

The middleware attaches a typed `user` variable to the Hono context. Use `AuthVariables` as the type parameter for full type safety:

```ts
import type { AuthVariables } from "@josefh90/hono-keycloak";

const app = new Hono<{ Variables: AuthVariables }>();
```

## API

### `validateJwt(options)`

Hono middleware that validates a Keycloak JWT from the `Authorization: Bearer` header.

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `issuer` | `string` | required | Keycloak issuer URL, e.g. `https://…/realms/myrealm` |
| `jwksUri` | `string` | required | Keycloak JWKS endpoint URL |
| `cacheDuration` | `number` | `86400000` (24h) | JWKS cache duration in milliseconds |

On success, attaches `{ userId, email, roles }` to `c.get("user")`.
On failure, returns `401 Unauthorized`.

JWKS keys are cached and automatically refreshed when a verification fails (handles key rotation).

---

### `requireRole(role)`

Hono middleware that checks whether the authenticated user has a specific realm role.
Must be used **after** `validateJwt`. Returns `403 Forbidden` if the role is missing.

```ts
app.get("/admin", requireRole("admin"), handler);
```

---

### `getUser(c)`

Returns the `UserContext` from the Hono context.

```ts
interface UserContext {
  userId: string;   // Keycloak subject (sub)
  email: string;    // User email
  roles: string[];  // Keycloak realm roles
}
```

Throws if `validateJwt` has not run for the request.

## Requirements

- Node.js 18+
- [Hono](https://hono.dev) v4+
- A running Keycloak instance

## License

MIT
