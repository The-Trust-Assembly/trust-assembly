const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const appRoot = path.resolve(__dirname, '..');
const originalTsLoader = require.extensions['.ts'];
const originalModuleLoader = Module._load;
const memory = new Map();
const asyncStorage = {
  async getItem(key) { return memory.has(key) ? memory.get(key) : null; },
  async setItem(key, value) { memory.set(key, String(value)); },
  async removeItem(key) { memory.delete(key); },
};

require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
Module._load = function load(request, parent, isMain) {
  if (request === '@react-native-async-storage/async-storage') return asyncStorage;
  return originalModuleLoader.call(this, request, parent, isMain);
};

const {
  cacheOwnSubmissionPreviews,
  getOwnPendingStorageValue,
  mergeOwnPendingForUrl,
} = require(path.join(appRoot, 'src', 'storage', 'pendingSubmissionStore.ts'));

test.after(() => {
  Module._load = originalModuleLoader;
  if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
  else delete require.extensions['.ts'];
});

const emptyResponse = () => ({
  corrections: [],
  affirmations: [],
  translations: [],
  meta: { totalReviews: 0, highestConsensus: false },
});

test('shows only the author a locally cached pending correction for the matching URL', async () => {
  await cacheOwnSubmissionPreviews(
    {
      submissionType: 'correction',
      url: 'https://www.example.com/story/?utm_source=test',
      originalHeadline: 'Original headline',
      replacement: 'Corrected headline',
      reasoning: 'Because the original is inaccurate.',
      orgIds: ['assembly-1'],
    },
    { id: 'submission-1', status: 'pending_review' },
    { joined: [{ id: 'assembly-1', name: 'Local Assembly' }], followed: [] },
    { id: 'user-1', username: 'citizen' },
  );

  const matching = await mergeOwnPendingForUrl('https://example.com/story', emptyResponse());
  assert.equal(matching.corrections.length, 1);
  assert.equal(matching.corrections[0].replacement, 'Corrected headline');
  assert.equal(matching.corrections[0].isOwnSubmission, true);

  const unrelated = await mergeOwnPendingForUrl('https://example.com/other', emptyResponse());
  assert.equal(unrelated.corrections.length, 0);
});

test('removes the private preview when the reviewed submission becomes public', async () => {
  const publicCorrection = {
    id: 'submission-1',
    submissionType: 'correction',
    originalHeadline: 'Original headline',
    replacement: 'Corrected headline',
    author: '',
    reasoning: 'Reviewed',
    evidence: [],
    submittedBy: 'citizen',
    orgName: 'Local Assembly',
    status: 'approved',
    trustScore: null,
    profile: {},
  };
  const merged = await mergeOwnPendingForUrl('https://example.com/story', {
    ...emptyResponse(),
    corrections: [publicCorrection],
    meta: { totalReviews: 1, highestConsensus: false },
  });
  assert.equal(merged.corrections.length, 1);
  assert.equal(merged.corrections[0].isOwnSubmission, undefined);
  assert.deepEqual(JSON.parse(await getOwnPendingStorageValue()), []);
});
