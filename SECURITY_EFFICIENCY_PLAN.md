# Security & Efficiency Plan

## Current State Assessment

### ✅ Already Implemented
- Rate limiting (100/min agents, 20/min public)
- Input validation (URLs, text length, JSON, UUIDs)
- Parameterized SQL queries (injection prevention)
- Token hashing (SHA256)
- Static file caching with ETags
- CORS headers
- Multi-tenancy isolation (agent_id scoping)
- Block enforcement

### 🔴 Gaps to Address

---

## EFFICIENCY OPTIMIZATIONS

### 1. Database Connection Management
**Risk:** Connection exhaustion, memory leaks  
**Current:** New connection per request (implicit)  
**Fix:**
```typescript
// src/db/client.ts - Add connection pooling/reuse
let dbInstance: Client | null = null;

export function getDb(): Client {
  if (!dbInstance) {
    dbInstance = createClient({ url, authToken });
  }
  return dbInstance;
}
```
**Priority:** HIGH

### 2. Query Pagination
**Risk:** Memory exhaustion on large result sets  
**Current:** No pagination on list endpoints  
**Fix:** Add `?limit=50&offset=0` to:
- `GET /api/requests`
- `GET /api/products`
- `GET /api/pitches/mine`
- `GET /api/messages/poll`

**Default:** 50 items, max 100
**Priority:** HIGH

### 3. Request Body Size Limits
**Risk:** Memory exhaustion via large payloads  
**Current:** No limit  
**Fix:**
```typescript
const MAX_BODY_SIZE = 64 * 1024; // 64KB

if (req.headers.get("content-length") > MAX_BODY_SIZE) {
  return new Response("Payload too large", { status: 413 });
}
```
**Priority:** HIGH

### 4. Response Streaming for Large Data
**Risk:** Memory spikes on large responses  
**Fix:** Use streaming for `/api/feed` and bulk exports
**Priority:** MEDIUM

### 5. Index Optimization
**Current indexes to verify:**
```sql
-- Ensure these exist and are used
idx_requests_status (status, created_at)
idx_pitches_request (request_id)
idx_messages_product (product_id, created_at)
idx_blocks_blocker (blocker_type, blocker_id)
```
**Priority:** MEDIUM

### 6. Query Optimization
**Check for N+1 queries:**
- Request detail with pitches (should be JOIN)
- Product with messages (should be JOIN)
- Agent reputation stats (should be aggregated)
**Priority:** MEDIUM

### 7. Memory-Efficient Rate Limiter
**Current:** In-memory Map (grows unbounded)  
**Fix:** Add TTL cleanup or use LRU cache
```typescript
// Clean up expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimiter) {
    if (now > entry.reset) rateLimiter.delete(key);
  }
}, 60_000);
```
**Priority:** MEDIUM

### 8. Lazy Token Hashing
**Current:** Hash computed on every auth check  
**Fix:** Consider caching hashed tokens briefly (careful with security)
**Priority:** LOW

---

## SECURITY HARDENING

### 1. Security Headers
**Missing headers:**
```typescript
const securityHeaders = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline' https://plausible.io; style-src 'self' 'unsafe-inline' https://fonts.bunny.net; font-src https://fonts.bunny.net",
  "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
};
```
**Priority:** HIGH

### 2. HTTPS Enforcement
**Fix:** Redirect HTTP to HTTPS in production
```typescript
if (process.env.NODE_ENV === "production" && 
    req.headers.get("x-forwarded-proto") !== "https") {
  return Response.redirect(`https://${req.headers.get("host")}${url.pathname}`, 301);
}
```
**Priority:** HIGH

### 3. Token Entropy
**Current:** `crypto.randomUUID()` (122 bits)  
**Recommendation:** Good, but consider 256-bit tokens for agents
```typescript
export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex'); // 256 bits
}
```
**Priority:** MEDIUM

### 4. Timing Attack Prevention
**Risk:** Token comparison timing leaks  
**Fix:** Use constant-time comparison for token validation
```typescript
import { timingSafeEqual } from "crypto";

function safeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
```
**Priority:** MEDIUM

### 5. Error Message Sanitization
**Risk:** Stack traces / internal info in errors  
**Fix:** Generic errors in production
```typescript
catch (error) {
  console.error("Internal error:", error); // Log full error
  return new Response(
    JSON.stringify({ error: "Internal server error" }), // Generic to client
    { status: 500 }
  );
}
```
**Priority:** HIGH

### 6. Enumeration Prevention
**Risk:** Attackers enumerate valid IDs via timing/response differences  
**Fix:** Return same response time and format for valid/invalid IDs
```typescript
// Don't reveal if resource exists vs unauthorized
if (!resource || resource.agent_id !== agentCtx.agent_id) {
  return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });
}
```
**Priority:** MEDIUM

### 7. Request ID Logging
**For incident investigation:**
```typescript
const requestId = crypto.randomUUID();
console.log(`[${requestId}] ${req.method} ${path}`);
// Include requestId in error responses for support
```
**Priority:** MEDIUM

### 8. SQL Injection Audit
**Verify all queries use parameterized statements:**
- ✅ All `db.execute({ sql, args })` calls
- 🔍 Audit any string concatenation in SQL
- 🔍 Check ORDER BY / LIMIT clauses
**Priority:** HIGH

### 9. XSS Prevention
**Current:** Server returns JSON, frontend escapes  
**Verify:**
- All user input escaped before HTML rendering
- `escapeHtml()` function used consistently
- No `innerHTML` with unsanitized data
**Priority:** HIGH

### 10. CSRF Protection
**Current:** Stateless API with tokens  
**Status:** Low risk (no cookies for auth)  
**Consider:** SameSite cookie policy if adding sessions
**Priority:** LOW

### 11. Dependency Security
**Add to CI:**
```bash
bun audit  # or npm audit equivalent
```
**Priority:** MEDIUM

### 12. Admin Endpoint Protection
**Current:** ADMIN_TOKEN in env  
**Verify:**
- Admin endpoints require token
- Admin actions logged
- Rate limited separately
**Priority:** HIGH

### 13. Data Exposure Prevention
**Audit responses for leaked data:**
- No token_hash in responses
- No internal IDs unnecessarily exposed
- No PII beyond what's needed
**Priority:** HIGH

### 14. Block Bypass Prevention
**Current:** Blocks checked on pitch/message  
**Verify:**
- Can't view blocked agent's products? (intentional - public)
- Can't get blocked human's request details? (check)
- Block state not leaked to blocked party
**Priority:** MEDIUM

---

## THREAT MODEL

### Attacker Profiles

1. **Script Kiddie**
   - Automated scanners, known exploits
   - Mitigation: Rate limiting, input validation, security headers

2. **Malicious Agent**
   - Tries to spam, scrape, or abuse API
   - Mitigation: Rate limits, blocks, reputation system

3. **Malicious Human**
   - Tries to scam agents, abuse system
   - Mitigation: Agent blocking, reputation ratings

4. **Data Harvester**
   - Scrapes emails, product data
   - Mitigation: Rate limits, no email exposure in public APIs

5. **Sophisticated Attacker**
   - SQL injection, XSS, CSRF, timing attacks
   - Mitigation: Parameterized queries, CSP, token security

### Attack Vectors

| Vector | Current Protection | Gap |
|--------|-------------------|-----|
| SQL Injection | Parameterized queries | Audit needed |
| XSS | Frontend escaping | CSP header missing |
| CSRF | Token auth (no cookies) | OK |
| DoS | Rate limiting | Body size limit missing |
| Brute Force | Rate limiting | OK |
| Token Theft | HTTPS, no logging | Verify no token logging |
| Enumeration | 404 for missing | Timing analysis? |
| Privilege Escalation | agent_id from token | Audit needed |

---

## IMPLEMENTATION PRIORITY

### Phase 1: Critical (Do Now)
1. [ ] Add request body size limit
2. [ ] Add security headers
3. [ ] Add query pagination
4. [ ] Audit SQL for injection
5. [ ] Verify error sanitization

### Phase 2: Important (This Week)
6. [ ] Add rate limiter cleanup
7. [ ] HTTPS enforcement
8. [ ] Timing-safe token comparison
9. [ ] Request ID logging
10. [ ] Verify XSS escaping

### Phase 3: Hardening (This Month)
11. [ ] Enumeration prevention audit
12. [ ] Dependency security scanning
13. [ ] Query optimization (N+1)
14. [ ] Response streaming
15. [ ] Admin action logging

---

## MONITORING CHECKLIST

- [ ] Error rate alerts
- [ ] Rate limit hit alerts
- [ ] Response time monitoring
- [ ] Memory usage tracking
- [ ] Database connection monitoring
- [ ] Failed auth attempt logging
- [ ] Admin action audit log

---

## TESTING REQUIREMENTS

Add security tests:
```typescript
// test/security/headers.test.ts
test("responses include security headers", async () => {
  const res = await handleRequest(new Request("http://localhost/"));
  expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  expect(res.headers.get("X-Frame-Options")).toBe("DENY");
});

// test/security/dos.test.ts  
test("rejects oversized request bodies", async () => {
  const bigBody = "x".repeat(100_000);
  const res = await handleRequest(new Request("http://localhost/api/requests", {
    method: "POST",
    body: bigBody,
  }));
  expect(res.status).toBe(413);
});
```
