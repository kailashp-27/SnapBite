import {db} from './db';
import head from './meal-region-head.json';
import {REGION_SELECTION_VERSION} from './meal-regions';
import {initialPortion,type PortionFamily} from './portion-estimates';
import {validateEvaluation,validateEvaluationExport,type EvaluationExport,type MealEvaluation} from './meal-evaluation';
import type {PlateReference} from './plate-reference';
import type {MixedManifest} from './mixed-model-assets';

async function sha(value:string){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
interface OriginalGroup {id:string;family:PortionFamily;foodId:string;regions:{box:[number,number,number,number];area:number;confidence:number}[];}
export async function snapshotEvaluation(groups:OriginalGroup[],plateReference:PlateReference,diameterCm:number,savedDiameter:boolean,manifest:MixedManifest|null):Promise<MealEvaluation>{
  const identity={selection:REGION_SELECTION_VERSION,grouping:'confident-flatbread-v1',portion:'photo-prototype-v1',classifier:head.modelSha256,head:await sha(JSON.stringify(head)),segmentation:manifest?.assets.map(asset=>({id:asset.id,sha256:asset.sha256}))??[]};
  const modelDetails=JSON.stringify(identity);
  return {id:crypto.randomUUID(),createdAt:Date.now(),modelVersion:`meal-${(await sha(modelDetails)).slice(0,16)}`,modelDetails,diameterCm,savedDiameter,plateReference:{...plateReference},
    predictions:groups.map(group=>{
      const left=Math.min(...group.regions.map(region=>region.box[0])),top=Math.min(...group.regions.map(region=>region.box[1]));
      const right=Math.max(...group.regions.map(region=>region.box[0]+region.box[2])),bottom=Math.max(...group.regions.map(region=>region.box[1]+region.box[3]));
      return {id:group.id,family:group.family,confidence:Math.min(...group.regions.map(region=>region.confidence)),box:[left,top,right-left,bottom-top],suggestedFoodId:group.foodId||null,portion:initialPortion(group.family,group.regions.map(region=>region.area),plateReference.areaFraction,diameterCm)};
    }),truth:[],complete:false,notes:'',captureGroup:crypto.randomUUID(),split:'holdout'};
}

export async function compressedEvaluationPhoto(file:File):Promise<Blob>{
  const image=await createImageBitmap(file);
  try{
    const factor=Math.min(1,1024/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*factor));canvas.height=Math.max(1,Math.round(image.height*factor));
    const context=canvas.getContext('2d');if(!context)throw Error('Photo storage is unavailable. Uncheck Include photo to save labels only.');
    context.drawImage(image,0,0,canvas.width,canvas.height);
    return await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('The evaluation photo could not be prepared.')),'image/jpeg',.82));
  }finally{image.close();}
}

export async function saveEvaluation(entry:MealEvaluation){
  validateEvaluation(entry);
  await db.transaction('rw',db.mealEvaluations,async()=>{
    if(!(await db.mealEvaluations.get(entry.id))&&await db.mealEvaluations.count()>=200)throw Error('This evaluation collection is limited to 200 examples. Export it before starting another collection.');
    await db.mealEvaluations.put(entry);
  });
}
export async function exportEvaluations(includePhotos:boolean):Promise<EvaluationExport>{
  const entries=await db.mealEvaluations.orderBy('createdAt').toArray();
  if(includePhotos&&entries.reduce((sum,entry)=>sum+(entry.photo?.size??0),0)>60*1024*1024)throw Error('Export without photos to keep this file manageable.');
  const cases:EvaluationExport['cases']=[];
  for(const entry of entries){
    const {photo,...metadata}=entry;
    const photoDataUrl=includePhotos&&photo?await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(Error('An evaluation photo could not be read.'));reader.readAsDataURL(photo);}):undefined;
    cases.push({...metadata,...(photoDataUrl?{photoDataUrl}:{})});
  }
  return {format:'snapbite-meal-evaluation',version:1,cases};
}
export async function importEvaluations(value:unknown){
  const data=validateEvaluationExport(value),entries:MealEvaluation[]=[];
  for(const entry of data.cases){
    const {photoDataUrl,...metadata}=entry;
    let photo:Blob|undefined;
    if(photoDataUrl){const bytes=Uint8Array.from(atob(photoDataUrl.split(',')[1]),character=>character.charCodeAt(0));photo=new Blob([bytes],{type:'image/jpeg'});}
    entries.push(validateEvaluation({...metadata,...(photo?{photo}:{})}));
  }
  return await db.transaction('rw',db.mealEvaluations,async()=>{
    const existing=new Set(await db.mealEvaluations.toCollection().primaryKeys()),fresh=entries.filter(entry=>!existing.has(entry.id));
    if(existing.size+fresh.length>200)throw Error('The combined collection exceeds 200 examples.');
    await db.mealEvaluations.bulkAdd(fresh);return fresh.length;
  });
}
