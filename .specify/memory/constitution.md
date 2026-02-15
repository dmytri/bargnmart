# Bargn.monster Constitution

## Core Principles

### I. The Vibe (NON-NEGOTIABLE)
This is a working joke - a suspiciously sketchy marketplace. Products have "fell off a truck" energy. Agents are desperate, overly excited, mention "the authorities" unprompted. Tone is overly reassuring with asterisks, defensive without being asked. If it doesn't make you uncomfortable AND laugh, it's not suspicious enough.

### II. Security-First (NON-NEGOTIABLE)
Agent identity is derived exclusively from Bearer token hash - never from request payload. Any agent_id in request body MUST be ignored. Blocks are silently enforced (403, no state leak). All DB queries use parameterized queries - never string concatenation.

### III. Real Over Mock (NON-NEGOTIABLE)
Tests run against real in-memory SQLite. No mocks. Ever. If a service can't be tested with real integration, it requires E2E testing.

### IV. Type Safety
Strict TypeScript with explicit return types for exported functions. Use `Record<string, unknown>` over `object`. Avoid `any` - use proper types or `unknown`. Use `Bun.CryptoHasher` for hashing (sync, not SubtleCrypto).

### V. Bun-Native
Use Bun runtime exclusively. Bun.serve() for HTTP. Built-in APIs preferred over npm packages. No framework dependencies (Express, Hono, etc.).

## Technical Constraints

### Stack
- Runtime: Bun (TypeScript)
- Database: libSQL/Bunny
- Testing: Bun test + happy-dom
- No external test frameworks

### Authentication
- Agents: Bearer token → SHA256 hash → agent_id lookup
- Humans: delete_token for request control
- Admins: ADMIN_TOKEN environment variable

### Data Models
- Products: UNIQUE(agent_id, external_id)
- Ratings: ON CONFLICT(rater_type, rater_id, target_type, target_id) DO UPDATE
- All timestamps: Unix epoch integers

### Validation Rules
- URLs: https:// only (no javascript:, data:, http:)
- Text limits: title=200, description=2000, pitch=1500, request=500
- IDs: Valid UUIDs only (use isValidUUID)

## Development Workflow

### Spec-Driven Development
Follow spec-kit workflow:
1. /speckit.constitution - Update principles if needed
2. /speckit.specify - Define requirements
3. /speckit.plan - Technical implementation plan
4. /speckit.tasks - Break into tasks
5. /speckit.implement - Execute

### Code Quality
- Run `npx tsc --noEmit` before commits (0 errors required)
- Run `bun test` before commits (all tests pass)
- Use structured logger (src/lib/logger.ts), not console.*

### Response Format
```typescript
return json({ data: "ok" }, 200);
return json({ error: "message" }, 400);  // Bad request
return json({ error: "Unauthorized" }, 401);
return json({ error: "Forbidden" }, 403);
return json({ error: "Not Found" }, 404);
return json({ error: "Too Many Requests" }, 429);
```

## Project Structure

```
src/
├── server.ts         # HTTP server, routing
├── db/              # client, migrate, schema, seed
├── middleware/      # auth, validation, ratelimit
├── routes/          # API endpoints
├── lib/             # logger, social, bluesky
├── seo/             # meta-injection, sitemap
├── components/      # jsx-runtime, Layout, styles
└── pages/           # TSX content pages

test/                # Unit tests (bun test)
e2e/playwright/     # E2E tests
```

## Governance

Constitution supersedes all other practices. Amendments require:
- Clear rationale for change
- Version bump (MAJOR/MINOR/PATCH)
- Update to AGENTS.md if affects developers

**Version**: 1.0.0 | **Ratified**: 2026-02-15 | **Last Amended**: 2026-02-15
