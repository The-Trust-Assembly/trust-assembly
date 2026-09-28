/**
 * Synchronize the containing iOS app's auth state into Safari WebExtension
 * storage. Safari's native app extension and JavaScript extension have
 * separate sandboxes, so App Group UserDefaults cannot be read directly here.
 */
(function() {
  const taUsesPromiseAPI = typeof browser !== "undefined" && browser.runtime && browser.storage;
  const taNativeRuntime = taUsesPromiseAPI ? browser.runtime : chrome.runtime;
  const taNativeStorage = taUsesPromiseAPI ? browser.storage.local : chrome.storage.local;
  const taNativeTabs = taUsesPromiseAPI ? browser.tabs : chrome.tabs;
  const taNativeAlarms = taUsesPromiseAPI ? browser.alarms : chrome.alarms;

  function sendNativeMessage(message) {
    if (taUsesPromiseAPI) {
      return taNativeRuntime.sendNativeMessage("org.trustassembly.app", message);
    }

    return new Promise((resolve, reject) => {
      try {
        taNativeRuntime.sendNativeMessage(
          "org.trustassembly.app",
          message,
          response => {
            const lastError = taNativeRuntime.lastError;
            if (lastError) reject(new Error(lastError.message));
            else resolve(response);
          }
        );
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageSet(values) {
    if (taUsesPromiseAPI) return taNativeStorage.set(values);
    return new Promise((resolve, reject) => {
      try {
        taNativeStorage.set(values, () => {
          const lastError = taNativeRuntime.lastError;
          if (lastError) reject(new Error(lastError.message));
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  function storageRemove(keys) {
    if (taUsesPromiseAPI) return taNativeStorage.remove(keys);
    return new Promise((resolve, reject) => {
      try {
        taNativeStorage.remove(keys, () => {
          const lastError = taNativeRuntime.lastError;
          if (lastError) reject(new Error(lastError.message));
          else resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function syncNativeAuth() {
    try {
      const state = await sendNativeMessage({ type: "getAuthState" });
      if (state && state.ok && state.loggedIn && state.authToken) {
        await storageSet({
          "ta-auth-token": state.authToken,
          "ta-auth-user": JSON.stringify({
            username: state.username || "",
            displayName: state.displayName || state.username || ""
          })
        });
        Promise.resolve(taNativeRuntime.sendMessage({ type: "TA_AUTH_CHANGED", loggedIn: true }))
          .catch(() => {});
      } else {
        await storageRemove(["ta-auth-token", "ta-auth-user", "ta-assemblies"]);
        Promise.resolve(taNativeRuntime.sendMessage({ type: "TA_AUTH_CHANGED", loggedIn: false }))
          .catch(() => {});
      }
    } catch (error) {
      // Native messaging is available only in the packaged Safari build. Do
      // not erase a separately authenticated extension session on a transient
      // bridge error.
      console.warn("[Trust Assembly] Native auth sync unavailable:", error.message);
    }
  }

  syncNativeAuth();
  taNativeRuntime.onStartup && taNativeRuntime.onStartup.addListener(syncNativeAuth);
  taNativeRuntime.onInstalled && taNativeRuntime.onInstalled.addListener(syncNativeAuth);
  // A native app login/logout cannot directly wake a WebExtension worker.
  // Recheck on normal browsing activity so Safari converges without requiring
  // a browser restart. These events are also useful when workers are resumed.
  if (taNativeTabs?.onActivated) {
    taNativeTabs.onActivated.addListener(syncNativeAuth);
  }
  if (taNativeAlarms?.onAlarm) {
    taNativeAlarms.onAlarm.addListener(syncNativeAuth);
  }
})();
