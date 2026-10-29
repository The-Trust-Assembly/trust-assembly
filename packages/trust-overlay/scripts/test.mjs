import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import vm from "node:vm";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDirectory, "..");
const adapterTemplate = await readFile(path.join(packageRoot, "adapters", "webview.js"), "utf8");
const contentScript = await readFile(path.join(packageRoot, "src", "content.js"), "utf8");
const popupScript = await readFile(path.join(packageRoot, "src", "popup.js"), "utf8");
const adapter = adapterTemplate.replace("__TA_MOBILE_ICON_MAP__", JSON.stringify({ "icon128.png": "data:test" }));

// Syntax-check the exact JavaScript concatenation generated for React Native.
new Function(`${adapter}\n${contentScript}`);

// Feed/homepage replacements must include the author's private pending cache,
// both for fresh batch responses and previously cached public misses.
assert.match(contentScript, /mergeOwnPendingFeedMatches\(url, publicMatches, pendingEntries\)/);
assert.match(contentScript, /mergeOwnPendingFeedMatches\(url, cached\.matches, pendingEntries\)/);
assert.match(contentScript, /refreshOwnPendingFeedCorrections\(\)\.catch/);
assert.match(contentScript, /data = await mergeOwnPendingSubmissions\(url, data\)/);
assert.match(contentScript, /corrections: \(data\.corrections \|\| \[\]\)\.filter\(item => !item\.isOwnSubmission\)/);
assert.match(contentScript, /message\.type === "TA_GET_PAGE_INFO"/);
assert.match(contentScript, /document\.querySelector\("\[data-ta-original-text\]"\)/);
assert.match(popupScript, /async function getActiveTab\(\)/);
assert.match(popupScript, /await browser\.tabs\.query\(query\)/);
assert.doesNotMatch(popupScript, /await chrome\.tabs\.query\(/);
assert.match(popupScript, /requestPageInfo\(tab\.id\)/);
assert.match(popupScript, /browser\.tabs\.executeScript\(tabId, \{ file: "content\.js" \}\)/);
assert.match(popupScript, /extractPageInfoFromFirefoxTab\(tabId\)/);
assert.match(popupScript, /meta\[name="author"\]/);

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

let batchResult;
const batchBody = JSON.stringify({ urls: ["https://example.com/other-story"] });
windowObject.chrome.runtime.sendMessage(
  {
    type: "TA_FETCH",
    url: "https://trustassembly.org/api/corrections/batch",
    method: "POST",
    body: batchBody,
  },
  (result) => { batchResult = result; },
);
const batchRequest = postedMessages.find(
  (message) => message.type === "TA_FETCH" && message.url.endsWith("/batch"),
);
assert.equal(batchRequest.method, "POST");
assert.equal(batchRequest.body, batchBody);
windowObject.__TA_MOBILE_DISPATCH__({
  type: "TA_FETCH_RESULT",
  requestId: batchRequest.requestId,
  response: { ok: true, data: { results: {} } },
});
assert.deepEqual(batchResult, { ok: true, data: { results: {} } });

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

// Unsaved popup corrections must be isolated by article URL. This evaluates
// only the state-management preamble, before the popup's DOM setup begins.
const popupPreamble = popupScript.split('document.addEventListener("DOMContentLoaded"')[0];
const popupStorage = new Map();
function createPopupDraftContext() {
  const popupContext = vm.createContext({
    URL,
    clearTimeout,
    setTimeout,
    storageGet: async (keys) => Object.fromEntries(
      keys.filter(key => popupStorage.has(key)).map(key => [key, popupStorage.get(key)]),
    ),
    storageSet: async (values) => {
      for (const [key, value] of Object.entries(values)) popupStorage.set(key, value);
    },
  });
  vm.runInContext(`${popupPreamble}\n;globalThis.__draftTest = {
    setUrl(value) { currentUrl = value; },
    setHeadline(value) { formState.headline = value; },
    getHeadline() { return formState.headline; },
    save: saveFormState,
    load: loadFormState,
    clear: clearFormState,
  };`, popupContext);
  return popupContext.__draftTest;
}

const articleA = createPopupDraftContext();
articleA.setUrl("https://example.com/article-a#section");
articleA.setHeadline("Correction for article A");
await articleA.save();

const articleB = createPopupDraftContext();
articleB.setUrl("https://example.com/article-b");
await articleB.load();
assert.equal(articleB.getHeadline(), "");

const restoredArticleA = createPopupDraftContext();
restoredArticleA.setUrl("https://example.com/article-a");
await restoredArticleA.load();
assert.equal(restoredArticleA.getHeadline(), "Correction for article A");
await restoredArticleA.clear();

const clearedArticleA = createPopupDraftContext();
clearedArticleA.setUrl("https://example.com/article-a");
await clearedArticleA.load();
assert.equal(clearedArticleA.getHeadline(), "");

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
