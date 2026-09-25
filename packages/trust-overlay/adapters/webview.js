/**
 * React Native WebView adapter for the canonical Trust Assembly content script.
 *
 * The browser extension expects the small subset of chrome.runtime and
 * chrome.storage implemented below. Privileged work stays in React Native;
 * the untrusted page may only request public correction data and report UI
 * state such as the badge count.
 */
(function installTrustAssemblyWebViewAdapter() {
  "use strict";

  if (window.__TA_WEBVIEW_ADAPTER_INSTALLED__) return;
  window.__TA_WEBVIEW_ADAPTER_INSTALLED__ = true;

  const ICON_URLS = __TA_MOBILE_ICON_MAP__;
  const STORAGE_PREFIX = "ta-mobile-extension:";
  const requestCallbacks = new Map();
  const runtimeListeners = [];
  const storageListeners = [];
  let nextRequestId = 1;

  function postToNative(message) {
    try {
      if (window.ReactNativeWebView?.postMessage) {
        window.ReactNativeWebView.postMessage(JSON.stringify(message));
        return true;
      }
    } catch (error) {
      console.warn("[TrustAssembly] Native bridge unavailable:", error?.message || error);
    }
    return false;
  }

  function normalizeKeys(keys) {
    if (keys == null) return [];
    if (typeof keys === "string") return [keys];
    if (Array.isArray(keys)) return keys;
    if (typeof keys === "object") return Object.keys(keys);
    return [];
  }

  function readStoredValue(key, fallback) {
    try {
      const raw = window.localStorage.getItem(STORAGE_PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (_) {
      return fallback;
    }
  }

  function notifyStorageListeners(changes) {
    if (Object.keys(changes).length === 0) return;
    for (const listener of [...storageListeners]) {
      try { listener(changes, "local"); } catch (_) {}
    }
  }

  const localStorageArea = {
    get(keys, callback) {
      const result = {};
      if (keys == null) {
        try {
          for (let index = 0; index < window.localStorage.length; index += 1) {
            const storageKey = window.localStorage.key(index);
            if (!storageKey?.startsWith(STORAGE_PREFIX)) continue;
            const key = storageKey.slice(STORAGE_PREFIX.length);
            result[key] = readStoredValue(key, undefined);
          }
        } catch (_) {}
      } else {
        for (const key of normalizeKeys(keys)) {
          const fallback = !Array.isArray(keys) && typeof keys === "object"
            ? keys[key]
            : undefined;
          const value = readStoredValue(key, fallback);
          if (value !== undefined) result[key] = value;
        }
      }
      queueMicrotask(() => callback?.(result));
    },

    set(values, callback) {
      const changes = {};
      for (const [key, value] of Object.entries(values || {})) {
        const oldValue = readStoredValue(key, undefined);
        try {
          window.localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
          changes[key] = { oldValue, newValue: value };
        } catch (_) {}
      }
      notifyStorageListeners(changes);
      queueMicrotask(() => callback?.());
    },

    remove(keys, callback) {
      const changes = {};
      for (const key of normalizeKeys(keys)) {
        const oldValue = readStoredValue(key, undefined);
        try { window.localStorage.removeItem(STORAGE_PREFIX + key); } catch (_) {}
        if (oldValue !== undefined) changes[key] = { oldValue, newValue: undefined };
      }
      notifyStorageListeners(changes);
      queueMicrotask(() => callback?.());
    },
  };

  const runtime = {
    lastError: null,
    getURL(filename) {
      return ICON_URLS[filename] || "";
    },
    sendMessage(message, callback) {
      if (!message || typeof message.type !== "string") {
        queueMicrotask(() => callback?.({ ok: false, error: "Invalid message" }));
        return;
      }

      if (message.type === "TA_FETCH") {
        const requestId = `ta-${Date.now()}-${nextRequestId++}`;
        const timeout = window.setTimeout(() => {
          const pending = requestCallbacks.get(requestId);
          if (!pending) return;
          requestCallbacks.delete(requestId);
          pending({ ok: false, error: "Correction request timed out" });
        }, 15000);
        requestCallbacks.set(requestId, (response) => {
          window.clearTimeout(timeout);
          callback?.(response);
        });
        if (!postToNative({ ...message, requestId })) {
          window.clearTimeout(timeout);
          requestCallbacks.delete(requestId);
          queueMicrotask(() => callback?.({ ok: false, error: "Native bridge unavailable" }));
        }
        return;
      }

      postToNative(message);
      queueMicrotask(() => callback?.({ ok: true }));
    },
    onMessage: {
      addListener(listener) {
        if (typeof listener === "function" && !runtimeListeners.includes(listener)) {
          runtimeListeners.push(listener);
        }
      },
      removeListener(listener) {
        const index = runtimeListeners.indexOf(listener);
        if (index >= 0) runtimeListeners.splice(index, 1);
      },
    },
  };

  function dispatchToContentScript(rawMessage) {
    let message = rawMessage;
    if (typeof message === "string") {
      try { message = JSON.parse(message); } catch (_) { return false; }
    }
    if (!message || typeof message.type !== "string") return false;

    if (message.type === "TA_FETCH_RESULT") {
      const callback = requestCallbacks.get(message.requestId);
      if (!callback) return false;
      requestCallbacks.delete(message.requestId);
      callback(message.response || { ok: false, error: "Empty native response" });
      return true;
    }

    if (message.type === "TA_STORAGE_SYNC" && message.values && typeof message.values === "object") {
      localStorageArea.set(message.values);
      return true;
    }

    // The native UI groups settings for its own type safety. The canonical
    // extension message keeps the values at the top level.
    if (message.type === "TA_SETTINGS_CHANGED" && message.settings) {
      message = { ...message, ...message.settings };
      localStorageArea.set({
        showBadge: message.showBadge !== false,
        showTranslations: message.showTranslations !== false,
      });
    }

    let handled = false;
    for (const listener of [...runtimeListeners]) {
      try {
        const result = listener(message, { url: window.location.href }, () => {});
        handled = handled || result !== undefined;
      } catch (_) {}
    }
    return handled;
  }

  const chromeApi = window.chrome || {};
  chromeApi.runtime = runtime;
  chromeApi.storage = {
    ...(chromeApi.storage || {}),
    local: localStorageArea,
    onChanged: {
      addListener(listener) {
        if (typeof listener === "function" && !storageListeners.includes(listener)) {
          storageListeners.push(listener);
        }
      },
      removeListener(listener) {
        const index = storageListeners.indexOf(listener);
        if (index >= 0) storageListeners.splice(index, 1);
      },
    },
  };
  window.chrome = chromeApi;
  window.__TA_MOBILE_DISPATCH__ = dispatchToContentScript;

  postToNative({ type: "TA_READY", url: window.location.href });
})();
