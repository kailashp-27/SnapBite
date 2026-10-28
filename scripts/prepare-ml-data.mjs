import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = path.resolve('.ml-work');
await fs.mkdir(path.join(root, 'images'), {recursive: true});
await fs.mkdir(path.join(root, 'pages'), {recursive: true});
let retryAt = 0;
async function json(url) {
  const cached = path.join(root, 'pages', `${createHash('sha256').update(url).digest('hex')}.json`);
  try {
    const value = JSON.parse(await fs.readFile(cached, 'utf8'));
    const image = value.rows?.[0]?.row?.image?.src;
    const expires = image ? Number(new URL(image).searchParams.get('Expires')) : 0;
    if (expires * 1000 > Date.now() + 60000) return value;
  } catch {}
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      if (Date.now() < retryAt) await new Promise(resolve => setTimeout(resolve, retryAt - Date.now()));
      const response = await fetch(url, {signal: AbortSignal.timeout(60000)});
      if (response.status === 429) {const delay = Math.max(60, Number(response.headers.get('retry-after')) || 60); retryAt = Date.now() + delay * 1000; console.log(`Dataset service rate limit: waiting ${delay}s before resuming`); continue;}
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const result = await response.json(); await fs.writeFile(cached, JSON.stringify(result)); return result;
    }
    catch (error) {if (attempt === 3) throw error; await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));}
  }
  throw Error('Dataset service remained rate limited; rerun to resume cached progress.');
}
async function concurrent(items, limit, callback) {
  let index = 0;
  await Promise.all(Array.from({length: limit}, async () => {while (index < items.length) {const item = items[index++]; await callback(item);}}));
}
const definitions = [
  {key: 'indian-train', dataset: 'bharat-raghunathan/indian-foods-dataset', revision: 'ef509a8b4bfd46b76530ad329f81586faf904aad', split: 'train', total: 3809, all: true},
  {key: 'indian-test', dataset: 'bharat-raghunathan/indian-foods-dataset', revision: 'ef509a8b4bfd46b76530ad329f81586faf904aad', split: 'test', total: 961, all: true},
  {key: 'global-train', dataset: 'ethz/food101', revision: '83488de741c1bd1ce27aa6a2b33e19c7bdf92ca9', split: 'train', total: 21, stride: 3750, count: 20, offset: 17},
  {key: 'global-test', dataset: 'ethz/food101', revision: '83488de741c1bd1ce27aa6a2b33e19c7bdf92ca9', split: 'validation', total: 21, stride: 1250, count: 20, offset: 53},
];
const jobs = definitions.flatMap(def => def.all
  ? Array.from({length: Math.ceil(def.total / 100)}, (_, i) => ({def, offset: i * 100, length: Math.min(100, def.total - i * 100)}))
  : Array.from({length: def.total}, (_, i) => ({def, offset: i * def.stride + def.offset, length: def.count})));
const entries = []; let pages = 0;
await concurrent(jobs, 2, async ({def, offset, length}) => {
  const query = new URLSearchParams({dataset: def.dataset, config: 'default', split: def.split, offset: String(offset), length: String(length)});
  const result = await json(`https://datasets-server.huggingface.co/rows?${query}`);
  const labels = result.features.find(feature => feature.name === 'label').type.names;
  for (const item of result.rows) {
    if (!item.row.image.src.includes(`/--/${def.revision}/--/`)) throw Error(`Dataset ${def.dataset} changed revision. Review the new data before retraining.`);
    entries.push({key: def.key, dataset: def.dataset, split: def.split, row: item.row_idx, label: labels[item.row.label], url: item.row.image.src, file: `images/${def.key}-${item.row_idx}.jpg`});
  }
  if (++pages % 20 === 0) console.log(`Read ${pages}/${jobs.length} labelled image pages`);
});
entries.sort((a, b) => a.key.localeCompare(b.key) || a.row - b.row);
await fs.writeFile(path.join(root, 'dataset.pending.json'), JSON.stringify({entries: entries.map(({url, ...entry}) => entry)}, null, 2));
let downloaded = 0; const failures = [];
await concurrent(entries, 12, async entry => {
  const filename = path.join(root, entry.file);
  let bytes;
  try {bytes = await fs.readFile(filename);} catch {}
  if (!bytes?.length) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {const response = await fetch(entry.url, {signal: AbortSignal.timeout(60000)}); if (!response.ok) throw Error(`HTTP ${response.status}`); bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length < 100) throw Error('Empty image'); await fs.writeFile(`${filename}.partial`, bytes); await fs.rename(`${filename}.partial`, filename); break;}
      catch(error) {if (attempt === 3) {failures.push({file: entry.file, error: String(error)}); return;} await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));}
    }
  }
  entry.sha256 = createHash('sha256').update(bytes).digest('hex'); delete entry.url;
  if (++downloaded % 100 === 0) console.log(`Downloaded/verified ${downloaded}/${entries.length} images`);
});
await fs.writeFile(path.join(root, 'dataset.json'), JSON.stringify({createdAt: new Date().toISOString(), entries: entries.filter(entry => entry.sha256), failures}, null, 2));
console.log(JSON.stringify({images: downloaded, failures: failures.length, groups: Object.fromEntries(definitions.map(def => [def.key, entries.filter(entry => entry.key === def.key && entry.sha256).length]))}));
if (failures.length) process.exitCode = 1;
