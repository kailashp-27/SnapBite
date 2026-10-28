import {readFile,writeFile} from 'node:fs/promises';
import {prepareMealRegions} from '../src/mixed-scan';
import type {MaskRegion} from '../src/meal-regions';
const cache=JSON.parse(await readFile('.ml-work/mixed/proposals.json','utf8'));
const cases=cache.cases.map((entry:{ordinal:number;file:string;width:number;height:number;photoSha256:string;regions:(MaskRegion&{mask:number[]})[]})=>{
  const {objects,plate}=prepareMealRegions(entry.regions.map(region=>({...region,mask:Uint8Array.from(region.mask)})),entry.width,entry.height);
  return {...entry,plate:plate?{id:plate.id,area:plate.area,box:plate.box}:null,regions:objects.map(region=>({id:region.id,area:region.area,box:region.box,quality:region.quality,mask:[...region.mask]}))};
});
await writeFile('.ml-work/mixed/clean-regions.json',JSON.stringify({cases}));
console.log(cases.map((entry:typeof cases[number])=>({plate:entry.ordinal,objects:entry.regions.length})));
