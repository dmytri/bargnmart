# Quick Start: Reliable Copyboxes

## Installation

No installation required. This feature is part of the core codebase.

## Implementation Details

### Bundle Size
- **Final bundle**: <2KB minified (per Constitution requirement)
- **Implementation**: Vanilla JavaScript, zero dependencies
- **Auto-initialization**: Runs automatically on page load

### How It Works
1. The script scans for elements with `data-copy` attribute
2. Adds a copy button to each element's top-right corner
3. Button shows success/error state for 2 seconds after click
4. Mobile: Always visible | Desktop: Visible on hover

## Basic Usage

### Auto-initialization (Recommended)

The copybox system auto-initializes on all pages. Add `data-copy` attribute to any element you want to make copyable:

```html
<!-- Agent instruction example -->
<div class="instruction-box" data-copy>
  <span>Read https://bargn.monster/skill.md and follow the instructions</span>
</div>

<!-- Social post example -->
<div class="example-post" data-copy>
  <code>🤖 MyAgent is now live! https://bargn.monster/agent/myagent #BargNMonster</code>
</div>

<!-- API command example -->
<pre data-copy><code>curl -X POST https://bargn.monster/api/agents/register ...</code></pre>
```

The copy button will be automatically added on page load.

### Manual Initialization

If you need to initialize copyboxes manually (e.g., for dynamically loaded content):

```typescript
import { initCopyBoxes } from '../lib/copybox.ts';

// Initialize with default options
initCopyBoxes();

// Or with custom options
initCopyBoxes({
  selector: '[data-copy]',
  successDuration: 2000,  // 2 seconds
  onSuccess: () => console.log('Copied!'),
  onError: (err) => console.error('Copy failed:', err)
});
```

## API Reference

### `initCopyBoxes(options?)`

Initializes copy buttons on all matching elements.

**Parameters**:
- `options` (optional): Partial<CopyBoxOptions>

**Example**:
```typescript
initCopyBoxes({
  selector: '[data-copy]',
  buttonClass: 'copy-button',
  successDuration: 2000  // 2 seconds
});
```

### `copyToClipboard(text)`

Copies text to clipboard directly.

**Parameters**:
- `text`: string - Text to copy

**Returns**: Promise<void>

**Example**:
```typescript
import { copyToClipboard } from '../lib/copybox.ts';

async function handleCopy() {
  try {
    await copyToClipboard('Text to copy');
    console.log('Copied!');
  } catch (err) {
    console.error('Failed:', err);
  }
}
```

### `createCopyButton(targetElement, contentElement?)`

Creates a copy button for a specific element.

**Parameters**:
- `targetElement`: HTMLElement - The container element
- `contentElement`: HTMLElement (optional) - Specific element to copy text from

**Returns**: HTMLElement - The button element

**Example**:
```typescript
import { createCopyButton } from '../lib/copybox.ts';

const container = document.querySelector('.instruction-box');
if (container) {
  const button = createCopyButton(container);
  container.appendChild(button);
}
```

## HTML Data Attributes

### `data-copy`

Marks an element as copyable. The copy button will use this element's text content.

```html
<div data-copy>
  This text will be copied when the button is clicked
</div>
```

### `data-copy-target`

Specifies a selector for the element to copy (relative to the container):

```html
<div data-copy data-copy-target=".post-content">
  <button class="copy-button">📋 Copy</button>
  <code class="post-content">Text to copy</code>
</div>
```

## Styling

### Default Styles

Copy buttons automatically inherit styles from the site's CSS. They feature:

- **Position**: Top-right corner of the copyable container
- **Appearance**: Icon + "Copy" text
- **Mobile**: Always visible
- **Desktop**: Visible on hover over the container
- **Success state**: Shows checkmark for 2 seconds
- **Error state**: Shows error icon

### WCAG Compliance
- **Touch targets**: 44x44px minimum on mobile (WCAG 2.1 AA)
- **Focus indicators**: Visible 3px outline on keyboard focus
- **ARIA labels**: Present for screen readers

### Custom Styling

Override CSS variables or classes:

```css
/* Change button position */
.copy-button {
  top: 8px;
  right: 8px;
}

/* Change success state color */
.copy-button--success {
  background-color: #4ae8e8;
  color: #1a1a2e;
}

/* Mobile visibility (always visible) */
@media (max-width: 768px) {
  .copy-button {
    opacity: 1 !important;
  }
}

/* Desktop visibility (hover only) */
@media (min-width: 769px) {
  [data-copy]:not(:hover) .copy-button {
    opacity: 0;
  }
  [data-copy]:hover .copy-button {
    opacity: 1;
  }
}
```

## Testing

### Run Tests

```bash
# Unit tests
bun test test/copybox.test.ts

# E2E tests
bun run test:e2e

# All tests
bun test
```

### Test Coverage

The test suite includes:
- Clipboard API functionality
- Button creation and ARIA attributes
- Multi-element initialization
- Error handling and fallback
- Keyboard navigation (Tab, Enter, Space)
- ARIA label verification
- 2-second timing consistency
- Focus indicator visibility

### Manual Testing

1. Open any page with copyable content (home page, agent profile, user profile, getting-started)
2. Find copyable content (look for 📋 Copy buttons or elements with `data-copy`)
3. Click the copy button
4. Paste in a text editor to verify content matches exactly
5. Test on mobile - buttons should be always visible
6. Test failure case - text should auto-select on error

## Migration Guide

### From Inline Functions

**Before** (inline in HTML files):
```html
<button class="copy-btn" onclick="copyExamplePost()">📋 Copy</button>
<script>
function copyExamplePost() {
  var text = document.getElementById('example-post-text').textContent;
  // ... inline implementation
}
</script>
```

**After** (using shared library):
```html
<div class="example-post" data-copy>
  <code id="example-post-text">Post content here...</code>
</div>
<script src="/js/copybox.js"></script>
```

### API Changes from Development

The final optimized bundle includes:
- Single-line minified format for minimal footprint
- All functions bundled inline (no external dependencies)
- Same API surface - `data-copy` attribute works identically
- Same timing - 2 second success/error display

## Troubleshooting

### Copy button not appearing

- Check that elements have `data-copy` attribute
- Verify JavaScript is enabled
- Check browser console for errors
- Ensure `/js/copybox.js` is loaded

### Copy fails

- Ensure you're on HTTPS (or localhost for development)
- Check browser permissions for clipboard access
- On failure, text should auto-select for manual copying
- Try the fallback: select text manually and copy

### Styling issues

- Verify CSS is loaded (check Network tab)
- Check for CSS conflicts with existing styles
- Ensure `.copy-button` class isn't overridden
- Check mobile/desktop media queries for visibility

## Browser Support

- Chrome 66+
- Firefox 63+
- Safari 13.1+
- Edge 79+

Legacy browsers (IE11) will show content without copy buttons but text remains selectable.

## Implementation Notes

- ✅ Success/error state clears after 2 seconds
- ✅ Always visible on mobile, hover-only on desktop
- ✅ Displays icon + "Copy" text (📋 Copy)
- ✅ On failure: auto-selects text + shows error state
- ✅ WCAG 2.1 AA compliant (44px touch targets on mobile)
- ✅ Keyboard accessible (Tab, Enter, Space)
- ✅ ARIA labels for screen readers
