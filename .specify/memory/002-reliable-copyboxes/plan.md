# Implementation Plan: Reliable Copyboxes

**Branch**: `002-reliable-copyboxes` | **Date**: 2026-02-17 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `.specify/memory/002-reliable-copyboxes/spec.md`

## Summary

Add reliable copy-to-clipboard functionality for agent prompts/instructions and social media post templates across all Barg'N Monster pages. The implementation uses the native Clipboard API with graceful fallback, styled to match the site's suspiciously sketchy aesthetic. No external dependencies per Constitution Principle V.

## Technical Context

**Language/Version**: TypeScript (ESNext) with Bun runtime  
**Primary Dependencies**: None (vanilla JS implementation per Constitution)  
**Storage**: N/A (client-side only feature)  
**Testing**: Bun test + happy-dom for DOM manipulation tests, Playwright for E2E  
**Target Platform**: Web browsers (Chrome, Firefox, Safari, Edge)  
**Project Type**: Single project (frontend enhancement)  
**Performance Goals**: Copy action <100ms, visual feedback <50ms  
**Constraints**: No external clipboard libraries (Constitution V), HTTPS required for Clipboard API  
**Scale/Scope**: All pages with copyable content (home, agent/user profiles, getting-started)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. The Vibe | ✅ PASS | Copy buttons should feel "suspiciously helpful" - maybe add quirky tooltip text |
| II. Security-First | ✅ PASS | No server-side changes, client-side only |
| III. Real Over Mock | ✅ PASS | Unit + E2E tests as specified in clarifications |
| IV. Type Safety | ✅ PASS | TypeScript with explicit types for all functions |
| V. Bun-Native | ✅ PASS | Vanilla JS, no npm dependencies |

**Complexity Justification**: None required. Feature is straightforward client-side enhancement.

## Project Structure

### Documentation (this feature)

```text
.specify/memory/002-reliable-copyboxes/
├── plan.md              # This file
├── spec.md              # Feature specification
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
└── contracts/           # API contracts (none - client-side only)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── copybox.ts       # Core copybox logic (vanilla TS)
├── components/
│   └── CopyButton.tsx   # JSX component for copy button
public/
├── js/
│   └── copybox.js       # Compiled/bundled JS for HTML pages
test/
└── copybox.test.ts      # Unit tests
e2e/
└── copybox.spec.ts      # E2E tests
```

**Structure Decision**: Single project enhancement. Copy functionality implemented as a reusable module in `src/lib/copybox.ts` with a JSX component in `src/components/CopyButton.tsx`. Auto-initialization on page load via event delegation. Compiled JS served to static HTML pages.

## Phase 0: Research & Clarifications

**Status**: Complete

### Unknowns Resolved

1. **Clipboard API Support**: Modern browsers support `navigator.clipboard.writeText()`. Fallback to `document.execCommand('copy')` for older browsers.
2. **HTTPS Requirement**: Clipboard API requires secure context. Development uses `localhost` exception.
3. **Testing Strategy**: Use happy-dom for DOM tests, mock clipboard API. E2E tests with Playwright for real clipboard verification.
4. **Styling Approach**: Use existing CSS custom properties from the site theme. No new dependencies.

### Technology Choices

- **Implementation**: Vanilla TypeScript (no clipboard.js or similar)
- **Event Handling**: Event delegation for dynamically added content
- **Styling**: CSS-in-JS via existing style system, matches site theme
- **Testing**: Bun test with happy-dom, Playwright E2E for clipboard

### Decisions

- **Decision**: Use native Clipboard API with execCommand fallback
  - **Rationale**: Zero dependencies, modern standard with good support
  - **Alternatives considered**: clipboard.js library (rejected per Constitution V)

- **Decision**: Auto-initialize on DOMContentLoaded, use MutationObserver for dynamic content
  - **Rationale**: Works with existing pages without modification
  - **Alternatives considered**: Manual initialization per page (rejected - too error-prone)

## Phase 1: Design

### Data Model

Minimal - no persistent data. Runtime state only:

```typescript
interface CopyButtonState {
  status: 'idle' | 'copying' | 'success' | 'error';
  timeoutId?: number;
}

interface CopyBoxOptions {
  selector: string;        // CSS selector for copyable content
  buttonClass: string;     // CSS class for styling
  successDuration: number; // How long to show success state (ms) - 2000ms per clarifications
  onSuccess?: () => void;  // Optional callback
  onError?: (error: Error) => void; // Optional callback
}
```

### API/Contracts

No external APIs. Internal module interface:

```typescript
// src/lib/copybox.ts
export function initCopyBoxes(options?: Partial<CopyBoxOptions>): void;
export function copyToClipboard(text: string): Promise<void>;
export function createCopyButton(targetElement: HTMLElement): HTMLElement;
```

### Quick Start

```typescript
// In page component or global script
import { initCopyBoxes } from '../lib/copybox.ts';

// Auto-initializes on all copyable elements
document.addEventListener('DOMContentLoaded', () => {
  initCopyBoxes({
    successDuration: 2000,  // Per clarification Q1
    onSuccess: () => console.log('Copied!')
  });
});
```

### Accessibility

- Buttons have `aria-label="Copy to clipboard"`
- Success state announced via `aria-live="polite"` region
- Keyboard focusable and actionable
- Visible focus indicator matching site theme
- Always visible on mobile (per clarification Q2)

## Phase 2: Task Planning

**Status**: Ready for task breakdown

Tasks will be generated in `tasks.md` including:
1. Core copybox library implementation (src/lib/copybox.ts)
2. JSX CopyButton component (src/components/CopyButton.tsx)
3. CSS styling (site theme integration)
4. Unit tests (happy-dom)
5. E2E tests (Playwright)
6. Integration with existing HTML pages
7. Remove inline copy functions from HTML files

**Next Step**: Run `/speckit.tasks` to generate detailed task list.

## Complexity Tracking

No complexity violations. Feature is straightforward client-side enhancement with zero dependencies.

---

**Post-Design Constitution Check**: ✅ All principles maintained. No new dependencies added. Type safety enforced. Testing strategy follows Constitution III (Unit + E2E per clarification Q5).
