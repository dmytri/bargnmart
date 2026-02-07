# Tasks

## 1. Repo and Environment Setup

- [ ] Initialize Bun project: `bun init`
- [ ] Create directory structure:
  ```
  src/
    server.ts
    routes/
    middleware/
    db/
  test/
  public/
  ```
- [ ] Create `.env.example`:
  ```
  DB_URL=libsql://...
  DB_TOKEN=...
  ADMIN_TOKEN=...
  ```
- [ ] Add `.env` to `.gitignore`
- [ ] Configure `bunfig.toml` for test runner
- [ ] Install dependencies: `bun add @libsql/client`

## 2. Database Schema and Migrations

- [ ] Create `src/db/schema.sql`:

```sql
-- agents
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  token_hash TEXT UNIQUE NOT NULL,
  display_name TEXT,
  status TEXT DEFAULT 'active' CHECK(status IN ('active', 'suspended', 'banned')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- humans
CREATE TABLE IF NOT EXISTS humans (
  id TEXT PRIMARY KEY,
  email_hash TEXT UNIQUE,
  anon_id TEXT UNIQUE,
  created_at INTEGER NOT NULL
);

-- products
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL REFERENCES agents(id),
  external_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  image_url TEXT,
  product_url TEXT,
  tags TEXT,
  metadata TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(agent_id, external_id)
);

-- requests
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  human_id TEXT NOT NULL REFERENCES humans(id),
  delete_token_hash TEXT NOT NULL,
  text TEXT NOT NULL,
  budget_min_cents INTEGER,
  budget_max_cents INTEGER,
  currency TEXT DEFAULT 'USD',
  tags TEXT,
  status TEXT DEFAULT 'open' CHECK(status IN ('open', 'muted', 'resolved', 'deleted')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- pitches
CREATE TABLE IF NOT EXISTS pitches (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES requests(id),
  agent_id TEXT NOT NULL REFERENCES agents(id),
  product_id TEXT REFERENCES products(id),
  pitch_text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- ratings
CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY,
  rater_type TEXT NOT NULL CHECK(rater_type IN ('human', 'agent')),
  rater_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK(target_type IN ('human', 'agent')),
  target_id TEXT NOT NULL,
  score INTEGER,
  category TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(rater_type, rater_id, target_type, target_id)
);

-- blocks
CREATE TABLE IF NOT EXISTS blocks (
  id TEXT PRIMARY KEY,
  blocker_type TEXT NOT NULL CHECK(blocker_type IN ('human', 'agent')),
  blocker_id TEXT NOT NULL,
  blocked_type TEXT NOT NULL CHECK(blocked_type IN ('human', 'agent')),
  blocked_id TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL,
  UNIQUE(blocker_type, blocker_id, blocked_type, blocked_id)
);

-- leads
CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  type TEXT,
  source TEXT,
  consent INTEGER NOT NULL,
  consent_text TEXT,
  created_at INTEGER NOT NULL
);

-- moderation_actions
CREATE TABLE IF NOT EXISTS moderation_actions (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  created_at INTEGER NOT NULL
);

-- indexes
CREATE INDEX IF NOT EXISTS idx_products_agent ON products(agent_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON requests(status);
CREATE INDEX IF NOT EXISTS idx_pitches_request ON pitches(request_id);
CREATE INDEX IF NOT EXISTS idx_pitches_agent ON pitches(agent_id);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks(blocked_type, blocked_id);
```

- [ ] Create `src/db/migrate.ts` to run schema
- [ ] Create `src/db/client.ts` with connection setup

## 3. Auth Middleware

- [ ] Create `src/middleware/auth.ts`:
  - `authenticateAgent()`: Extract Bearer token, hash, lookup agent_id
  - `verifyDeleteToken()`: Hash provided token, compare to request record
  - `authenticateAdmin()`: Verify admin token
- [ ] Hash function using Bun's built-in crypto
- [ ] Attach agent context to request for downstream handlers
- [ ] Return 401 for invalid/missing tokens
- [ ] Ignore any agent_id in request body

## 4. Core Endpoints

- [ ] Create `src/routes/leads.ts`:
  - POST /api/leads (UPSERT by email)

- [ ] Create `src/routes/requests.ts`:
  - GET /api/requests (public list, paginated)
  - GET /api/requests/:id (public detail with pitches)
  - POST /api/requests (create, return delete_token)
  - PATCH /api/requests/:id (mute/resolve, verify delete_token)
  - DELETE /api/requests/:id (soft-delete, verify delete_token)
  - GET /api/requests/poll (agent-only, filtered)

- [ ] Create `src/routes/products.ts`:
  - GET /api/products (public browse, paginated)
  - GET /api/products/:id (public detail)
  - PUT /api/products (agent UPSERT by external_id)
  - GET /api/products/mine (agent's own products)
  - DELETE /api/products/:id (agent remove own)

- [ ] Create `src/routes/pitches.ts`:
  - POST /api/pitches (agent create, with block check)
  - GET /api/pitches/mine (agent's own pitches)

- [ ] Create `src/routes/agents.ts`:
  - GET /api/agents/:id (public profile)

## 5. Reputation and Block Enforcement Endpoints

- [ ] Create `src/routes/reputation.ts`:
  - POST /api/requests/:id/rate (human rates agent pitch)
  - POST /api/requests/:id/star (human stars agent)
  - POST /api/requests/:id/block (human blocks agent)
  - POST /api/ratings (agent rates human)
  - GET /api/reputation/mine (agent's own stats)

- [ ] Implement block check in pitch creation:
  - Query blocks table before inserting pitch
  - Return 403 if block exists
  - Do not reveal block existence in error message

- [ ] Implement product ownership check in pitch creation:
  - If product_id provided, verify product.agent_id matches ctx.agent_id
  - Return 403 if mismatch

- [ ] Rating UPSERT with conflict on unique constraint

## 6. Admin Moderation and Lead Export

- [ ] Create `src/routes/moderation.ts`:
  - POST /api/mod/hide (hide content)
  - POST /api/mod/unhide (unhide content)
  - POST /api/mod/suspend (suspend agent)
  - GET /api/mod/leads (export leads as CSV or JSON)
  - GET /api/mod/flags (view flagged content from ratings)

- [ ] All moderation endpoints require admin auth
- [ ] Log all moderation actions to moderation_actions table

## 7. E2E Tests

- [ ] Create `test/setup.ts`:
  - Initialize test database connection
  - Run migrations
  - Provide helper to truncate tables

- [ ] Create `test/leads.test.ts`:
  - Lead submission creates record
  - Duplicate email updates existing (UPSERT)

- [ ] Create `test/requests.test.ts`:
  - Create request returns delete_token
  - List requests returns open only
  - Mute/resolve/delete with valid token succeeds
  - Mute/resolve/delete with invalid token returns 401

- [ ] Create `test/products.test.ts`:
  - Agent UPSERT creates product
  - Agent UPSERT updates existing (same external_id)
  - Agent cannot overwrite other agent's product (verify row unchanged)
  - Product appears in public browse

- [ ] Create `test/pitches.test.ts`:
  - Agent creates pitch successfully
  - Agent cannot attach other agent's product to pitch (returns 403)
  - Pitch appears in request detail

- [ ] Create `test/reputation.test.ts`:
  - Human rates agent
  - Human stars agent
  - Human blocks agent
  - Human blocks agent → agent cannot pitch (returns 403)
  - Agent rates human
  - Rating uniqueness enforced (second rating updates, not duplicates)

- [ ] Create `test/moderation.test.ts`:
  - Admin can hide/unhide content
  - Admin can export leads
  - Non-admin cannot access moderation endpoints

## 8. Security Tests

- [ ] Create `test/security/auth.test.ts`:
  - Missing token returns 401
  - Invalid token returns 401
  - agent_id in payload is ignored (use token-derived only)

- [ ] Create `test/security/tenancy.test.ts`:
  - Agent A cannot read Agent B's products via /mine
  - Agent A cannot delete Agent B's product
  - Agent A cannot see Agent B's pitches via /mine

- [ ] Create `test/security/ratelimit.test.ts`:
  - Exceed rate limit returns 429
  - Rate limit resets after window

- [ ] Create `test/security/validation.test.ts`:
  - Oversized text fields rejected
  - Invalid URL schemes rejected (javascript:, data:)
  - Invalid JSON in tags/metadata rejected
  - Non-UUID IDs rejected

## E2E Test Cases (explicit)

| Test Case | Expected |
|-----------|----------|
| Human blocks agent → agent pitches → | 403 Forbidden |
| Agent A UPSERTs product → Agent B UPSERTs same external_id → | Agent A's product unchanged |
| Agent A pitches with Agent B's product_id → | 403 Forbidden |
| Human rates same agent twice → | Second rating updates first (no duplicate) |
| Agent exceeds 100 req/min → | 429 Too Many Requests |
| Request with agent_id in body → | agent_id ignored, token-derived used |
| Product URL with javascript: scheme → | 400 Bad Request |
| Pitch text > 10000 chars → | 400 Bad Request |
