import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
const directory='public/models/mixed-v1';await fs.mkdir(directory,{recursive:true});
const files=[['encoder','vision_encoder_quantized.onnx'],['decoder','prompt_encoder_mask_decoder_quantized.onnx']];
const provenance=JSON.parse(await fs.readFile('ml/mixed-models.json','utf8'));
const assets=[];
for(const [id,name] of files){
  const source=`ml/models/${name}`;const bytes=await fs.readFile(source);const sha256=createHash('sha256').update(bytes).digest('hex');
  if(sha256!==provenance.assets[name])throw Error(`Mixed model integrity mismatch: ${name}`);
  const filename=`${id}.${sha256.slice(0,12)}.onnx`;await fs.writeFile(`${directory}/${filename}`,bytes);assets.push({id,url:`/models/mixed-v1/${filename}`,bytes:bytes.length,sha256});
}
await fs.writeFile(`${directory}/manifest.json`,JSON.stringify({version:'mixed-v1',model:'Xenova/slimsam-77-uniform',modelRevision:'5850ab45f587c112167512ffef949107115e26a0',license:'Apache-2.0',assets,totalBytes:assets.reduce((sum,asset)=>sum+asset.bytes,0)},null,2));
console.log(`Mixed-meal model pack: ${(assets.reduce((sum,asset)=>sum+asset.bytes,0)/1024/1024).toFixed(1)} MiB additional`);
