import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, "..");
const adapterTemplate = await readFile(path.join(packageRoot, "adapters", "webview.js"), "utf8");
const contentScript = await readFile(path.join(packageRoot, "src", "content.js"), "utf8");
const adapter = adapterTemplate.replace("__TA_MOBILE_ICON_MAP__", JSON.stringify({ "icon128.png": "data:test" }));

// Syntax-check the exact JavaScript concatenation generated for React Native.
new Function(`${adapter}\n${contentScript}`);

const postedMessages = [];
const storage = new Map();
const localStorage = {
  get length() { return storage.size; },
  key(index) { return [...storage.keys()][index] ?? null; },
  getItem(key) { return storage.has(key) ? storage.get(key) : null; },
  setItem(key, value) { storage.set(key, String(value)); },
  removeItem(key) { storage.delete(key); },
};
const windowObject = {
  location: { href: "https://example.com/story" },
  localStorage,
  ReactNativeWebView: {
    postMessage(value) { postedMessages.push(JSON.parse(value)); },
  },
  setTimeout,
  clearTimeout,
};
const context = vm.createContext({
  window: windowObject,
  console,
  Map,
  Object,
  JSON,
  Date,
  Promise,
  queueMicrotask,
  setTimeout,
  clearTimeout,
});
vm.runInContext(adapter, context);

assert.equal(postedMessages[0].type, "TA_READY");
assert.equal(windowObject.chrome.runtime.getURL("icon128.png"), "data:test");

let fetchResult;
windowObject.chrome.runtime.sendMessage(
  { type: "TA_FETCH", url: "https://trustassembly.org/api/corrections?url=https%3A%2F%2Fexample.com%2Fstory" },
  (result) => { fetchResult = result; },
);
const fetchRequest = postedMessages.find((message) => message.type === "TA_FETCH");
assert.ok(fetchRequest?.requestId);
windowObject.__TA_MOBILE_DISPATCH__({
  type: "TA_FETCH_RESULT",
  requestId: fetchRequest.requestId,
  response: { ok: true, data: { corrections: [] } },
});
assert.deepEqual(fetchResult, { ok: true, data: { corrections: [] } });

let settingsMessage;
windowObject.chrome.runtime.onMessage.addListener((message) => {
  if (message.type === "TA_SETTINGS_CHANGED") settingsMessage = message;
});
windowObject.__TA_MOBILE_DISPATCH__({
  type: "TA_SETTINGS_CHANGED",
  settings: { showBadge: false, showTranslations: true },
});
assert.equal(settingsMessage.showBadge, false);
assert.equal(settingsMessage.showTranslations, true);

await new Promise((resolve) => {
  windowObject.chrome.storage.local.get(["showBadge", "showTranslations"], (values) => {
    assert.deepEqual({ ...values }, { showBadge: false, showTranslations: true });
    resolve();
  });
});

windowObject.__TA_MOBILE_DISPATCH__({
  type: "TA_STORAGE_SYNC",
  values: { "ta-assemblies": JSON.stringify({ joined: [{ id: "assembly-1" }], followed: [] }) },
});
await new Promise((resolve) => {
  windowObject.chrome.storage.local.get("ta-assemblies", (values) => {
    assert.deepEqual(JSON.parse(values["ta-assemblies"]), {
      joined: [{ id: "assembly-1" }],
      followed: [],
    });
    resolve();
  });
});

console.log("Shared overlay adapter and generated-script contract passed.");
