import {cachedScannerAsset, scannerManifest} from './scanner-assets';
import {normalizePixels, rankPredictions, type Prediction, type ScanMode, type ScannerConfig} from './scanner-math';
import {mixedAssetBytes, mixedManifest} from './mixed-model-assets';
import type {MaskRegion} from './meal-regions';
import {rankMealRegion,type MealFamily} from './meal-classifier';
export type {Prediction, ScanMode} from './scanner-math';

interface WorkerReply {id: number; type: string; global?: Float32Array; regional?: Float32Array; regions?:MaskRegion[]; inferenceMs?: number; message?: string;}
let worker: Worker | undefined;
let warmup: Promise<ScannerConfig> | undefined;
let sequence = 0;
const pending = new Map<number, {resolve: (reply: WorkerReply) => void; reject: (error: Error) => void; timer: number}>();
function discardWorker(message: string) {
  worker?.terminate(); worker = undefined; warmup = undefined; mixedWarmup = undefined;
  for (const item of pending.values()) {clearTimeout(item.timer); item.reject(new Error(message));}
  pending.clear();
}
function request(type: string, payload: Record<string, unknown>, transfer: Transferable[] = []): Promise<WorkerReply> {
  return new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = window.setTimeout(() => discardWorker('The scanner took too long. Try a smaller photo or restart the scanner.'), 60000);
    pending.set(id, {resolve, reject, timer});
    try {worker!.postMessage({id, type, ...payload}, transfer);} catch(error) {clearTimeout(timer); pending.delete(id); reject(error);}
  });
}
export async function warmScanner(): Promise<ScannerConfig> {
  if (!warmup) warmup = (async () => {
    const manifest = await scannerManifest();
    const [model, wasm, module] = await Promise.all(['model', 'wasm', 'module'].map(id => cachedScannerAsset(manifest.assets.find(asset => asset.id === id)!)));
    if (!worker) {
      worker = new Worker(new URL('./scanner.worker.ts', import.meta.url), {type: 'module'});
      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        const reply = event.data, item = pending.get(reply.id); if (!item) return;
        clearTimeout(item.timer); pending.delete(reply.id);
        if (reply.type === 'error') item.reject(new Error(reply.message ?? 'The photo could not be processed.')); else item.resolve(reply);
      };
      worker.onerror = () => discardWorker('The scanner could not start in this browser. Reload and try again.');
    }
    await request('load', {model, wasm, module: new TextDecoder().decode(module), config: manifest.config}, [model, wasm]);
    return manifest.config;
  })().catch(error => {discardWorker('The scanner needs to be restarted.'); throw error;});
  return warmup;
}
export function imageTensor(image: HTMLImageElement, config: ScannerConfig): Float32Array {
  const width = image.naturalWidth, height = image.naturalHeight;
  if (!width || !height || Math.max(width / height, height / width) > 8) throw Error('Choose a regular photo with one dish clearly visible in the center.');
  const factor = config.resizeShortSide / Math.min(width, height);
  const resized = document.createElement('canvas'); resized.width = Math.floor(width * factor); resized.height = Math.floor(height * factor);
  const context = resized.getContext('2d', {willReadFrequently: true});
  if (!context) throw Error('This browser could not read the photo.');
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(image, 0, 0, resized.width, resized.height);
  const left = Math.floor((resized.width - config.inputSize) / 2), top = Math.floor((resized.height - config.inputSize) / 2);
  const pixels = context.getImageData(left, top, config.inputSize, config.inputSize).data;
  return normalizePixels(pixels, config);
}
export async function classify(image: HTMLImageElement, mode: ScanMode = 'auto'): Promise<{predictions: Prediction[]; inferenceMs: number}> {
  const config = await warmScanner();
  const pixels = imageTensor(image, config);
  const result = await request('classify', {pixels: pixels.buffer}, [pixels.buffer]);
  if (!result.global || !result.regional) throw Error('The scanner did not return a result. Please retry.');
  return {predictions: rankPredictions(result.global, result.regional, config, mode), inferenceMs: result.inferenceMs ?? 0};
}
let mixedWarmup:Promise<void>|undefined;
export async function warmMixedScanner():Promise<void>{
  if(!mixedWarmup)mixedWarmup=(async()=>{
    await warmScanner();const manifest=await mixedManifest();
    const [encoder,decoder]=await Promise.all(['encoder','decoder'].map(id=>mixedAssetBytes(manifest.assets.find(asset=>asset.id===id)!)));
    await request('load-segmentation',{encoder,decoder},[encoder,decoder]);
  })().catch(error=>{mixedWarmup=undefined;throw error;});return mixedWarmup;
}
export async function segmentPhoto(image:HTMLImageElement):Promise<MaskRegion[]>{
  await warmMixedScanner();const ratio=1024/Math.max(image.naturalWidth,image.naturalHeight);
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('This browser cannot read the photo.');
  context.drawImage(image,0,0,canvas.width,canvas.height);const rgba=context.getImageData(0,0,canvas.width,canvas.height).data;
  const pixels=new Float32Array(3*1024*1024);const mean=[.485,.456,.406],std=[.229,.224,.225];
  for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)for(let c=0;c<3;c++)pixels[c*1024*1024+y*1024+x]=(rgba[(y*canvas.width+x)*4+c]/255-mean[c])/std[c];
  const result=await request('segment',{pixels:pixels.buffer,width:canvas.width,height:canvas.height},[pixels.buffer]);
  if(!result.regions)throw Error('No region result returned.');return result.regions;
}
export type {MealFamily} from './meal-classifier';
export async function classifyMealRegion(image:HTMLImageElement,region:MaskRegion):Promise<{family:MealFamily;confidence:number;predictions:Prediction[]}>{
  const canvas=document.createElement('canvas');const [x,y,w,h]=region.box;
  canvas.width=Math.max(8,Math.round(w*image.naturalWidth));canvas.height=Math.max(8,Math.round(h*image.naturalHeight));
  const context=canvas.getContext('2d');if(!context)throw Error('This browser cannot crop food regions.');
  context.drawImage(image,x*image.naturalWidth,y*image.naturalHeight,w*image.naturalWidth,h*image.naturalHeight,0,0,canvas.width,canvas.height);
  const crop=new Image();crop.src=canvas.toDataURL('image/jpeg',.95);await crop.decode();const config=await warmScanner();
  const pixels=imageTensor(crop,config);const reply=await request('classify',{pixels:pixels.buffer},[pixels.buffer]);
  if(!reply.global||!reply.regional)throw Error('The region could not be classified.');
  return rankMealRegion(reply.global,reply.regional,config);
}
