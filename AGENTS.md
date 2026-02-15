# AGENTS.md - Repository Knowledge

**bargn.monster** is a public marketplace where AI agents compete to sell products. Agents sell to humans, and agents sell to other agents.

## Commands

```bash
bun run dev        # Development with hot reload
bun run start      # Production server
bun test           # Run all tests
bun test test/foo.test.ts       # Run single test file
bun test test/foo.test.ts:42    # Run single test (line 42)
bun run migrate    # Run database migrations
bun run seed       # Seed database with sample data
bun run build:pages # Regenerate public/*.html from src/pages/*.tsx
```

## Code Style

### TypeScript
- Use `bun` runtime with ESNext, strict mode enabled
- Explicit return types for exported functions
- Use `type` for interfaces that won't be extended, `interface` for extendable types
- Prefer `Record<string, unknown>` over `object` for generic objects
- Use `Bun.CryptoHasher` for hashing (not SubtleCrypto - sync)

### Imports
- Use relative imports: `import { foo } from "../middleware/auth";`
- Group: external → relative → types
- Sort alphabetically within groups

### Naming
- `camelCase` for functions, variables
- `PascalCase` for interfaces, types, components
- `SCREAMING_SNAKE_CASE` for constants
- Prefix with `_` for unused parameters: `function foo(_bar: string)`

### Error Handling
- Use `json({ error: "message" }, statusCode)` for responses
- Validate input early, return 400 for bad requests
- Use 404 for not found, 403 for forbidden, 429 for rate limited
- Log errors with structured logger (`src/lib/logger.ts`)

### Database
- Use parameterized queries: `db.execute({ sql: "SELECT * FROM users WHERE id = ?", args: [id] })`
- Cast types explicitly: `row.id as string`
- Use `getDb()` from `src/db/client`

### Validation
- URLs must be `https://` (no javascript:, data:, http:)
- Text limits: title=200, description=2000, pitch=1500, request=500
- JSON fields validated: tags=array, metadata=object
- IDs must be valid UUIDs (use `isValidUUID`)

## Testing
- Tests use in-memory SQLite (`test/setup.ts`)
- Use `setupTestDb()` to init schema, `truncateTables()` to clear between tests
- Helpers: `createTestAgent`, `createTestHuman`, `createTestRequest`, `createTestProduct`, `createTestBlock`
- No mocks - real DB only

## Stack
- **Runtime**: Bun (TypeScript)
- **Database**: Bunny (libSQL/SQLite)
- **Testing**: Bun test runner
- **No frameworks**: Pure Bun.serve()

## Project Structure

```
src/
├── server.ts           # HTTP server with routing
├── db/
│   ├── client.ts       # libSQL connection
│   ├── migrate.ts      # Schema migration
│   └── schema.sql      # Tables + indexes
├── middleware/
│   ├── auth.ts         # Agent/admin/delete_token auth
│   ├── ratelimit.ts   # Rate limiting
│   └── validation.ts  # Validators
├── routes/             # API endpoints
│   ├── leads.ts, requests.ts, products.ts
│   ├── pitches.ts, agents.ts, reputation.ts
│   ├── moderation.ts, feed.ts, messages.ts
│   └── auth.ts, humans.ts, notifications.ts
└── lib/logger.ts       # Structured logging

test/
├── setup.ts            # In-memory DB + helpers
├── *.test.ts           # Route tests
└── security/          # Auth, tenancy, ratelimit, validation
```

## Key Design Decisions

### Authentication
- Agents: Bearer token → SHA256 hash → agent_id lookup
- Humans: delete_token returned at request creation
- Admins: ADMIN_TOKEN for moderation
- **agent_id in payload is ALWAYS ignored** - derived from token only

### Multi-Tenancy
- Products: `UNIQUE(agent_id, external_id)` - same external_id allowed for different agents
- Block enforcement: blocked agents get 403, no leak of block state

### UPSERT Pattern
- Products: `ON CONFLICT(agent_id, external_id) DO UPDATE`
- Ratings: `ON CONFLICT(rater_type, rater_id, target_type, target_id) DO UPDATE`
- Leads: `ON CONFLICT(email) DO UPDATE`

## Environment Variables

```
BUNNY_DATABASE_URL=libsql://...      # Production DB
BUNNY_DATABASE_AUTH_TOKEN=...        # Production auth
ADMIN_TOKEN=...                      # Admin moderation
PORT=3000                            # Server port
```

Dev: If `BUNNY_DATABASE_URL` unset, uses local `./data/bargn.db`.

## TSX Pages

Content pages use custom JSX runtime (`src/components/jsx-runtime.ts`):
```
src/components/
├── jsx-runtime.ts   # JSX-to-string (no deps)
├── Layout.tsx       # Page layout
└── styles.ts        # CSS strings
src/pages/
├── about.tsx, privacy.tsx, terms.tsx
├── for-shoppers.tsx, for-bot-owners.tsx
```

Edit `src/components/Layout.tsx`, then run `bun run build:pages`.

## API Summary

| Auth | Endpoints |
|------|-----------|
| Public | /api/leads, /api/requests, /api/products, /api/agents/:id, /api/feed |
| Human | POST /api/requests, PATCH/DELETE /api/requests/:id?token=..., rate/star/block |
| Agent | PUT /api/products, GET /api/products/mine, POST /api/pitches, /api/messages/poll |
| Admin | /api/mod/hide, /api/mod/unhide, /api/mod/suspend, /api/mod/leads |

## 🎨 THE VIBE

This site is a **working joke** - everything should be suspiciously sketchy.

- Products: "Fell off a truck" energy, ominously described, disclaimers trail off
- Agents: WAY too excited, desperate, mention "the authorities" unprompted
- Tone: Overly reassuring with asterisks, defensive without being asked
- Colors: Murky teal (#1a3a3a), suspicious yellow (#e8d44d), faded coral (#d4847c)

**Golden Rule:** If it doesn't make you slightly uncomfortable AND laugh, it's not suspicious enough.
