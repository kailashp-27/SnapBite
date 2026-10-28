import fs from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash} from 'node:crypto';
const exec = promisify(execFile);
const revision = '7d05d3878ee7f2aad7ad159018a8e5fdb4953d41';
const assets = [
  {id:'checkpoint',remote:'pytorch_model.bin',filename:'.ml-work/food101-trained.bin',bytes:19121039,sha256:'42cd5d9988f0830588b3be5107197c9b622c9b73426377975c07e8b24e346680'},
  {id:'architecture',remote:'mobilenet_v2_food101.onnx',filename:'.ml-work/food101.onnx',bytes:9835830,sha256:'af237923fd4636f5c6156059e372871a2b63e4a851f377f1b92ae8c71d018890'},
];
for (const asset of assets) {
  const existing = await fs.readFile(asset.filename).catch(()=>null);
  if (existing && createHash('sha256').update(existing).digest('hex')===asset.sha256) {console.log(`${asset.id}: verified existing file`);continue;}
  const url=`https://huggingface.co/AlexKoff88/mobilenet_v2_food101/resolve/${revision}/${asset.remote}?download=true`;
  const directory=`.ml-work/${asset.id}-parts`, chunkSize=1024*1024,total=Math.ceil(asset.bytes/chunkSize);
  await fs.mkdir(directory,{recursive:true});let next=0;
  await Promise.all(Array.from({length:4},async()=>{
    while(next<total){
      const index=next++,start=index*chunkSize,end=Math.min(asset.bytes-1,start+chunkSize-1),filename=`${directory}/${String(index).padStart(3,'0')}.bin`;
      if((await fs.stat(filename).catch(()=>null))?.size===end-start+1)continue;
      for(let attempt=0;attempt<4;attempt++){
        try{await exec('curl.exe',['--location','--fail','--silent','--show-error','--range',`${start}-${end}`,'--max-time','90','--output',filename,url]);if((await fs.stat(filename)).size!==end-start+1)throw Error('Unexpected range size');break;}
        catch(error){if(attempt===3)throw error;}
      }
      console.log(`${asset.id}: block ${index+1}/${total}`);
    }
  }));
  const chunks=[];for(let i=0;i<total;i++)chunks.push(await fs.readFile(`${directory}/${String(i).padStart(3,'0')}.bin`));
  const data=Buffer.concat(chunks);if(createHash('sha256').update(data).digest('hex')!==asset.sha256)throw Error(`${asset.id}: SHA-256 mismatch`);
  await fs.writeFile(asset.filename,data);console.log(`${asset.id}: SHA-256 verified`);
}
let rows;
try {rows=JSON.parse(await fs.readFile('.ml-work/food101-rows.json','utf8'));}catch{}
if (!rows?.features?.some(feature=>feature.name==='label'&&feature.type.names?.length===101)) {
  await exec('curl.exe',['--fail','--silent','--show-error','--retry','3','--max-time','60','--output','.ml-work/food101-rows.json','https://datasets-server.huggingface.co/rows?dataset=ethz%2Ffood101&config=default&split=validation&offset=0&length=1']);
  rows=JSON.parse(await fs.readFile('.ml-work/food101-rows.json','utf8'));
  if(!rows.features?.some(feature=>feature.name==='label'&&feature.type.names?.length===101))throw Error('Food-101 labels unavailable');
}
console.log('Food-101 label order verified');
