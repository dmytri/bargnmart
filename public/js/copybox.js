// Reliable Copyboxes - Vanilla JavaScript, no build step needed
(function() {
  "use strict";

  const SELECTOR = '[data-copy]';
  const BUTTON_CLASS = 'copy-button';
  const SUCCESS_DURATION = 2000;
  let observerSetup = false;

  // Create copy button
  function createButton() {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = BUTTON_CLASS;
    button.setAttribute('aria-label', 'Copy');
    button.innerHTML = '<span class="copy-icon"></span><span class="copy-text"> Copy</span>';
    button.querySelector('.copy-icon').textContent = '📋';
    return button;
  }

  // Write text to clipboard
  function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve, reject) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        const successful = document.execCommand('copy');
        document.body.removeChild(textarea);
        if (successful) {
          resolve();
        } else {
          reject(new Error('execCommand failed'));
        }
      } catch (err) {
        document.body.removeChild(textarea);
        reject(err);
      }
    });
  }

  // Update button state (success/error/idle)
  function updateButtonState(button, state) {
    button.classList.remove(BUTTON_CLASS + '--success', BUTTON_CLASS + '--error', 'copying');
    const icon = button.querySelector('.copy-icon');
    const text = button.querySelector('.copy-text');

    if (state === 'success') {
      button.classList.add(BUTTON_CLASS + '--success');
      if (icon) icon.textContent = '✓';
      if (text) text.textContent = ' Copied!';
    } else if (state === 'error') {
      button.classList.add(BUTTON_CLASS + '--error');
      if (icon) icon.textContent = '✗';
      if (text) text.textContent = ' Error';
    } else {
      if (icon) icon.textContent = '📋';
      if (text) text.textContent = ' Copy';
    }

    if (state !== 'idle') {
      setTimeout(function() { updateButtonState(button, 'idle'); }, SUCCESS_DURATION);
    }
  }

  // Get text to copy from element
  function getCopyText(element) {
    const dataText = element.getAttribute('data-copy-text');
    if (dataText) return dataText;

    const cloned = element.cloneNode(true);
    const btn = cloned.querySelector('.' + BUTTON_CLASS);
    if (btn) btn.remove();

    const tag = element.tagName.toLowerCase();
    if (tag === 'pre' || tag === 'code') {
      return cloned.textContent || '';
    }
    return cloned.textContent || '';
  }

  // Initialize copyboxes on elements
  function init() {
    document.querySelectorAll(SELECTOR).forEach(function(element) {
      if (element.classList.contains('has-copybox')) return;
      element.classList.add('has-copybox');

      const style = window.getComputedStyle(element);
      if (style.position === 'static') {
        element.style.position = 'relative';
      }

      const button = createButton();
      button.addEventListener('click', function() {
        updateButtonState(button, 'copying');
        const text = getCopyText(element);
        if (!text.trim()) {
          updateButtonState(button, 'error');
          return;
        }
        copyToClipboard(text).then(function() {
          updateButtonState(button, 'success');
        }).catch(function() {
          // Fallback: select text
          const selection = window.getSelection();
          const range = document.createRange();
          range.selectNodeContents(element);
          if (selection) {
            selection.removeAllRanges();
            selection.addRange(range);
          }
          updateButtonState(button, 'error');
        });
      });
      element.appendChild(button);
    });
  }

  // Setup MutationObserver for dynamic content
  function setupObserver() {
    if (observerSetup || typeof MutationObserver === 'undefined') return;
    observerSetup = true;

    const observer = new MutationObserver(function(mutations) {
      let shouldInit = false;
      mutations.forEach(function(mutation) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(function(node) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.matches && node.matches(SELECTOR)) {
                shouldInit = true;
              } else if (node.querySelector && node.querySelector(SELECTOR)) {
                shouldInit = true;
              }
            }
          });
        }
      });
      if (shouldInit) {
        setTimeout(init, 0);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Initialize on DOM ready
  function start() {
    init();
    setupObserver();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start);
    } else {
      start();
    }
  }
})();
