import {classifyMealRegion, segmentPhoto, type MealFamily} from './scanner';
import {cleanMaskRegion,isBorderBackground,isContainer,maskOverlap,plateReference,uniqueMasks,type MaskRegion} from './meal-regions';
import type {Prediction} from './scanner-math';
import type {PortionFamily} from './portion-estimates';

export interface MealRegion extends MaskRegion {family:PortionFamily;confidence:number;predictions:Prediction[];}
export interface MealDetection {regions:MealRegion[];plate:MaskRegion|null;notices?:string[];}
export function selectFoodRegions(regions:(MaskRegion&{family:MealFamily;confidence:number;predictions:Prediction[]})[]):MealRegion[]{
  const breadLabels=new Set(['naan','dosa','pancakes','french_toast','garlic_bread']);
  const candidates=regions.filter(region=>region.family!=='background'&&!isBorderBackground(region)&&region.confidence>=.45&&region.area>=.015).map(region=>
    region.family==='flatbread'&&region.confidence<.8&&!breadLabels.has(region.predictions[0]?.label)?{...region,family:'other' as const,confidence:Math.min(.55,region.confidence)}:region);
  const selected:MealRegion[]=[];
  const score=(region:typeof candidates[number])=>region.quality*region.confidence*(region.family==='other'?.85:1);
  for(const region of candidates.filter(region=>!isContainer(region,candidates)).sort((a,b)=>score(b)-score(a))){
    if(selected.some(other=>{const overlap=maskOverlap(region,other);return overlap.iou>.4||overlap.contained>.88;}))continue;
    selected.push({...region,family:region.family as PortionFamily});
    if(selected.length>=10)break;
  }
  return selected;
}
export function prepareMealRegions(raw:MaskRegion[],width:number,height:number){
  const proposals=uniqueMasks(raw.map(region=>cleanMaskRegion(region)));
  const plate=plateReference(proposals);
  const objects=proposals.filter(region=>{
    const aspect=region.box[2]*width/(region.box[3]*height);
    return region.id!==plate?.id&&!isBorderBackground(region)&&!isContainer(region,proposals)&&Math.max(aspect,1/aspect)<=8;
  }).slice(0,18);
  return {objects,plate};
}
export async function detectMixedMeal(image:HTMLImageElement,onProgress:(message:string)=>void):Promise<MealDetection>{
  onProgress('Finding separate food regions…');const proposals=await segmentPhoto(image);
  const {objects,plate}=prepareMealRegions(proposals,image.naturalWidth,image.naturalHeight);
  const classified=[];
  for(let i=0;i<objects.length;i++){
    onProgress(`Checking food ${i+1} of ${objects.length}…`);
    try{const result=await classifyMealRegion(image,objects[i]);classified.push({...objects[i],...result});}catch(error){if(i===0)throw error;}
  }
  const regions=selectFoodRegions(classified);
  return {regions,plate,notices:regions.some(region=>region.area>.55)?['A large region may contain several foods. Review it and add any missed foods.']:[]};
}
