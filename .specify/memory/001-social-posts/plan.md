# Implementation Plan: Social Posts

**Branch**: `001-social-posts` | **Date**: 2026-02-15 | **Spec**: `.specify/memory/001-social-posts/spec.md`
**Input**: Feature specification from spec.md

## Summary

Post to Bluesky when a human activates their account or posts a request, but ONLY when verified via Bluesky. The system will detect the verification platform from the proof URL and post accordingly. This is extensible for future platforms (Twitter, Mastodon, etc.) by adding handlers to a platform router.

## Technical Context

**Language/Version**: TypeScript (Bun runtime)  
**Primary Dependencies**: Existing bluesky.ts lib, existing social.ts lib for platform detection  
**Storage**: SQLite (existing humans table already has claimed_proof_url field)  
**Testing**: Bun test framework (existing tests in test/)  
**Target Platform**: Linux server (Bun)  
**Project Type**: Single web application  
**Performance Goals**: Non-blocking social posts (fire-and-forget)  
**Constraints**: Must not break existing functionality if Bluesky API fails  
**Scale/Scope**: Small feature - 2 trigger points, 1 new file

## Architecture

### New File: `src/lib/social-poster.ts`
Platform-agnostic router that dispatches to platform-specific handlers:
- `postActivation(proofUrl, userInfo)` - determines platform and posts activation
- `postRequest(proofUrl, requestInfo)` - determines platform and posts request

### Existing Files Modified:
- `src/lib/bluesky.ts` - add `postActivationToBluesky()` function
- `src/routes/humans.ts` - call `postActivation()` after successful claim
- `src/routes/requests.ts` - call `postRequest()` after successful request creation

### Platform Detection:
Use existing `extractProfileFromPost(proofUrl)` from `src/lib/social.ts` which returns `{ platform, handle, ... }`

## Project Structure

```text
src/
├── lib/
│   ├── bluesky.ts          # MODIFIED: add postActivationToBluesky()
│   ├── social.ts           # EXISTING: extractProfileFromPost()
│   └── social-poster.ts    # NEW: platform router
├── routes/
│   ├── humans.ts           # MODIFIED: call postActivation()
│   └── requests.ts         # MODIFIED: call postRequest()
```

## Implementation Steps

### Step 1: Create social-poster.ts
Create platform router with:
- `postActivation(proofUrl: string, displayName: string, profileUrl: string): Promise<boolean>`
- `postRequest(proofUrl: string, text: string, budgetMin: number | null, budgetMax: number | null, requestId: string): Promise<boolean>`

Both functions:
1. Extract platform using `extractProfileFromPost(proofUrl)`
2. If platform === "bluesky", dispatch to Bluesky handler
3. Return boolean (success/failure) but don't throw

### Step 2: Add postActivationToBluesky() 
In `src/lib/bluesky.ts`:
```typescript
export async function postActivationToBluesky(
  displayName: string,
  profileUrl: string
): Promise<boolean> {
  const post = `🎉 ${displayName} just joined Barg'N Monster! #BargNMonster → https://bargn.monster${profileUrl}`;
  return postToBluesky(post);
}
```

### Step 3: Update claimHuman() in humans.ts
After account activation (line 174-177), add:
```typescript
import { postActivation } from "../lib/social-poster";

// After successful activation:
postActivation(proof_url, human.display_name, `/user/${humanId}`).catch(err => 
  logger.error("[social-poster] Activation post failed:", err)
);
```

### Step 4: Update createRequest() in requests.ts
After request is created (line 313-330), for human requesters:
```typescript
import { postRequest } from "../lib/social-poster";

// After inserting request, before response:
if (humanCtx) {
  const humanResult = await db.execute({
    sql: `SELECT claimed_proof_url FROM humans WHERE id = ?`,
    args: [humanCtx.human_id],
  });
  const proofUrl = humanResult.rows[0]?.claimed_proof_url;
  if (proofUrl) {
    postRequest(proofUrl, text, budget_min_cents ?? null, budget_max_cents ?? null, requestId).catch(err =>
      logger.error("[social-poster] Request post failed:", err)
    );
  }
}
```

## Testing Plan

### Unit Tests (test/humans.test.ts, test/requests.test.ts)
1. Test activation posts to Bluesky when verified via Bluesky
2. Test activation does NOT post when verified via Twitter
3. Test request posts to Bluesky when requester is Bluesky-verified
4. Test request does NOT post when requester is non-Bluesky

### Integration
- Existing tests should still pass
- Fire-and-forget pattern ensures no impact on user-facing latency

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Bluesky API downtime | Non-blocking - user flow unaffected |
| Rate limiting | Already handled in existing bluesky.ts with session refresh |
| Platform detection fails | Default to no-post, log warning |
