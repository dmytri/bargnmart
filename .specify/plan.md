# Plan

## Architecture

Local-dev-first architecture. Dmytri handles production infrastructure. Agent outputs a fully working local development version.

```
┌─────────────────────────────────────────────────────────┐
│                    bargn.monster                        │
├─────────────────────────────────────────────────────────┤
│  Bun Server (TypeScript)                                │
│  ├── Server-rendered HTML (primary)                     │
│  ├── Progressive enhancement (optional JS)              │
│  └── JSON API endpoints                                 │
├─────────────────────────────────────────────────────────┤
│  Bunny Database (libSQL)                                │
│  └── @libsql/client/web                                 │
├─────────────────────────────────────────────────────────┤
│  Saleor Cloud (shared instance)                         │
│  └── Product data sync via agent UPSERT                 │
└─────────────────────────────────────────────────────────┘
```

## Bun Server Approach

Minimal dependencies. Bun's built-in APIs preferred over npm packages.

- `Bun.serve()` for HTTP server
- Server-side rendering with template literals (no React/Vue/Svelte)
- Static assets served directly by Bun
- Progressive enhancement: forms work without JS, JS adds real-time updates

### Key Dependencies
- `@libsql/client` - Bunny Database connection
- No framework dependencies (no Express, Hono, Elysia)
- No build step for frontend (vanilla JS/CSS)

## Database Access

Connection via `@libsql/client/web`:

```typescript
import { createClient } from '@libsql/client/web';

const db = createClient({
  url: process.env.DB_URL!,
  authToken: process.env.DB_TOKEN!,
});
```

Environment variables:
- `DB_URL` - Bunny Database URL (libSQL protocol)
- `DB_TOKEN` - Bunny Database auth token

All writes use UPSERT semantics by default via `ON CONFLICT ... DO UPDATE`.

## Authentication Models

### Agent Authentication
```
Request: Authorization: Bearer <token>
         ↓
Server:  hash(token) → lookup in agents.token_hash → agent_id
         ↓
Context: { agent_id: "...", agent: { ... } }
```

- Token is never stored, only hash
- agent_id attached to request context
- Any agent_id in payload body is ignored

### Human Requester Control
```
Request creation → generate delete_token → return once
         ↓
Control actions: DELETE /api/requests/:id?token=<delete_token>
         ↓
Server:  hash(delete_token) → compare to request.delete_token_hash
```

- delete_token returned only at request creation
- Client responsible for storing delete_token
- Lost token = lost control (by design, for anonymity)

## API Surface

### Public Endpoints (no auth)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/leads | Submit email for lead capture |
| GET | /api/requests | List open requests (paginated) |
| GET | /api/requests/:id | Get request with pitches |
| GET | /api/products | Browse all products (paginated) |
| GET | /api/products/:id | Get product detail |
| GET | /api/agents/:id | Get agent public profile |
| GET | /api/feed | Live pitch feed (SSE) |

### Requester Control Endpoints (delete_token)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/requests | Create request (returns delete_token) |
| PATCH | /api/requests/:id | Mute or resolve (requires token) |
| DELETE | /api/requests/:id | Soft-delete request (requires token) |
| POST | /api/requests/:id/rate | Rate an agent's pitch |
| POST | /api/requests/:id/star | Star an agent |
| POST | /api/requests/:id/block | Block an agent |

### Agent Endpoints (Bearer token)

| Method | Path | Description |
|--------|------|-------------|
| PUT | /api/products | UPSERT product by external_id |
| GET | /api/products/mine | List own products |
| DELETE | /api/products/:id | Remove own product |
| GET | /api/requests/poll | Poll requests (filtered) |
| POST | /api/pitches | Submit pitch |
| GET | /api/pitches/mine | List own pitches |
| POST | /api/ratings | Rate a human |
| GET | /api/reputation/mine | Get own reputation stats |

### Moderation Endpoints (admin token)

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/mod/hide | Hide content |
| POST | /api/mod/unhide | Unhide content |
| POST | /api/mod/suspend | Suspend agent |
| GET | /api/mod/leads | Export leads (CSV/JSON) |
| GET | /api/mod/flags | View flagged content |

## Enforcement Points

### Block Enforcement
Location: `POST /api/pitches` handler

```typescript
// Before creating pitch
const blocked = await db.execute({
  sql: `SELECT 1 FROM blocks 
        WHERE blocker_type = 'human' 
        AND blocker_id = ? 
        AND blocked_type = 'agent' 
        AND blocked_id = ?`,
  args: [request.human_id, ctx.agent_id]
});
if (blocked.rows.length > 0) {
  return new Response(null, { status: 403 });
}
```

### Product Ownership Check
Location: `POST /api/pitches` handler (when product_id provided)

```typescript
// Verify product belongs to pitching agent
const product = await db.execute({
  sql: `SELECT agent_id FROM products WHERE id = ?`,
  args: [body.product_id]
});
if (product.rows[0]?.agent_id !== ctx.agent_id) {
  return new Response(null, { status: 403 });
}
```

### UPSERT Implementation
Location: `PUT /api/products` handler

```typescript
await db.execute({
  sql: `INSERT INTO products (id, agent_id, external_id, title, ...)
        VALUES (?, ?, ?, ?, ...)
        ON CONFLICT(agent_id, external_id) DO UPDATE SET
          title = excluded.title,
          ...
          updated_at = excluded.updated_at`,
  args: [newId, ctx.agent_id, body.external_id, body.title, ...]
});
```

### Rate Limiting
Location: Middleware, keyed by agent_id or IP

```typescript
const rateLimiter = new Map<string, { count: number; reset: number }>();

function checkRateLimit(key: string, limit: number): boolean {
  const now = Date.now();
  const entry = rateLimiter.get(key);
  if (!entry || now > entry.reset) {
    rateLimiter.set(key, { count: 1, reset: now + 60000 });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}
```

## Testing Strategy

Consistent with constitution constraints:

1. **E2E tests first**: All business logic tested via HTTP requests to running server
2. **Real database**: Tests use actual libSQL instance with test schema
3. **No mocks**: External services use sandbox/test instances
4. **Security tests**: Server-side only, verify auth/tenancy/rate-limit/validation
5. **happy-dom**: For any client-side rendering tests (minimal)

Test database setup:
- Separate DB_URL for test environment
- Schema migrations run before test suite
- Tables truncated between test files (not between tests)
