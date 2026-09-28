const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const appRoot = path.resolve(__dirname, '..');
const originalTsLoader = require.extensions['.ts'];

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

const {
  buildOverlayFetchRequest,
  correctionCacheKey,
  extractSharedUrl,
  normalizeBrowserUrl,
} = require(path.join(appRoot, 'src', 'utils', 'urlUtils.ts'));

test.after(() => {
  if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
  else delete require.extensions['.ts'];
});

test('normalizes safe browser addresses and rejects privileged schemes', () => {
  assert.equal(normalizeBrowserUrl('example.com/story'), 'https://example.com/story');
  assert.equal(normalizeBrowserUrl('javascript:alert(1)'), null);
  assert.equal(normalizeBrowserUrl('https://user:secret@example.com'), null);
});

test('extracts Trust Assembly deep links and shared prose', () => {
  assert.equal(
    extractSharedUrl('trustassembly://open?url=https%3A%2F%2Fexample.com%2Fstory'),
    'https://example.com/story',
  );
  assert.equal(
    extractSharedUrl('Worth reading: https://example.com/story.'),
    'https://example.com/story',
  );
});

test('normalizes correction cache keys', () => {
  assert.equal(
    correctionCacheKey('https://www.example.com/story/?utm_source=test#section'),
    'https://example.com/story',
  );
});

test('bridge requests cannot redirect corrections to a different article', () => {
  const request = buildOverlayFetchRequest(
    'https://trustassembly.org/api/corrections?url=https%3A%2F%2Fevil.example%2F',
    'https://example.com/real-story',
  );
  assert.deepEqual(request, {
    kind: 'corrections',
    articleUrl: 'https://example.com/real-story',
    path: '/api/corrections?url=https%3A%2F%2Fexample.com%2Freal-story',
  });
});

test('bridge blocks non-public endpoints and invalid assembly identifiers', () => {
  assert.equal(
    buildOverlayFetchRequest('https://trustassembly.org/api/users/me', 'https://example.com'),
    null,
  );
  assert.equal(
    buildOverlayFetchRequest(
      'https://trustassembly.org/api/vault?orgIds=not-a-uuid&type=vault',
      'https://example.com',
    ),
    null,
  );
});
