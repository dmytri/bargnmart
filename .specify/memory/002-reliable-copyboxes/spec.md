# Feature Specification: Reliable Copyboxes

**Feature Branch**: `002-reliable-copyboxes`  
**Created**: 2026-02-17  
**Status**: Draft  
**Input**: User description: "reliable copyboxes like on github for all pages with copyboxes"

## Clarifications

### Session 2026-02-17

- Q: What content should have copy boxes? → A: Agent prompts/instructions and social media post templates across all pages (home, bot pages, user pages, getting-started, etc.)
- Q: Which specific copyable elements exist? → A: Agent skill prompts (skill.md instructions), social media activation posts for agents, shopper verification posts, API curl commands
- Q: How long should success state remain visible? → A: 2 seconds (industry standard for transient feedback)
- Q: Should copy buttons be always visible on mobile devices? → A: Always visible on mobile, hover-only on desktop
- Q: What should the copy button display by default? → A: Icon + "Copy" text (e.g., 📋 Copy) for clarity and accessibility
- Q: When the clipboard API fails, what should happen? → A: Auto-select text + show error state on button
- Q: What is the minimum required test coverage? → A: Unit + E2E tests

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Copy Agent Prompts (Priority: P1)

As a bot owner, I want to copy the agent skill instructions with one click so that I can easily paste them into my AI agent's context without manual selection.

**Why this priority**: Bot owners need to copy the skill.md prompt/instruction to configure their agents. This is the primary onboarding flow for agents.

**Independent Test**: Can be tested by visiting the home page, finding the "Got a Bot?" section, and clicking the copy button next to the skill instruction. The text should be in clipboard ready to paste.

**Acceptance Scenarios**:

1. **Given** I view the agent instruction section, **When** I click the copy button, **Then** the full skill.md URL and instruction text is copied to clipboard
2. **Given** I click the copy button, **When** the copy succeeds, **Then** the button shows a temporary success state (checkmark or "Copied!")
3. **Given** I view the page on mobile, **When** the copy button appears, **Then** it's visible without hovering and sized for touch

---

### User Story 2 - Copy Social Media Posts (Priority: P1)

As an agent owner or user, I want to copy pre-written social media post templates so that I can easily claim/verify my agent or account on social platforms.

**Why this priority**: Social verification is required for activation. Users need to copy the exact post text including hashtags and links.

**Independent Test**: Can be tested by visiting an unclaimed agent profile or unverified user profile, finding the activation section, and clicking the copy button next to the example post.

**Acceptance Scenarios**:

1. **Given** I view an unclaimed agent profile, **When** I click "Copy" on the example post, **Then** the complete social post text (including agent name, link, and #BargNMonster) is copied
2. **Given** I view my unverified user profile, **When** I click the copy button for the shopper verification post, **Then** the post text with my display name and link is copied
3. **Given** the copy succeeds on a social post, **When** the feedback shows, **Then** it clears automatically after 2 seconds and returns to ready state

---

### User Story 3 - Copy API Commands (Priority: P2)

As a developer setting up an agent, I want to copy curl commands from the getting-started page so that I can quickly test the API registration.

**Why this priority**: Developers need the exact API commands to register agents. Copy ensures they get the correct endpoint and JSON format.

**Independent Test**: Can be tested by visiting /getting-started, finding the curl example, and clicking its copy button.

**Acceptance Scenarios**:

1. **Given** I view the getting-started page, **When** I click the copy button on a curl command, **Then** the complete command including headers and JSON body is copied
2. **Given** the curl command is multi-line, **When** copied, **Then** line breaks and formatting are preserved exactly as shown

---

### User Story 4 - Graceful Degradation (Priority: P2)

As a user with an unsupported browser or denied permissions, I want clear feedback when copy fails so that I know to manually select and copy the text.

**Why this priority**: Clipboard API requires secure context and permissions. Users need to understand when automatic copy isn't available.

**Independent Test**: Can be tested by simulating clipboard failure or using an older browser. The UI should indicate failure and the text should remain selectable.

**Acceptance Scenarios**:

1. **Given** the clipboard API fails, **When** I click copy, **Then** the button briefly shows an error state and the text is automatically selected for manual copying
2. **Given** I'm on HTTP (not HTTPS), **When** the page loads, **Then** copy buttons are either hidden or show a tooltip explaining manual copy is required

---

### Edge Cases

- **Multiple copy buttons on one page**: Each button must work independently
- **Dynamic content**: Copy buttons for dynamically loaded content (e.g., generated example posts) must work without page reload
- **Empty content**: If the copy target has no text, the button should be disabled or hidden
- **Special characters**: Posts with emojis, hashtags, and URLs must copy exactly without corruption
- **Mobile touch**: Copy buttons must be touch-friendly (minimum 44px tap target)
- **Clipboard permission denied**: Handle denial gracefully with fallback to text selection

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: All agent instruction boxes MUST have a working copy button (index.html, requests.html, product.html)
- **FR-002**: All social media example posts MUST have a working copy button (agent.html, user.html)
- **FR-003**: API curl command examples MUST have working copy buttons (getting-started.html)
- **FR-004**: Copy buttons MUST provide visual feedback on success (temporary state change to checkmark or "Copied!")
- **FR-005**: Copy buttons MUST handle failures gracefully with error feedback and text auto-selection
- **FR-006**: The solution MUST work without external dependencies (vanilla JS per Constitution)
- **FR-007**: Copy buttons MUST be keyboard accessible (focusable, actionable via Enter/Space)
- **FR-008**: Copy buttons MUST have appropriate ARIA labels for screen readers
- **FR-009**: Dynamic content (JS-generated posts via document.write/innerHTML) MUST get copy buttons automatically via MutationObserver without manual binding
- **FR-010**: Success/error state MUST automatically clear after 2 seconds (±100ms tolerance acceptable)
- **FR-011**: Copy buttons MUST display icon + "Copy" text by default (e.g., 📋 Copy)

### Non-Functional Requirements

- **NFR-001**: Copy functionality MUST work in Chrome, Firefox, Safari, and Edge (last 2 versions)
- **NFR-002**: Copy action MUST complete within 100ms for content under 5KB
- **NFR-003**: Visual feedback MUST appear within 50ms of user interaction
- **NFR-004**: Success/error state MUST automatically clear after 2 seconds (±100ms tolerance for browser timing variance)
- **NFR-005**: Copy buttons MUST meet WCAG 2.1 AA touch target requirements (minimum 44x44px on mobile)
- **NFR-006**: No external clipboard libraries allowed per Constitution Principle V (Bun-Native)
- **NFR-007**: Implementation MUST use shared library (not inline scripts) for consistency
- **NFR-008**: Copy buttons MUST be always visible on mobile devices (viewport width < 768px), hover-only on desktop (viewport width >= 768px)
- **NFR-009**: Minimum test coverage: Unit tests + E2E tests

### Key Entities

- **CopyButton**: UI component that appears next to copyable content
  - Position: Top-right or inline with content
  - States: Default, Hover, Active, Success (checkmark), Error
  - Accessibility: focusable, ARIA labels, keyboard actionable
- **Copyable Content**: Text elements that can be copied
  - Agent instructions: skill.md prompt text
  - Social posts: Pre-written activation/verification posts
  - API commands: curl examples with headers and JSON
  - Dynamic content: JS-generated example posts
- **CopyBox System**: Shared vanilla JS library
  - Auto-initialization on DOMContentLoaded
  - Event delegation for dynamic content
  - Consistent behavior across all pages
  - Test coverage: Unit tests + E2E tests

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Copy functionality works on 100% of pages with copyable content (home, agent profiles, user profiles, getting-started)
- **SC-002**: Copy action success rate is >99% in supported browsers/contexts
- **SC-003**: Visual feedback appears within 50ms of user interaction
- **SC-004**: No console errors related to copy functionality in production
- **SC-005**: Passes accessibility audit (keyboard navigation, ARIA labels, focus indicators, touch targets)
- **SC-006**: Bundle size increase is <2KB (vanilla JS implementation)
- **SC-007**: All copy buttons share the same implementation (no inline scripts per page)
- **SC-008**: Dynamic content gets copy buttons without page reload

## Implementation Notes

### Pages Requiring Copyboxes (SC-001 "all pages" definition)

The following pages MUST have working copy buttons:
- **public/index.html** - Agent skill instructions ("Got a Bot?" section)
- **public/requests.html** - Agent skill instructions
- **public/product.html** - Agent skill instructions
- **public/agent.html** - Social media activation posts for unclaimed agents
- **public/user.html** - Social media verification posts for unverified users
- **public/getting-started.html** - API curl command examples

### Inline Functions to Remove (SC-007)

The following inline JavaScript functions MUST be removed and replaced with the shared library:
- `copyInstruction()` in index.html, requests.html, product.html
- `copyExamplePost()` in agent.html, user.html
- `copyShopperSkill()` in user.html

### Viewport Breakpoints (NFR-008 clarification)

- **Mobile**: viewport width < 768px - buttons always visible
- **Desktop**: viewport width >= 768px - buttons visible on hover
- Touch-enabled desktop devices (e.g., Surface) follow mobile behavior
