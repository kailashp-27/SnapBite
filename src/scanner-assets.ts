import type {ScannerConfig} from './scanner-math';

export const SCANNER_CACHE = 'snapbite-scanner-v1';
const MANIFEST_URL = '/models/snapbite-v1/manifest.json';
export interface ScannerAsset {id: 'model' | 'wasm' | 'module'; url: string; sha256: string; bytes: number;}
export interface ScannerManifest {version: string; config: ScannerConfig; assets: ScannerAsset[]; totalBytes: number;}
export interface DownloadProgress {loaded: number; total: number; file: string;}
let manifestPromise: Promise<ScannerManifest> | undefined;

function validateManifest(value: unknown): ScannerManifest {
  const manifest = value as ScannerManifest;
  if (!manifest || manifest.version !== 'snapbite-v1' || !Array.isArray(manifest.assets) || manifest.assets.length !== 3 || new Set(manifest.assets.map(asset => asset.id)).size !== 3 || !['model', 'wasm', 'module'].every(id => manifest.assets.some(asset => asset.id === id))) throw Error('The scanner package is invalid.');
  for (const asset of manifest.assets) if (!asset.url.startsWith('/models/snapbite-v1/') || /\.\.|[?#]/.test(asset.url) || !/^[a-f0-9]{64}$/.test(asset.sha256) || !Number.isSafeInteger(asset.bytes) || asset.bytes <= 0 || asset.bytes > 100 * 1024 * 1024) throw Error('The scanner assets are invalid.');
  const config = manifest.config;
  if (!config || config.inputSize !== 224 || config.resizeShortSide !== 256 || config.labels.length !== 101 || config.regionalLabels.length !== 15 || config.mean.length !== 3 || config.std.length !== 3) throw Error('The scanner configuration is invalid.');
  manifest.totalBytes = manifest.assets.reduce((sum, asset) => sum + asset.bytes, 0);
  return manifest;
}

export async function scannerManifest(): Promise<ScannerManifest> {
  if (!manifestPromise) manifestPromise = (async () => {
    try {
      const response = await fetch(MANIFEST_URL, {cache: 'no-cache', signal: AbortSignal.timeout(15000)});
      if (!response.ok || !response.headers.get('content-type')?.includes('json')) throw Error('No manifest');
      return validateManifest(await response.json());
    } catch {
      const cached = await caches.open(SCANNER_CACHE).then(cache => cache.match(MANIFEST_URL));
      if (cached) return validateManifest(await cached.json());
      throw Error('Connect once to set up the offline scanner, then it will work without internet.');
    }
  })().catch(error => {manifestPromise = undefined; throw error;});
  return manifestPromise;
}
export async function scannerReady(manifest: ScannerManifest): Promise<boolean> {
  if (!('caches' in globalThis)) return false;
  const cache = await caches.open(SCANNER_CACHE);
  const entries = await Promise.all(manifest.assets.map(asset => cache.match(asset.url)));
  const ready = entries.every((response, index) => response?.headers.get('X-SnapBite-SHA256') === manifest.assets[index].sha256);
  // Persist calibration updates even when the already verified weights/runtime
  // need no download. Offline reloads must use the same model configuration.
  if (ready) await cache.put(MANIFEST_URL, new Response(JSON.stringify(manifest), {headers: {'Content-Type': 'application/json'}}));
  return ready;
}
async function digest(bytes: ArrayBuffer): Promise<string> {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), value => value.toString(16).padStart(2, '0')).join('');
}
export async function prepareScanner(manifest: ScannerManifest, onProgress: (progress: DownloadProgress) => void, signal?: AbortSignal): Promise<void> {
  if (!('caches' in globalThis)) throw Error('Offline storage is unavailable in this browser. Enable site storage and try again.');
  const cache = await caches.open(SCANNER_CACHE);
  await cache.put(MANIFEST_URL, new Response(JSON.stringify(manifest), {headers: {'Content-Type': 'application/json'}}));
  let loaded = 0;
  for (const asset of manifest.assets) {
    const cached = await cache.match(asset.url);
    if (cached?.headers.get('X-SnapBite-SHA256') === asset.sha256) {loaded += asset.bytes; onProgress({loaded, total: manifest.totalBytes, file: asset.id}); continue;}
    const response = await fetch(asset.url, {cache: 'reload', signal});
    if (!response.ok || !response.body) throw Error('The scanner download was interrupted. Reconnect and tap Retry; completed files are kept.');
    const reader = response.body.getReader(); const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      chunks.push(value); size += value.byteLength;
      if (size > asset.bytes) {await reader.cancel(); throw Error('The scanner download has an unexpected size. Please retry.');}
      onProgress({loaded: loaded + size, total: manifest.totalBytes, file: asset.id});
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
    if (size !== asset.bytes || await digest(bytes.buffer) !== asset.sha256) throw Error('The scanner download did not pass its integrity check. Please retry.');
    const headers = new Headers(response.headers); headers.set('X-SnapBite-SHA256', asset.sha256);
    await cache.put(asset.url, new Response(bytes, {headers})); loaded += size;
  }
  onProgress({loaded, total: manifest.totalBytes, file: 'ready'});
}
export async function cachedScannerAsset(asset: ScannerAsset): Promise<ArrayBuffer> {
  const response = await (await caches.open(SCANNER_CACHE)).match(asset.url);
  if (!response || response.headers.get('X-SnapBite-SHA256') !== asset.sha256) throw Error('Part of the offline scanner was removed by your browser. Connect and set it up again.');
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength !== asset.bytes || await digest(bytes) !== asset.sha256) throw Error('The cached scanner needs to be downloaded again.');
  return bytes;
}
