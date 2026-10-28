import {SCANNER_CACHE, cachedScannerAsset, prepareScanner, scannerManifest, scannerReady, type DownloadProgress} from './scanner-assets';

export interface MixedAsset {id:'encoder'|'decoder';url:string;bytes:number;sha256:string;}
export interface MixedManifest {version:'mixed-v1';assets:MixedAsset[];totalBytes:number;modelRevision:string;}
const URL='/models/mixed-v1/manifest.json';
let promise:Promise<MixedManifest>|undefined;
async function hash(bytes:ArrayBuffer){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),value=>value.toString(16).padStart(2,'0')).join('');}
function validate(value:unknown):MixedManifest {
  const manifest=value as MixedManifest;
  if(manifest?.version!=='mixed-v1'||!Array.isArray(manifest.assets)||manifest.assets.length!==2||new Set(manifest.assets.map(asset=>asset.id)).size!==2||!manifest.assets.every(asset=>['encoder','decoder'].includes(asset.id)&&/^\/models\/mixed-v1\/[a-z-]+\.[a-f0-9]{12}\.onnx$/.test(asset.url)&&/^[a-f0-9]{64}$/.test(asset.sha256)&&Number.isSafeInteger(asset.bytes)&&asset.bytes>0&&asset.bytes<30*1024*1024))throw Error('The mixed-meal model package is invalid.');
  manifest.totalBytes=manifest.assets.reduce((sum,asset)=>sum+asset.bytes,0);return manifest;
}
export function mixedManifest():Promise<MixedManifest>{
  if(!promise)promise=(async()=>{
    try{const response=await fetch(URL,{cache:'no-cache',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error();return validate(await response.json());}
    catch{const cached=await(await caches.open(SCANNER_CACHE)).match(URL);if(cached)return validate(await cached.json());throw Error('Connect once to enable mixed-meal scanning.');}
  })().catch(error=>{promise=undefined;throw error;});return promise;
}
export async function mixedReady(manifest:MixedManifest):Promise<boolean>{
  const cache=await caches.open(SCANNER_CACHE);
  const present=await Promise.all(manifest.assets.map(asset=>cache.match(asset.url)));
  return present.every((response,index)=>response?.headers.get('X-SnapBite-SHA256')===manifest.assets[index].sha256)&&await scannerReady(await scannerManifest());
}
export async function prepareMixed(manifest:MixedManifest,onProgress:(progress:DownloadProgress)=>void,signal:AbortSignal):Promise<void>{
  const base=await scannerManifest();const total=base.totalBytes+manifest.totalBytes;
  await prepareScanner(base,progress=>onProgress({...progress,total}),signal);
  const cache=await caches.open(SCANNER_CACHE);let loaded=base.totalBytes;
  for(const asset of manifest.assets){
    const existing=await cache.match(asset.url);
    if(existing?.headers.get('X-SnapBite-SHA256')===asset.sha256){loaded+=asset.bytes;onProgress({loaded,total,file:asset.id});continue;}
    const response=await fetch(asset.url,{signal,cache:'reload'});if(!response.ok||!response.body)throw Error('Model download interrupted. Retry to resume completed files.');
    const reader=response.body.getReader();const bytes=new Uint8Array(asset.bytes);let offset=0;
    while(true){const next=await reader.read();if(next.done)break;if(offset+next.value.length>bytes.length){await reader.cancel();throw Error('Unexpected model size.');}bytes.set(next.value,offset);offset+=next.value.length;onProgress({loaded:loaded+offset,total,file:asset.id});}
    if(offset!==asset.bytes||await hash(bytes.buffer)!==asset.sha256)throw Error('The mixed-meal model failed its integrity check. Retry setup.');
    await cache.put(asset.url,new Response(bytes,{headers:{'X-SnapBite-SHA256':asset.sha256}}));loaded+=asset.bytes;
  }
  await cache.put(URL,new Response(JSON.stringify(manifest),{headers:{'Content-Type':'application/json'}}));onProgress({loaded,total,file:'ready'});
}
export async function mixedAssetBytes(asset:MixedAsset):Promise<ArrayBuffer>{
  // Asset verification is identical to the single-dish model; the ID is used
  // only for progress labels by that helper.
  return cachedScannerAsset({...asset,id:'model'});
}
