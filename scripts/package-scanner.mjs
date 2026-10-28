import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const directory = 'public/models/snapbite-v1';
const config = JSON.parse(await fs.readFile(path.join(directory, 'config.json'), 'utf8'));
await fs.mkdir(path.join(directory, 'runtime'), {recursive: true});
const files = [
  {id: 'model', filename: 'model.onnx', source: 'ml/models/snapbite-v1.onnx'},
  {id: 'wasm', filename: 'runtime/ort-wasm-simd-threaded.wasm', source: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm'},
  {id: 'module', filename: 'runtime/ort-wasm-simd-threaded.mjs', source: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs'},
];
const assets = [];
for (const file of files) {
  const bytes = await fs.readFile(file.source ?? path.join(directory, file.filename));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (file.id === 'model' && sha256 !== config.modelSha256) throw Error('Trained model does not match its recorded checksum.');
  const extension = path.extname(file.filename);
  const hashedName = file.filename.slice(0, -extension.length) + `.${sha256.slice(0,12)}${extension}`;
  await fs.writeFile(path.join(directory, hashedName), bytes);
  assets.push({id: file.id, url: `/models/snapbite-v1/${hashedName}`, sha256, bytes: bytes.length});
}
const manifest = {version: 'snapbite-v1', runtime: {name: 'onnxruntime-web', version: '1.23.2', license: 'MIT'}, config, assets, totalBytes: assets.reduce((total, asset) => total + asset.bytes, 0)};
await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
// Remove only stale generated assets; never touch source weights or user data.
const allowed = new Set(assets.map(asset => asset.url.replace('/models/snapbite-v1/', '')));
for (const subdirectory of ['', 'runtime']) {
  const directoryPath = path.resolve(directory, subdirectory);
  for (const name of await fs.readdir(directoryPath)) {
    const relative = subdirectory ? subdirectory + '/' + name : name;
    if ((/^model(?:\.[a-f0-9]{12})?\.onnx$/.test(name) || /^ort-wasm-simd-threaded(?:\.[a-f0-9]{12})?\.(?:mjs|wasm)$/.test(name)) && !allowed.has(relative)) await fs.unlink(path.join(directoryPath, name));
  }
}
console.log(`Scanner packaged: ${(manifest.totalBytes / 1024 / 1024).toFixed(1)} MB, integrity checks for ${assets.length} assets`);
