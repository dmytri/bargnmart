# Tasks: Reliable Copyboxes

**Input**: Design documents from `.specify/memory/002-reliable-copyboxes/`
**Prerequisites**: plan.md (required), spec.md (required for user stories), data-model.md, quickstart.md

**Tests**: Tests are REQUIRED per spec.md NFR-009 and clarifications (Unit + E2E).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Source**: `src/` at repository root
- **Tests**: `test/` at repository root  
- **E2E Tests**: `e2e/` at repository root
- **Public assets**: `public/` at repository root

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and core library structure

- [ ] T001 Create TypeScript library file at `src/lib/copybox.ts` with interfaces and exports
- [ ] T002 [P] Create directory `public/js/` for compiled copybox script
- [ ] T003 Add build configuration to compile `src/lib/copybox.ts` to `public/js/copybox.js`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core copybox library that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Implement `copyToClipboard()` function in `src/lib/copybox.ts` with Clipboard API and execCommand fallback
- [ ] T005 [P] Implement `createCopyButton()` function in `src/lib/copybox.ts` with button creation and ARIA attributes
- [ ] T006 Implement `initCopyBoxes()` function in `src/lib/copybox.ts` with event delegation and MutationObserver
- [ ] T007 Add CSS styles for copy buttons to `src/components/styles.ts` (default, hover, success, error states)
- [ ] T008 Add responsive CSS for mobile (always visible) and desktop (hover-only) in `src/components/styles.ts`
- [ ] T009 Create unit test file `test/copybox.test.ts` with happy-dom setup and mock clipboard

**Checkpoint**: Foundation ready - user story implementation can now begin in parallel

---

## Phase 3: User Story 1 - Copy Agent Prompts (Priority: P1) 🎯 MVP

**Goal**: Enable copying of agent skill instructions on home page and other key pages

**Independent Test**: Visit home page, click copy button in "Got a Bot?" section, verify skill.md instruction is in clipboard

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T010 [P] [US1] Write unit test for agent prompt copy functionality in `test/copybox.test.ts`
- [ ] T011 [US1] Write E2E test for agent prompt copy on home page in `e2e/copybox.spec.ts`

### Implementation for User Story 1

- [ ] T012 [P] [US1] Add `data-copy` attribute to agent instruction box in `public/index.html`
- [ ] T013 [P] [US1] Add `data-copy` attribute to agent instruction box in `public/requests.html`
- [ ] T014 [P] [US1] Add `data-copy` attribute to agent instruction box in `public/product.html`
- [ ] T015 [US1] Include `copybox.js` script in `public/index.html` footer
- [ ] T016 [US1] Remove inline `copyInstruction()` function from `public/index.html`
- [ ] T017 [US1] Remove inline `copyInstruction()` function from `public/requests.html`
- [ ] T018 [US1] Remove inline `copyInstruction()` function from `public/product.html`

**Checkpoint**: User Story 1 should be fully functional - agent prompts can be copied on all pages

---

## Phase 4: User Story 2 - Copy Social Media Posts (Priority: P1)

**Goal**: Enable copying of social media activation/verification posts on agent and user profiles

**Independent Test**: Visit unclaimed agent profile, click copy button on example post, verify complete post text (including hashtags) is in clipboard

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T019 [P] [US2] Write unit test for social post copy with special characters (emojis, hashtags) in `test/copybox.test.ts`
- [ ] T020 [US2] Write E2E test for social post copy on agent profile in `e2e/copybox.spec.ts`
- [ ] T021 [P] [US2] Write E2E test for social post copy on user profile in `e2e/copybox.spec.ts`

### Implementation for User Story 2

- [ ] T022 [P] [US2] Add `data-copy` attribute to example post container in agent profile template in `public/agent.html`
- [ ] T023 [P] [US2] Add `data-copy` attribute to example post container in user profile template in `public/user.html`
- [ ] T024 [US2] Update dynamic post generation in `public/agent.html` to include `data-copy` attribute
- [ ] T025 [US2] Update dynamic post generation in `public/user.html` to include `data-copy` attribute
- [ ] T026 [US2] Remove inline `copyExamplePost()` function from `public/agent.html`
- [ ] T027 [US2] Remove inline `copyExamplePost()` function from `public/user.html`
- [ ] T028 [US2] Remove inline `copyShopperSkill()` function from `public/user.html`

**Checkpoint**: User Stories 1 AND 2 should both work independently

---

## Phase 5: User Story 3 - Copy API Commands (Priority: P2)

**Goal**: Enable copying of curl commands on getting-started page

**Independent Test**: Visit /getting-started, click copy button on curl example, verify complete command with headers and JSON is in clipboard

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T029 [P] [US3] Write unit test for multi-line content copy (preserving line breaks) in `test/copybox.test.ts`
- [ ] T030 [US3] Write E2E test for curl command copy in `e2e/copybox.spec.ts`

### Implementation for User Story 3

- [ ] T031 [P] [US3] Add `data-copy` attribute to curl command examples in `public/getting-started.html`
- [ ] T032 [US3] Ensure multi-line content copies with preserved formatting in `src/lib/copybox.ts`
- [ ] T033 [US3] Remove inline copy functions from `public/getting-started.html` if any exist

**Checkpoint**: All P1 and P2 user stories (1, 2, 3) should be independently functional

---

## Phase 6: User Story 4 - Graceful Degradation (Priority: P2)

**Goal**: Handle clipboard failures gracefully with auto-select fallback

**Independent Test**: Simulate clipboard failure (e.g., deny permission), click copy, verify text auto-selects and button shows error state

### Tests for User Story 4 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T034 [P] [US4] Write unit test for clipboard failure handling with auto-select fallback in `test/copybox.test.ts`
- [ ] T035 [US4] Write E2E test for graceful degradation in `e2e/copybox.spec.ts`

### Implementation for User Story 4

- [ ] T036 [US4] Implement error state UI (red styling) in `src/components/styles.ts`
- [ ] T037 [US4] Implement text auto-selection on copy failure in `src/lib/copybox.ts`
- [ ] T038 [US4] Add HTTP (non-HTTPS) detection and copy button hiding in `src/lib/copybox.ts`
- [ ] T039 [US4] Test graceful degradation manually on HTTP localhost

**Checkpoint**: All user stories should handle failures gracefully

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T040 [P] Optimize bundle size - verify `public/js/copybox.js` is <2KB
- [ ] T041 Verify all copy buttons meet WCAG 2.1 AA touch target requirements (44x44px)
- [ ] T042 [P] Add keyboard navigation tests in `test/copybox.test.ts`
- [ ] T043 [P] Add ARIA label verification tests in `test/copybox.test.ts`
- [ ] T044 Verify success/error states clear after exactly 2 seconds across all scenarios
- [ ] T045 Run full test suite: `bun test` (all tests pass)
- [ ] T046 Run E2E tests: `bun run test:e2e` (all tests pass)
- [ ] T047 [P] Run TypeScript check: `npx tsc --noEmit` (0 errors)
- [ ] T048 Update quickstart.md with final implementation details

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3-6)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 4 (P2)**: Can start after Foundational (Phase 2) - Should implement after US1-3 to test error cases

### Within Each User Story

- Tests MUST be written and FAIL before implementation
- HTML modifications before removing inline functions
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- All tests for a user story marked [P] can run in parallel
- HTML modifications within a story marked [P] can run in parallel
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch all tests for User Story 1 together:
Task: "Write unit test for agent prompt copy in test/copybox.test.ts"
Task: "Write E2E test for agent prompt copy in e2e/copybox.spec.ts"

# Launch all HTML modifications together:
Task: "Add data-copy to index.html"
Task: "Add data-copy to requests.html"
Task: "Add data-copy to product.html"
```

---

## Implementation Strategy

### MVP First (User Stories 1 & 2 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories)
3. Complete Phase 3: User Story 1 (Agent Prompts)
4. Complete Phase 4: User Story 2 (Social Posts)
5. **STOP and VALIDATE**: Test both stories independently
6. Deploy/demo if ready

### Full Feature Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Stories 1 & 2 (P1) → Test independently → Deploy (MVP!)
3. Add User Story 3 (P2) → Test independently → Deploy
4. Add User Story 4 (P2) → Test independently → Deploy
5. Complete Polish phase
6. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1 (Agent Prompts)
   - Developer B: User Story 2 (Social Posts)
   - Developer C: User Story 3 (API Commands)
   - Developer D: User Story 4 (Graceful Degradation) + Polish
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence

## Task Summary

- **Total Tasks**: 48
- **Setup Tasks**: 3 (T001-T003)
- **Foundational Tasks**: 6 (T004-T009)
- **User Story 1 (P1)**: 9 tasks (T010-T018)
- **User Story 2 (P1)**: 10 tasks (T019-T028)
- **User Story 3 (P2)**: 5 tasks (T029-T033)
- **User Story 4 (P2)**: 6 tasks (T034-T039)
- **Polish Tasks**: 9 tasks (T040-T048)
