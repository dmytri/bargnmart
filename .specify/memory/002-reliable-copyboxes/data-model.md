# Data Model: Reliable Copyboxes

## Overview

This feature has minimal data persistence requirements. Most data is runtime-only UI state for copy-to-clipboard functionality.

## Runtime State

### CopyButtonState

State maintained for each copy button instance:

```typescript
interface CopyButtonState {
  status: 'idle' | 'copying' | 'success' | 'error';
  timeoutId?: number;  // For clearing success/error state after delay
}
```

**Fields**:
- `status`: Current visual state of the button
  - `'idle'`: Default state, ready to copy
  - `'copying'`: Copy operation in progress
  - `'success'`: Copy completed successfully
  - `'error'`: Copy failed
- `timeoutId`: Reference to setTimeout for auto-clearing success/error state (2 seconds per clarification)

**Lifecycle**:
1. Button created → status: 'idle'
2. User clicks → status: 'copying'
3. Copy succeeds → status: 'success' → setTimeout to return to 'idle' after 2 seconds
4. Copy fails → status: 'error' → setTimeout to return to 'idle' after 2 seconds

---

## Configuration

### CopyBoxOptions

Configuration options for initializing copyboxes:

```typescript
interface CopyBoxOptions {
  // CSS selector for copyable content elements
  // Default: '[data-copy]'
  selector: string;
  
  // CSS class applied to copy buttons
  // Default: 'copy-button'
  buttonClass: string;
  
  // Duration to show success/error state (milliseconds)
  // Default: 2000 (per clarification: 2 seconds)
  successDuration: number;
  
  // Optional callback on successful copy
  onSuccess?: () => void;
  
  // Optional callback on copy failure
  onError?: (error: Error) => void;
}
```

**Defaults**:
```typescript
const DEFAULT_OPTIONS: CopyBoxOptions = {
  selector: '[data-copy]',
  buttonClass: 'copy-button',
  successDuration: 2000
};
```

---

## Copyable Content Types

### Agent Skill Prompts

Agent instructions for configuring AI bots (skill.md reference):

```html
<div class="instruction-box" data-copy>
  <span id="agent-instruction">Read https://bargn.monster/skill.md and follow the instructions to join Barg'N Monster</span>
  <button class="copy-button" type="button" aria-label="Copy to clipboard">
    <span>📋 Copy</span>
  </button>
</div>
```

**Location**: index.html, requests.html, product.html

### Social Media Activation Posts

Pre-written posts for claiming agents or verifying user accounts:

```html
<div class="example-post" data-copy>
  <button class="copy-button" type="button" aria-label="Copy to clipboard">
    <span>📋 Copy</span>
  </button>
  <code id="example-post-text">🤖 MyAgent is now live on Barg'N Monster!

https://bargn.monster/agent/myagent #BargNMonster</code>
</div>
```

**Location**: agent.html (unclaimed agents), user.html (unverified users)

### API Curl Commands

Developer commands for API registration:

```html
<pre data-copy><code>curl -X POST https://bargn.monster/api/agents/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Bot",
    "description": "A helpful shopping assistant"
  }'</code>
  <button class="copy-button" type="button" aria-label="Copy to clipboard">
    <span>📋 Copy</span>
  </button>
</pre>
```

**Location**: getting-started.html

---

## DOM Structure

### Copyable Element with Button

```html
<!-- Container with data-copy attribute -->
<div data-copy class="has-copybox">
  <!-- Content to copy -->
  <span class="copy-content">Text to be copied</span>
  
  <!-- Generated button -->
  <button 
    class="copy-button" 
    aria-label="Copy to clipboard"
    type="button"
    data-copy-target=".copy-content"
  >
    <span class="copy-icon">📋</span>
    <span class="copy-text">Copy</span>
  </button>
</div>
```

### CSS Classes

- `[data-copy]`: Marker attribute for copyable containers
- `.has-copybox`: Applied after initialization
- `.copy-button`: Applied to the copy button element
- `.copy-button--success`: Applied temporarily after successful copy (shows ✓)
- `.copy-button--error`: Applied temporarily after failed copy (shows ✗)
- `.copy-icon`: Icon element (clipboard icon by default)
- `.copy-text`: Text label element

---

## State Transitions

```
┌─────┐     click      ┌──────────┐
│idle │ ──────────────>│ copying  │
└─────┘                └────┬─────┘
   ▲                        │
   │                        │ async operation
   │                        ▼
   │              ┌─────────────────┐
   │              │  success/error  │
   │              └────────┬────────┘
   │                       │
   │        2 sec timeout  │
   └───────────────────────┘
```

**Events**:
- `click`: Triggered by user
- `copy-success`: Internal event, clears after 2 second timeout (per clarification)
- `copy-error`: Internal event, clears after 2 second timeout

---

## No Persistent Storage

This feature does not require:
- Database tables
- LocalStorage/SessionStorage
- Cookies
- Server-side state

All state is transient UI state managed in memory.
