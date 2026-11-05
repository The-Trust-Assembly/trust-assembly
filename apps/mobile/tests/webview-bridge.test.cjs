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

const { parseTrustedWebViewMessage } = require(
  path.join(appRoot, 'src', 'utils', 'webViewBridge.ts'),
);

test.after(() => {
  if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
  else delete require.extensions['.ts'];
});

const ARTICLE = 'https://www.example.com/news/story?utm_source=fixture#top';

test('accepts and sanitizes messages from the current top-level article', () => {
  const fetchMessage = parseTrustedWebViewMessage(
    JSON.stringify({
      type: 'TA_FETCH',
      requestId: 'request-1',
      url: 'https://trustassembly.org/api/corrections?url=ignored',
      method: 'GET',
      extra: 'discarded',
    }),
    ARTICLE,
    'https://example.com/news/story',
  );
  assert.deepEqual(fetchMessage, {
    type: 'TA_FETCH',
    requestId: 'request-1',
    url: 'https://trustassembly.org/api/corrections?url=ignored',
    method: 'GET',
  });

  const metadata = parseTrustedWebViewMessage(
    JSON.stringify({
      type: 'TA_PAGE_METADATA',
      url: ARTICLE,
      title: `  ${'A'.repeat(1100)}  `,
      authors: ['  Reporter One  ', 7, '', 'Reporter Two'],
      contentType: 'unexpected-type',
    }),
    ARTICLE,
    ARTICLE,
  );
  assert.equal(metadata.title.length, 1000);
  assert.deepEqual(metadata.authors, ['Reporter One', 'Reporter Two']);
  assert.equal(metadata.contentType, 'article');
});

test('rejects malformed, cross-page, iframe, and state-changing messages', () => {
  assert.equal(parseTrustedWebViewMessage('{bad json', ARTICLE, ARTICLE), null);
  assert.equal(
    parseTrustedWebViewMessage(JSON.stringify({ type: 'TA_READY' }), 'https://ads.example/frame', ARTICLE),
    null,
  );
  assert.equal(
    parseTrustedWebViewMessage(
      JSON.stringify({ type: 'TA_PAGE_METADATA', url: 'https://evil.example/story' }),
      ARTICLE,
      ARTICLE,
    ),
    null,
  );
  assert.equal(
    parseTrustedWebViewMessage(JSON.stringify({ type: 'TA_DELETE_ACCOUNT' }), ARTICLE, ARTICLE),
    null,
  );
  assert.equal(
    parseTrustedWebViewMessage(
      JSON.stringify({ type: 'TA_FETCH', requestId: 'x'.repeat(129), url: 'https://trustassembly.org/api/corrections' }),
      ARTICLE,
      ARTICLE,
    ),
    null,
  );
});

test('normalizes correction counts before native state sees them', () => {
  assert.deepEqual(
    parseTrustedWebViewMessage(JSON.stringify({ type: 'TA_COUNT', count: 4.9 }), ARTICLE, ARTICLE),
    { type: 'TA_COUNT', count: 4 },
  );
  assert.deepEqual(
    parseTrustedWebViewMessage(JSON.stringify({ type: 'TA_COUNT', count: -3 }), ARTICLE, ARTICLE),
    { type: 'TA_COUNT', count: 0 },
  );
  assert.equal(
    parseTrustedWebViewMessage(JSON.stringify({ type: 'TA_COUNT', count: '4' }), ARTICLE, ARTICLE),
    null,
  );
});
