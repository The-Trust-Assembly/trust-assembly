import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "../../..");
const packageRoot = path.resolve(scriptDirectory, "..");
const sourceDirectory = path.join(packageRoot, "src");
const manifestsDirectory = path.join(packageRoot, "manifests");
const checkOnly = process.argv.includes("--check");
const devMode = process.argv.includes("--dev");
const productionApiBase = "https://trustassembly.org";

function readArgument(name) {
  const inline = process.argv.find(argument => argument.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function validateApiBase(rawValue) {
  const value = String(rawValue || "").trim().replace(/\/$/, "");
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error(`Invalid --api-base URL: ${value}`); }
  if (!devMode) throw new Error("--api-base may only be used with --dev");
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new Error("The development API base must be an HTTP(S) origin without credentials");
  }
  if (parsed.pathname !== "" && parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error("The development API base must not include a path, query, or fragment");
  }
  return parsed.origin;
}

const requestedApiBase = readArgument("--api-base");
if (requestedApiBase && !devMode) throw new Error("--api-base requires --dev");
const apiBase = devMode
  ? validateApiBase(requestedApiBase || "http://localhost:3000")
  : productionApiBase;
const browserOutputRoot = devMode
  ? path.join(repositoryRoot, ".dev", "trust-overlay")
  : path.join(repositoryRoot, "extensions");

const browserTargets = ["chrome", "firefox", "safari"];
const sharedFiles = [
  "api-client.js",
  "background.js",
  "content.css",
  "content.js",
  "popup.html",
  "popup.js",
  "icon16.png",
  "icon16-affirmed.png",
  "icon16-corrected.png",
  "icon16-pending.png",
  "icon48.png",
  "icon48-affirmed.png",
  "icon48-corrected.png",
  "icon48-pending.png",
  "icon128.png",
  "icon128-affirmed.png",
  "icon128-corrected.png",
  "icon128-pending.png",
];

const packagedTextExtensions = new Set([".css", ".html", ".js", ".json"]);

function normalizeText(value) {
  return value.replace(/\r\n?/g, "\n");
}

async function readCanonicalText(filename) {
  return normalizeText(await readFile(filename, "utf8"));
}

async function readPackageData(filename) {
  const data = await readFile(filename);
  return packagedTextExtensions.has(path.extname(filename).toLowerCase())
    ? Buffer.from(normalizeText(data.toString("utf8")), "utf8")
    : data;
}

async function readBrowserOutputData(filename, { manifest = false, browser } = {}) {
  if (!devMode) return readFile(filename);
  const data = await readPackageData(filename);
  if (!packagedTextExtensions.has(path.extname(filename).toLowerCase())) return data;

  let text = data.toString("utf8").replaceAll(productionApiBase, apiBase);
  if (manifest) {
    const parsed = JSON.parse(text);
    parsed.name = `${parsed.name} (Local Dev)`;
    parsed.description = `${parsed.description} Development API: ${apiBase}`;
    if (browser === "firefox" && parsed.browser_specific_settings?.gecko) {
      // Keep local authentication/storage isolated from the installed
      // production add-on, whose explicit Gecko ID would otherwise be reused.
      parsed.browser_specific_settings.gecko.id = "extension-local-dev@trustassembly.org";
    }
    text = `${JSON.stringify(parsed, null, 2)}\n`;
  }
  return Buffer.from(text, "utf8");
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) {
    value = crcTable[(value ^ byte) & 0xff] ^ (value >>> 8);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const localRecords = [];
  const centralRecords = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const filename = Buffer.from(name, "utf8");
    const checksum = crc32(data);
    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0x0021, 12);
    localHeader.writeUInt32LE(checksum, 14);
    localHeader.writeUInt32LE(data.length, 18);
    localHeader.writeUInt32LE(data.length, 22);
    localHeader.writeUInt16LE(filename.length, 26);
    localHeader.writeUInt16LE(0, 28);
    localRecords.push(localHeader, filename, data);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(0, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0x0021, 14);
    centralHeader.writeUInt32LE(checksum, 16);
    centralHeader.writeUInt32LE(data.length, 20);
    centralHeader.writeUInt32LE(data.length, 24);
    centralHeader.writeUInt16LE(filename.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    centralRecords.push(centralHeader, filename);

    offset += localHeader.length + filename.length + data.length;
  }

  const centralDirectory = Buffer.concat(centralRecords);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(entries.length, 8);
  endRecord.writeUInt16LE(entries.length, 10);
  endRecord.writeUInt32LE(centralDirectory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localRecords, centralDirectory, endRecord]);
}

async function assertDataMatches(expected, destination) {
  const actual = await readFile(destination).catch(() => null);
  if (!actual || !expected.equals(actual)) {
    throw new Error(`Generated file is stale: ${path.relative(repositoryRoot, destination)}`);
  }
}

async function copyOrCheck(source, destination, options) {
  const expected = await readBrowserOutputData(source, options);
  if (checkOnly) {
    await assertDataMatches(expected, destination);
    return;
  }
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, expected);
}

async function buildBrowserTargets() {
  for (const browser of browserTargets) {
    const destinationDirectory = path.join(browserOutputRoot, browser);
    for (const filename of sharedFiles) {
      await copyOrCheck(
        path.join(sourceDirectory, filename),
        path.join(destinationDirectory, filename),
      );
    }
    await copyOrCheck(
      path.join(manifestsDirectory, `${browser}.json`),
      path.join(destinationDirectory, "manifest.json"),
      { manifest: true, browser },
    );
  }
}

async function buildBrowserPackages() {
  for (const browser of browserTargets) {
    const entries = await Promise.all([
      ...sharedFiles.map(async (filename) => ({
        name: filename,
        data: await readPackageData(path.join(sourceDirectory, filename)),
      })),
      (async () => ({
        name: "manifest.json",
        data: await readPackageData(path.join(manifestsDirectory, `${browser}.json`)),
      }))(),
    ]);
    const archive = createZip(entries);
    const destination = path.join(
      repositoryRoot,
      "public",
      `trust-assembly-${browser}.zip`,
    );

    if (checkOnly) {
      const current = await readFile(destination).catch(() => null);
      if (!current || !archive.equals(current)) {
        throw new Error(`Generated package is stale: ${path.relative(repositoryRoot, destination)}`);
      }
    } else {
      await mkdir(path.dirname(destination), { recursive: true });
      await writeFile(destination, archive);
    }
  }
}

async function buildMobileModule() {
  const [adapterTemplate, contentScript, contentCss] = await Promise.all([
    readCanonicalText(path.join(packageRoot, "adapters", "webview.js")),
    readCanonicalText(path.join(sourceDirectory, "content.js")),
    readCanonicalText(path.join(sourceDirectory, "content.css")),
  ]);

  // The page UI only renders toolbar-sized icons. Reuse the 48px assets for
  // 128px names in the WebView adapter instead of embedding four additional
  // large base64 images into the JavaScript evaluated on every navigation.
  const mobileIconSources = {
    "icon48.png": "icon48.png",
    "icon48-affirmed.png": "icon48-affirmed.png",
    "icon48-corrected.png": "icon48-corrected.png",
    "icon48-pending.png": "icon48-pending.png",
    "icon128.png": "icon48.png",
    "icon128-affirmed.png": "icon48-affirmed.png",
    "icon128-corrected.png": "icon48-corrected.png",
    "icon128-pending.png": "icon48-pending.png",
  };
  const mobileIconData = new Map();
  const iconEntries = [];
  for (const [name, sourceName] of Object.entries(mobileIconSources)) {
    if (!mobileIconData.has(sourceName)) {
      const bytes = await readFile(path.join(sourceDirectory, sourceName));
      mobileIconData.set(sourceName, `data:image/png;base64,${bytes.toString("base64")}`);
    }
    iconEntries.push([name, mobileIconData.get(sourceName)]);
  }
  const iconMap = Object.fromEntries(iconEntries);
  const adapter = adapterTemplate.replace(
    "__TA_MOBILE_ICON_MAP__",
    JSON.stringify(iconMap),
  );
  const mobileScript = `${adapter}\n\n${contentScript}`;
  const generated = [
    "/* This file is generated by packages/trust-overlay/scripts/build.mjs. */",
    "/* Edit packages/trust-overlay instead of changing this file directly. */",
    `export const CONTENT_SCRIPT: string = ${JSON.stringify(mobileScript)};`,
    `export const INJECTED_CSS: string = ${JSON.stringify(contentCss)};`,
    "",
  ].join("\n");

  const destination = path.join(
    repositoryRoot,
    "apps",
    "mobile",
    "src",
    "generated",
    "trustOverlay.generated.ts",
  );

  if (checkOnly) {
    const current = await readFile(destination, "utf8").catch(() => null);
    if (current !== generated) {
      throw new Error(`Generated file is stale: ${path.relative(repositoryRoot, destination)}`);
    }
    return;
  }

  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, generated, "utf8");
}

await buildBrowserTargets();
if (devMode) {
  console.log(checkOnly
    ? `Development overlay outputs are current for ${apiBase}.`
    : `Built development overlays in ${path.relative(repositoryRoot, browserOutputRoot)} for ${apiBase}.`);
} else {
  await buildBrowserPackages();
  await buildMobileModule();
  console.log(checkOnly ? "Shared overlay outputs are current." : "Built browser, packaged, and mobile overlay outputs.");
}
