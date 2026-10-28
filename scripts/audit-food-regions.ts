import {readFile,writeFile} from 'node:fs/promises';
import {rankMealRegion} from '../src/meal-classifier';
import {maskOverlap,REGION_SELECTION_VERSION,type MaskRegion} from '../src/meal-regions';
import {selectFoodRegions,type MealRegion} from '../src/mixed-scan';
import type {ScannerConfig} from '../src/scanner-math';
const config:ScannerConfig=JSON.parse(await readFile('public/models/snapbite-v1/config.json','utf8'));
const cache=JSON.parse(await readFile('.ml-work/mixed/proposals.json','utf8'));
const cleaned=JSON.parse(await readFile('.ml-work/mixed/clean-logits.json','utf8'));
function oldContainer(region:MaskRegion,regions:MaskRegion[]){const children=regions.filter(other=>other.id!==region.id&&other.area<region.area*.65&&other.area>.015&&maskOverlap(region,other).contained>.9);return children.some((a,index)=>children.slice(index+1).some(b=>maskOverlap(a,b).iou<.15));}
function oldPlate(regions:MaskRegion[]){return [...regions].filter(region=>{const[x,y,w,h]=region.box;return region.area>.25&&region.area<.93&&x>.005&&y>.005&&x+w<.995&&y+h<.995&&region.area/(w*h)>.6;}).sort((a,b)=>b.area-a.area)[0]??null;}
function oldSelect(regions:MealRegion[]){
  const bread=new Set(['naan','dosa','pancakes','french_toast','garlic_bread']);
  const candidates=regions.filter(region=>region.confidence>=.45&&region.area>=.015).map(region=>region.family==='flatbread'&&region.confidence<.8&&!bread.has(region.predictions[0]?.label)?{...region,family:'other' as const,confidence:Math.min(.55,region.confidence)}:region);
  const selected:MealRegion[]=[];for(const region of candidates.sort((a,b)=>b.quality*b.confidence*(b.family==='other'?.85:1)-a.quality*a.confidence*(a.family==='other'?.85:1))){if(selected.some(other=>{const o=maskOverlap(region,other);return o.iou>.4||o.contained>.88;}))continue;selected.push(region);if(selected.length===10)break;}return selected;
}
const summarize=(regions:MealRegion[])=>regions.map(({id,box,area,family,confidence,predictions})=>({id,box,area,family,confidence,label:predictions[0]?.label}));
const cases=cache.cases.map((entry:{ordinal:number;file:string;width:number;height:number;photoSha256:string;seconds:number;regions:(MaskRegion&{mask:number[];globalLogits:number[];regionalLogits:number[]})[]})=>{
  const regions=entry.regions.map(region=>({...region,mask:Uint8Array.from(region.mask),...rankMealRegion(Float32Array.from(region.globalLogits),Float32Array.from(region.regionalLogits),config)}));
  const cleanEntry=cleaned.cases.find((item:{ordinal:number})=>item.ordinal===entry.ordinal);
  if(!cleanEntry||cleanEntry.photoSha256!==entry.photoSha256)throw Error('Cleaned crop cache does not match the source photos.');
  const afterRegions=cleanEntry.regions.map((region:MaskRegion&{mask:number[];globalLogits:number[];regionalLogits:number[]})=>({...region,mask:Uint8Array.from(region.mask),...rankMealRegion(Float32Array.from(region.globalLogits),Float32Array.from(region.regionalLogits),config)}));
  const beforePlate=oldPlate(regions),afterPlate=cleanEntry.plate;
  const before=oldSelect(regions.filter(region=>region.id!==beforePlate?.id&&!oldContainer(region,regions)).slice(0,18) as MealRegion[]);
  const after=selectFoodRegions(afterRegions);
  return {ordinal:entry.ordinal,file:entry.file,photoSha256:entry.photoSha256,width:entry.width,height:entry.height,nativeInferenceSeconds:entry.seconds,plateBefore:beforePlate?.id??null,plateAfter:afterPlate?.id??null,before:summarize(before),after:summarize(after)};
});
const report={selection:REGION_SELECTION_VERSION,runtime:cache.runtime,limits:'Visual diagnostic only. Before and after start from identical segmentation proposals; changed crop boxes are reclassified with the same real native weights. Preparation and final selection call production TypeScript. These five plates have no weighed portions or instance ground-truth labels; region counts are not accuracy.',cases};
await writeFile('ml/reports/mixed-selection-v3.json',JSON.stringify(report,null,2)+'\n');
console.log(cases.map((entry:typeof cases[number])=>({plate:entry.ordinal,before:entry.before.length,after:entry.after.length,plateBefore:entry.plateBefore,plateAfter:entry.plateAfter})));
