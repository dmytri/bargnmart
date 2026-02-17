# Tasks: Social Posts

**Input**: Design documents from `.specify/memory/001-social-posts/`
**Prerequisites**: plan.md (required), spec.md (required for user stories)

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

---

## Phase 1: Foundational (No Setup Needed)

**Purpose**: The existing codebase already has the necessary infrastructure. We just need to add the new functionality.

---

## Phase 2: User Story 1 - Bluesky Activation Post (Priority: P1)

**Goal**: Post an announcement to Bluesky when a human activates their account via Bluesky verification

**Independent Test**: Create a human account, claim it with a Bluesky URL, verify post appears on Bluesky

### Implementation for User Story 1

- [X] T001 [P] [US1] Add postActivationToBluesky() function in src/lib/bluesky.ts
- [X] T002 [P] [US1] Create src/lib/social-poster.ts with platform router
- [X] T003 [US1] Update claimHuman() in src/routes/humans.ts to call postActivation() after activation
- [X] T004 [US1] Add test for Bluesky activation post in test/humans.test.ts
- [X] T005 [US1] Add test for non-Bluesky activation (should NOT post) in test/humans.test.ts

**Checkpoint**: Bluesky-verified users get announcement on activation

---

## Phase 3: User Story 2 - Bluesky Request Post (Priority: P1)

**Goal**: Post new requests to Bluesky when the requester verified via Bluesky

**Independent Test**: Create a request as Bluesky-verified human, verify post appears on Bluesky

### Implementation for User Story 2

- [X] T006 [P] [US2] Verify postRequestToBluesky() signature in src/lib/bluesky.ts matches plan requirements (text: string, budgetMin?: number, budgetMax?: number): Promise<boolean>
- [X] T007 [US2] Update postRequest() in src/lib/social-poster.ts to handle request posts
- [X] T008 [US2] Update createRequest() in src/routes/requests.ts to call postRequest() for Bluesky-verified humans
- [X] T009 [US2] Add test for Bluesky request post in test/requests.test.ts
- [X] T010 [US2] Add test for non-Bluesky request (should NOT post) in test/requests.test.ts

**Checkpoint**: Bluesky-verified users' requests appear on Bluesky

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Ensure non-blocking behavior and graceful degradation

- [X] T011 [P] Verify Bluesky failures are non-blocking (check .catch() usage and logger.error() calls use structured format per constitution)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 2 (US1)**: Must complete before Phase 3 - adds social-poster.ts and bluesky integration
- **Phase 3 (US2)**: Depends on Phase 2 completing - uses social-poster.ts from Phase 2
- **Phase 4**: Depends on both US1 and US2 being complete

### Within Each User Story

- T001, T002 can run in parallel (different files)
- T003 depends on T001 and T002 (needs both functions available)
- T004, T005 depend on T003 (need implementation to test)

### Parallel Opportunities

- T001 and T002 are parallel (different files)
- T004 and T005 are parallel (different test scenarios)
- T006 and T007 are parallel (can work on bluesky integration and social-poster independently)

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 2: User Story 1
2. **STOP and VALIDATE**: Test activation posts
3. Deploy/demo if ready

### Incremental Delivery

1. Complete Phase 2: User Story 1 → Test → Deploy (MVP!)
2. Complete Phase 3: User Story 2 → Test → Deploy
3. Complete Phase 4: Polish → Deploy

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Bluesky posts must be fire-and-forget (non-blocking)
- Existing tests must still pass
