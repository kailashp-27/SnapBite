/// <reference lib="webworker" />
import * as ort from 'onnxruntime-web/wasm';
import type {ScannerConfig} from './scanner-math';
import {MASK_SIZE, uniqueMasks, type MaskRegion} from './meal-regions';

const scope = self as unknown as DedicatedWorkerGlobalScope;
let session: ort.InferenceSession | undefined;
let config: ScannerConfig;
let encoder: ort.InferenceSession | undefined, decoder: ort.InferenceSession | undefined;
scope.onmessage = async (event: MessageEvent) => {
  const message = event.data;
  try {
    if (message.type === 'load') {
      config = message.config;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      const moduleURL = URL.createObjectURL(new Blob([message.module], {type: 'text/javascript'}));
      const wasmURL = URL.createObjectURL(new Blob([message.wasm], {type: 'application/wasm'}));
      ort.env.wasm.wasmPaths = {mjs: moduleURL, wasm: wasmURL};
      try {session = await ort.InferenceSession.create(message.model, {executionProviders: ['wasm'], graphOptimizationLevel: 'all'});}
      finally {URL.revokeObjectURL(moduleURL); URL.revokeObjectURL(wasmURL);}
      scope.postMessage({id: message.id, type: 'ready'});
    } else if(message.type==='load-segmentation') {
      if(!session)throw Error('Enable the base scanner first.');
      if(!encoder)encoder=await ort.InferenceSession.create(message.encoder,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
      if(!decoder)decoder=await ort.InferenceSession.create(message.decoder,{executionProviders:['wasm'],graphOptimizationLevel:'all'});
      scope.postMessage({id:message.id,type:'ready'});
    } else if(message.type==='segment') {
      if(!encoder||!decoder)throw Error('The mixed-meal scanner is still warming up.');
      const input=new ort.Tensor('float32',new Float32Array(message.pixels),[1,3,1024,1024]);
      let embedding:ort.InferenceSession.ReturnType|undefined,output:ort.InferenceSession.ReturnType|undefined;
      const points=new Float32Array(50);
      for(let y=0;y<5;y++)for(let x=0;x<5;x++){const index=y*5+x;points[index*2]=(x+.5)*message.width/5;points[index*2+1]=(y+.5)*message.height/5;}
      const pointTensor=new ort.Tensor('float32',points,[1,25,1,2]);
      const labels=new ort.Tensor('int64',new BigInt64Array(25).fill(1n),[1,25,1]);
      const start=performance.now();
      try {
        embedding=await encoder.run({pixel_values:input});
        output=await decoder.run({input_points:pointTensor,input_labels:labels,image_embeddings:embedding.image_embeddings,image_positional_embeddings:embedding.image_positional_embeddings});
        const scores=output.iou_scores.data as Float32Array, logits=output.pred_masks.data as Float32Array;
        const regions:MaskRegion[]=[];
        for(let candidate=0;candidate<75;candidate++){
          if(scores[candidate]<.8)continue;
          const mask=new Uint8Array(MASK_SIZE*MASK_SIZE);let count=0,stable=0,possible=0,minX=MASK_SIZE,minY=MASK_SIZE,maxX=0,maxY=0;
          for(let y=0;y<MASK_SIZE;y++)for(let x=0;x<MASK_SIZE;x++){
            const sx=Math.min(255,Math.floor((x+.5)/MASK_SIZE*message.width/4));
            const sy=Math.min(255,Math.floor((y+.5)/MASK_SIZE*message.height/4));
            const value=logits[candidate*256*256+sy*256+sx];
            if(value>1)stable++;if(value> -1)possible++;
            if(value>0){mask[y*MASK_SIZE+x]=1;count++;minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x+1);maxY=Math.max(maxY,y+1);}
          }
          const area=count/mask.length;
          if(area<.008||area>.93||!possible||stable/possible<.82)continue;
          regions.push({id:`region-${candidate}`,box:[minX/MASK_SIZE,minY/MASK_SIZE,(maxX-minX)/MASK_SIZE,(maxY-minY)/MASK_SIZE],area,quality:scores[candidate],mask});
        }
        const selected=uniqueMasks(regions,24);
        scope.postMessage({id:message.id,type:'regions',regions:selected,inferenceMs:performance.now()-start},selected.map(region=>region.mask.buffer));
      } finally {input.dispose();pointTensor.dispose();labels.dispose();if(output)Object.values(output).forEach(t=>t.dispose());if(embedding)Object.values(embedding).forEach(t=>t.dispose());}
    } else if (message.type === 'classify') {
      if (!session) throw Error('The scanner is still warming up.');
      const input = new ort.Tensor('float32', new Float32Array(message.pixels), [1, 3, config.inputSize, config.inputSize]);
      const start = performance.now();
      let output: ort.InferenceSession.ReturnType | undefined;
      try {
        output = await session.run({[config.inputName]: input});
        const global = Float32Array.from(output[config.globalOutput].data as Float32Array);
        const regional = Float32Array.from(output[config.regionalOutput].data as Float32Array);
        scope.postMessage({id: message.id, type: 'prediction', global, regional, inferenceMs: performance.now() - start}, [global.buffer, regional.buffer]);
      } finally {input.dispose(); if (output) Object.values(output).forEach(tensor => tensor.dispose());}
    }
  } catch (error) {scope.postMessage({id: message.id, type: 'error', message: error instanceof Error ? error.message : 'The scanner could not process this photo.'});}
};
