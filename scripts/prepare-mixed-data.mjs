import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

const root = '.ml-work/mixed';
await fs.mkdir(`${root}/images`, {recursive:true});
await fs.mkdir(`${root}/labels`, {recursive:true});
const samRevision = '5850ab45f587c112167512ffef949107115e26a0';
const datasetRevision = 'ef83f6636e5d9e0593aeaecae49ef05ef418693a';
async function download(url, filename) {
  try {const stat = await fs.stat(filename); if (stat.size > 0) return;} catch {}
  for (let attempt=0; attempt<4; attempt++) {
    try {
      const response = await fetch(url, {signal:AbortSignal.timeout(120000)});
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(filename+'.part',bytes); await fs.rename(filename+'.part',filename); return;
    } catch(error) {if(attempt===3)throw error; await new Promise(resolve=>setTimeout(resolve,1000*(attempt+1)));}
  }
}
await Promise.all(['vision_encoder_quantized.onnx','prompt_encoder_mask_decoder_quantized.onnx','config.json','preprocessor_config.json','README.md'].map(name=>download(`https://huggingface.co/Xenova/slimsam-77-uniform/resolve/${samRevision}/${name.endsWith('.onnx')?'onnx/':''}${name}`,`${root}/${name}`)));
try {await fs.access(`${root}/dataset.json`);} catch {await download('https://huggingface.co/api/datasets/SohlHealth/sohl-multidish-yolo-dataset',`${root}/dataset.json`);}
const metadata = JSON.parse(await fs.readFile(`${root}/dataset.json`,'utf8'));
if(metadata.sha!==datasetRevision)throw Error('The dataset revision changed. Use the reviewed pinned metadata before retraining.');
const groups = new Map();
for (const entry of metadata.siblings.filter(entry=>entry.rfilename.startsWith('images/'))) {
  const name=path.basename(entry.rfilename); const key=name.split('.rf.')[0];
  if(!groups.has(key))groups.set(key,name);
}
const entries=[...groups].map(([group,name],index)=>({group,file:`images/${name}`,label:`labels/${name.replace(/\.jpg$/i,'.txt')}`,split:createHash('sha256').update(group).digest()[0]%5===0?'test':'train'}));
let progress=0,index=0;
await Promise.all(Array.from({length:8},async()=>{
  while(index<entries.length){const entry=entries[index++];
    await Promise.all([entry.file,entry.label].map(file=>download(`https://huggingface.co/datasets/SohlHealth/sohl-multidish-yolo-dataset/resolve/${datasetRevision}/${file}`,`${root}/${file}`)));
    entry.sha256=createHash('sha256').update(await fs.readFile(`${root}/${entry.file}`)).digest('hex');
    if(++progress%20===0)console.log(`Downloaded ${progress}/${entries.length} mixed-plate images and annotations`);
  }
}));
await fs.writeFile(`${root}/data.json`,JSON.stringify({dataset:'SohlHealth/sohl-multidish-yolo-dataset',datasetRevision,samModel:'Xenova/slimsam-77-uniform',samRevision,entries},null,2));
console.log(JSON.stringify({groups:entries.length,train:entries.filter(e=>e.split==='train').length,test:entries.filter(e=>e.split==='test').length}));
