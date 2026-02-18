(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __moduleCache = /* @__PURE__ */ new WeakMap;
  var __toCommonJS = (from) => {
    var entry = __moduleCache.get(from), desc;
    if (entry)
      return entry;
    entry = __defProp({}, "__esModule", { value: true });
    if (from && typeof from === "object" || typeof from === "function")
      __getOwnPropNames(from).map((key) => !__hasOwnProp.call(entry, key) && __defProp(entry, key, {
        get: () => from[key],
        enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
      }));
    __moduleCache.set(from, entry);
    return entry;
  };
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, {
        get: all[name],
        enumerable: true,
        configurable: true,
        set: (newValue) => all[name] = () => newValue
      });
  };

  // src/lib/copybox.ts
  var exports_copybox = {};
  __export(exports_copybox, {
    isClipboardSupported: () => isClipboardSupported,
    initCopyBoxes: () => initCopyBoxes,
    createCopyButton: () => createCopyButton,
    copyToClipboard: () => copyToClipboard
  });
  var DEFAULT_OPTIONS = {
    selector: "[data-copy]",
    buttonClass: "copy-button",
    successDuration: 2000
  };
  var buttonStates = new Map;
  async function copyToClipboard(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {}
    }
    return new Promise((resolve, reject) => {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "-9999px";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        const successful = document.execCommand("copy");
        document.body.removeChild(textArea);
        if (successful) {
          resolve();
        } else {
          reject(new Error("execCommand copy failed"));
        }
      } catch (err) {
        document.body.removeChild(textArea);
        reject(err);
      }
    });
  }
  function createCopyButton(options) {
    const button = document.createElement("button");
    const opts = { ...DEFAULT_OPTIONS, ...options };
    button.type = "button";
    button.className = opts.buttonClass;
    button.setAttribute("aria-label", "Copy to clipboard");
    button.setAttribute("title", "Copy to clipboard");
    const iconSpan = document.createElement("span");
    iconSpan.className = "copy-icon";
    iconSpan.setAttribute("aria-hidden", "true");
    const textSpan = document.createElement("span");
    textSpan.className = "copy-text";
    iconSpan.textContent = "\uD83D\uDCCB";
    textSpan.textContent = " Copy";
    button.appendChild(iconSpan);
    button.appendChild(textSpan);
    buttonStates.set(button, {
      status: "idle"
    });
    return button;
  }
  function updateButtonState(button, status, options) {
    const state = buttonStates.get(button);
    if (!state)
      return;
    if (state.timeoutId) {
      clearTimeout(state.timeoutId);
    }
    const iconSpan = button.querySelector(".copy-icon");
    const textSpan = button.querySelector(".copy-text");
    state.status = status;
    button.classList.remove(`${options.buttonClass}--success`, `${options.buttonClass}--error`);
    button.classList.remove("copying");
    if (status === "success") {
      button.classList.add(`${options.buttonClass}--success`);
      if (iconSpan)
        iconSpan.textContent = "✓";
      if (textSpan)
        textSpan.textContent = " Copied!";
    } else if (status === "error") {
      button.classList.add(`${options.buttonClass}--error`);
      if (iconSpan)
        iconSpan.textContent = "✗";
      if (textSpan)
        textSpan.textContent = " Error";
    } else {
      if (iconSpan)
        iconSpan.textContent = "\uD83D\uDCCB";
      if (textSpan)
        textSpan.textContent = " Copy";
    }
    if (status === "success" || status === "error") {
      state.timeoutId = window.setTimeout(() => {
        updateButtonState(button, "idle", options);
      }, options.successDuration);
    }
  }
  function getCopyText(targetElement) {
    const dataText = targetElement.getAttribute("data-copy-text");
    if (dataText) {
      return dataText;
    }
    const cloned = targetElement.cloneNode(true);
    const copyButton = cloned.querySelector(".copy-button");
    if (copyButton) {
      copyButton.remove();
    }
    const tagName = targetElement.tagName.toLowerCase();
    if (tagName === "pre" || tagName === "code") {
      return cloned.textContent || "";
    }
    return cloned.textContent || "";
  }
  async function handleCopyClick(event, options) {
    const button = event.currentTarget;
    const targetSelector = button.getAttribute("data-copy-target");
    let targetElement = null;
    if (targetSelector) {
      targetElement = document.querySelector(targetSelector);
    } else {
      const parent = button.closest("[data-copy]");
      if (parent) {
        const copyableContent = parent.querySelector("code, pre, .copy-content");
        targetElement = copyableContent || parent;
      }
    }
    if (!targetElement) {
      console.error("Copybox: No target element found");
      return;
    }
    const text = getCopyText(targetElement);
    if (!text.trim()) {
      updateButtonState(button, "error", options);
      return;
    }
    button.classList.add("copying");
    const state = buttonStates.get(button);
    if (state) {
      state.status = "copying";
    }
    try {
      await copyToClipboard(text);
      updateButtonState(button, "success", options);
      if (options.onSuccess) {
        options.onSuccess(text);
      }
    } catch (err) {
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(targetElement);
      selection?.removeAllRanges();
      selection?.addRange(range);
      updateButtonState(button, "error", options);
      if (options.onError && err instanceof Error) {
        options.onError(err);
      } else if (options.onError) {
        options.onError(new Error(String(err)));
      }
    }
  }
  function initCopyBoxes(options) {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const elements = document.querySelectorAll(opts.selector);
    elements.forEach((element) => {
      const container = element;
      if (container.classList.contains("has-copybox")) {
        return;
      }
      container.classList.add("has-copybox");
      const computedStyle = window.getComputedStyle(container);
      if (computedStyle.position === "static") {
        container.style.position = "relative";
      }
      const button = createCopyButton(opts);
      button.addEventListener("click", (e) => handleCopyClick(e, opts));
      container.appendChild(button);
    });
    setupMutationObserver(opts);
  }
  function setupMutationObserver(options) {
    if (typeof MutationObserver === "undefined") {
      return;
    }
    const observer = new MutationObserver((mutations) => {
      let shouldReinitialize = false;
      mutations.forEach((mutation) => {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node;
              if (element.matches(options.selector) || element.querySelector(options.selector)) {
                shouldReinitialize = true;
              }
            }
          });
        }
      });
      if (shouldReinitialize) {
        setTimeout(() => {
          initCopyBoxes(options);
        }, 0);
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  function isClipboardSupported() {
    return !!(navigator.clipboard && window.isSecureContext) || typeof document.execCommand === "function";
  }
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => initCopyBoxes());
    } else {
      initCopyBoxes();
    }
  }
})();
