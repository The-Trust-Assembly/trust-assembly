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

test.after(() => {
  delete process.env.EXPO_PUBLIC_TA_API_BASE;
  if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
  else delete require.extensions['.ts'];
});

test('Expo development API base reaches native requests and the shared overlay', () => {
  process.env.EXPO_PUBLIC_TA_API_BASE = 'http://127.0.0.1:3000/';

  const { TA_API_BASE } = require(path.join(appRoot, 'src', 'utils', 'constants.ts'));
  const { getContentScript } = require(path.join(appRoot, 'src', 'utils', 'contentScriptUtils.ts'));

  assert.equal(TA_API_BASE, 'http://127.0.0.1:3000');
  const script = getContentScript();
  assert.match(script, /const TA_API_BASE = "http:\/\/127\.0\.0\.1:3000"/);
  assert.doesNotMatch(script, /const TA_API_BASE = "https:\/\/trustassembly\.org"/);
});

