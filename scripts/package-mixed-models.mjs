import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';

const directory = 'public/models/mixed-v1';
await fs.mkdir(directory, {recursive: true});
const files = [
  ['encoder', 'vision_encoder_quantized.onnx'],
  ['decoder', 'prompt_encoder_mask_decoder_quantized.onnx']
];
const provenance = JSON.parse(await fs.readFile('ml/mixed-models.json', 'utf8'));
const assets = [];

for (const [id, name] of files) {
  const source = `ml/models/${name}`;
  let bytes;
  try {
    bytes = await fs.readFile(source);
  } catch {
    console.log(`Downloading ${name} from HuggingFace (${provenance.revision.slice(0, 7)})...`);
    const url = `https://huggingface.co/${provenance.model}/resolve/${provenance.revision}/onnx/${name}`;
    const res = await fetch(url);
    if (!res.ok) throw Error(`Failed to download ${name}: ${res.statusText}`);
    bytes = Buffer.from(await res.arrayBuffer());
    await fs.mkdir('ml/models', {recursive: true});
    await fs.writeFile(source, bytes);
  }
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (sha256 !== provenance.assets[name]) throw Error(`Mixed model integrity mismatch: ${name}`);
  const filename = `${id}.${sha256.slice(0, 12)}.onnx`;
  await fs.writeFile(`${directory}/${filename}`, bytes);
  assets.push({id, url: `/models/mixed-v1/${filename}`, bytes: bytes.length, sha256});
}

await fs.writeFile(
  `${directory}/manifest.json`,
  JSON.stringify(
    {
      version: 'mixed-v1',
      model: provenance.model,
      modelRevision: provenance.revision,
      license: provenance.license,
      assets,
      totalBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0)
    },
    null,
    2
  )
);
console.log(`Mixed-meal model pack: ${(assets.reduce((sum, asset) => sum + asset.bytes, 0) / 1024 / 1024).toFixed(1)} MiB additional`);
