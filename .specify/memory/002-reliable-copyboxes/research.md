# Research: Reliable Copyboxes

## Date
2026-02-17

## Unknowns Resolved

### 1. Clipboard API Browser Support

**Question**: What is the browser support for the Clipboard API?

**Research Findings**:
- `navigator.clipboard.writeText()` is supported in all modern browsers (Chrome 66+, Firefox 63+, Safari 13.1+, Edge 79+)
- Requires secure context (HTTPS or localhost)
- Requires user interaction (click event) to trigger

**Decision**: Use native Clipboard API as primary method

**Rationale**: 
- Zero dependencies (Constitution V compliance)
- Modern standard with excellent support
- Promise-based API fits async/await patterns

**Alternatives considered**:
- clipboard.js library: Rejected per Constitution V (no external dependencies)
- document.execCommand('copy'): Used only as fallback for legacy browsers

---

### 2. Graceful Degradation Strategy

**Question**: How should the copy functionality behave when Clipboard API is unavailable?

**Research Findings**:
- Fallback: `document.execCommand('copy')` works in older browsers
- Edge case: HTTP (non-secure) contexts - Clipboard API unavailable
- Edge case: User denies clipboard permission (rare but possible)

**Decision**: Implement two-tier fallback

1. Primary: `navigator.clipboard.writeText()`
2. Fallback: `document.execCommand('copy')` with temporary textarea
3. Failure: Show error state, ensure code is still selectable

**Rationale**: Maximizes compatibility while maintaining Constitution compliance

---

### 3. Event Delegation vs Direct Binding

**Question**: Should we bind events directly to each code block or use event delegation?

**Research Findings**:
- Event delegation: Single listener on container, works for dynamically added content
- Direct binding: Individual listeners on each element, requires rebinding for new content

**Decision**: Use event delegation with MutationObserver

**Rationale**:
- Pages may load code blocks dynamically (e.g., lazy-loaded content)
- Better performance with many code blocks
- Matches modern best practices

**Implementation**:
```typescript
document.addEventListener('click', (e) => {
  if (e.target.matches('.copy-button')) {
    handleCopy(e);
  }
});

// Observe for dynamically added code blocks
const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.matches && node.matches('pre code')) {
        addCopyButton(node);
      }
    });
  });
});
```

---

### 4. Styling Integration

**Question**: How should copy buttons be styled to match the site's aesthetic?

**Research Findings**:
- Site uses specific color palette: teal (#1a3a3a), yellow (#e8d44d), coral (#d4847c)
- Dark theme with comic/irregular styling
- Existing button patterns in AuthModal component

**Decision**: Create matching styles using existing CSS patterns

**Style Requirements**:
- Position: Absolute, top-right of code block
- Colors: Use site palette
- States: Default, hover, active, success, error
- Transitions: Match existing 0.15s transitions

**Rationale**: Consistent UX reinforces brand identity

---

### 5. Testing Strategy

**Question**: How do we test clipboard functionality in unit tests?

**Research Findings**:
- Happy-dom doesn't implement Clipboard API
- Need to mock navigator.clipboard
- E2E tests with Playwright can test real clipboard

**Decision**: Multi-layer testing approach

1. **Unit tests** (happy-dom): Mock clipboard API, test logic
2. **Integration tests**: Test DOM manipulation, button creation
3. **E2E tests** (Playwright): Test real clipboard in actual browsers

**Mock Implementation**:
```typescript
// test setup
const mockClipboard = {
  writeText: jest.fn().mockResolvedValue(undefined)
};
Object.defineProperty(navigator, 'clipboard', {
  value: mockClipboard,
  writable: true
});
```

**Rationale**: Comprehensive testing per Constitution III (Real Over Mock) - E2E tests use real clipboard

---

## Summary

All critical unknowns have been resolved. The implementation will:

1. Use native Clipboard API with execCommand fallback
2. Implement event delegation for dynamic content support
3. Style buttons to match site aesthetic
4. Include comprehensive testing at unit, integration, and E2E levels
5. Maintain Constitution compliance (zero dependencies, TypeScript, real testing)

## References

- [MDN: Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [Can I Use: Clipboard API](https://caniuse.com/mdn-api_clipboard_writetext)
- [MDN: MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)
