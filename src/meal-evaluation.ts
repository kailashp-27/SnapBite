import type {Food} from './types';
import {photoPortion,type PortionChoice,type PortionFamily} from './portion-estimates';
import {validPlateReference,type PlateReference} from './plate-reference';

export interface EvaluationPrediction {
  id:string;family:PortionFamily;confidence:number;box:[number,number,number,number];
  portion:PortionChoice;suggestedFoodId:string|null;
}
export interface EvaluationTruth {
  id:string;name:string;family:PortionFamily;predictionId:string|null;
  grams:number|null;visibleCount:number|null;food:Food|null;
  referenceEstimate?:{grams:number;foodId:string;predictionId:string;method:'photo-prototype-v1'};
}
export interface MealEvaluation {
  id:string;createdAt:number;modelVersion:string;modelDetails:string;
  diameterCm:number;savedDiameter:boolean;plateReference:PlateReference;
  predictions:EvaluationPrediction[];truth:EvaluationTruth[];complete:boolean;
  photo?:Blob;notes:string;archivedAt?:number;
  captureGroup:string;split:'holdout'|'training';photoSha256?:string;
}
export type ExportedEvaluation=Omit<MealEvaluation,'photo'>&{photoDataUrl?:string};
export interface EvaluationExport {format:'snapbite-meal-evaluation';version:1;cases:ExportedEvaluation[];}
const families=['flatbread','curry','rice','other'];
const record=(value:unknown):value is Record<string,unknown>=>typeof value==='object'&&value!==null;
const text=(value:unknown,max=200):value is string=>typeof value==='string'&&value.length>0&&value.length<=max;
const finite=(value:unknown,min:number,max:number):value is number=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
function validFood(value:unknown):value is Food {
  if(!record(value)||!['id','name','category','serving','source'].every(key=>text(value[key],2000))||typeof value.emoji!=='string')return false;
  if(!finite(value.grams,.01,100000)||!['calories','protein','carbs','fat'].every(key=>finite(value[key],0,100000)))return false;
  return value.portionOptions===undefined||(Array.isArray(value.portionOptions)&&value.portionOptions.length<=50&&value.portionOptions.every(option=>record(option)&&text(option.label,500)&&finite(option.grams,.01,100000)));
}
export function validateEvaluation(value:unknown):MealEvaluation {
  if(!record(value)||!text(value.id,100)||!finite(value.createdAt,0,1e15)||!text(value.modelVersion,200)||!text(value.modelDetails,2000)||!finite(value.diameterCm,10,50)||typeof value.savedDiameter!=='boolean'||!validPlateReference(value.plateReference)||typeof value.complete!=='boolean'||typeof value.notes!=='string'||value.notes.length>2000||!Array.isArray(value.predictions)||value.predictions.length>20||!Array.isArray(value.truth)||value.truth.length>30)throw Error('Invalid meal-evaluation case.');
  const ids=new Set<string>();
  if(!text(value.captureGroup,100)||!['holdout','training'].includes(String(value.split))||(value.photoSha256!==undefined&&(typeof value.photoSha256!=='string'||!/^[a-f0-9]{64}$/.test(value.photoSha256))))throw Error('Invalid evaluation session or split.');
  for(const prediction of value.predictions){
    if(!record(prediction)||!text(prediction.id,100)||ids.has(prediction.id)||!families.includes(String(prediction.family))||!finite(prediction.confidence,0,1)||!Array.isArray(prediction.box)||prediction.box.length!==4||!prediction.box.every((n:unknown)=>finite(n,0,1))||Number(prediction.box[2])<=0||Number(prediction.box[3])<=0||Number(prediction.box[0])+Number(prediction.box[2])>1.000001||Number(prediction.box[1])+Number(prediction.box[3])>1.000001||!record(prediction.portion)||!['pieces','cups','serving'].includes(String(prediction.portion.unit))||!['small','medium','large'].includes(String(prediction.portion.size))||!finite(prediction.portion.amount,.01,20)||(prediction.suggestedFoodId!==null&&!text(prediction.suggestedFoodId,200)))throw Error('Invalid original scan prediction.');
    ids.add(prediction.id);
  }
  const truthIds=new Set<string>(),matches=new Set<string>();
  for(const item of value.truth){
    if(!record(item)||!text(item.id,100)||truthIds.has(item.id)||!text(item.name,200)||!families.includes(String(item.family))||(item.grams!==null&&!finite(item.grams,.1,10000))||(item.visibleCount!==null&&(!finite(item.visibleCount,1,100)||!Number.isInteger(item.visibleCount)))||(item.food!==null&&!validFood(item.food))||(item.predictionId!==null&&(!text(item.predictionId,100)||!ids.has(item.predictionId)||matches.has(item.predictionId))))throw Error('Check actual foods, weights and one-to-one region matches.');
    truthIds.add(item.id);if(item.predictionId)matches.add(String(item.predictionId));
    if(item.referenceEstimate!==undefined){
      const estimate=item.referenceEstimate,prediction=value.predictions.find((entry:Record<string,unknown>)=>entry.id===item.predictionId);
      if(!record(estimate)||!finite(estimate.grams,.01,100000)||estimate.method!=='photo-prototype-v1'||!record(item.food)||estimate.foodId!==item.food.id||estimate.predictionId!==item.predictionId||!prediction||prediction.family!==item.family||prediction.portion.unit==='serving')throw Error('Invalid frozen reference estimate.');
    }
  }
  if(value.photo!==undefined&&(!(value.photo instanceof Blob)||value.photo.type!=='image/jpeg'||value.photo.size>1500000))throw Error('Invalid evaluation photo.');
  if(value.archivedAt!==undefined&&!finite(value.archivedAt,0,1e15))throw Error('Invalid archive date.');
  return value as unknown as MealEvaluation;
}
export function validateEvaluationExport(value:unknown):EvaluationExport {
  if(!record(value)||value.format!=='snapbite-meal-evaluation'||value.version!==1||!Array.isArray(value.cases)||value.cases.length>200)throw Error('Choose a SnapBite evaluation export with at most 200 cases.');
  const ids=new Set<string>();
  for(const entry of value.cases){
    validateEvaluation(entry);
    if(ids.has(entry.id))throw Error('Duplicate evaluation case.');ids.add(entry.id);
    if(entry.photoDataUrl!==undefined&&(typeof entry.photoDataUrl!=='string'||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(entry.photoDataUrl)||entry.photoDataUrl.length>2000100))throw Error('Invalid evaluation photo data.');
  }
  return value as unknown as EvaluationExport;
}

export interface ErrorMetric {samples:number;mae:number|null;bias:number|null;mape:number|null;}
/** Freeze recipe-conditioned grams when labeling; later library/math changes cannot rewrite scores. */
export function conditionEvaluation(entry:MealEvaluation,previous?:MealEvaluation):MealEvaluation {
  return {...entry,truth:entry.truth.map(truth=>{
    const {referenceEstimate:discarded,...labels}=truth;void discarded;
    const prediction=entry.predictions.find(item=>item.id===truth.predictionId);
    if(!prediction||prediction.family!==truth.family||!truth.food||prediction.portion.unit==='serving')return labels;
    const prior=previous?.truth.find(item=>item.id===truth.id);
    if(prior?.referenceEstimate&&prior.predictionId===truth.predictionId&&prior.family===truth.family&&JSON.stringify(prior.food)===JSON.stringify(truth.food))return {...labels,referenceEstimate:prior.referenceEstimate};
    const estimate=photoPortion(truth.food,prediction.family,prediction.portion,entry.diameterCm,entry.savedDiameter,entry.plateReference);
    return {...labels,referenceEstimate:{grams:estimate.grams,foodId:truth.food.id,predictionId:prediction.id,method:estimate.method}};
  })};
}
const errors=(pairs:{actual:number;predicted:number}[]):ErrorMetric=>({samples:pairs.length,mae:pairs.length?pairs.reduce((sum,p)=>sum+Math.abs(p.predicted-p.actual),0)/pairs.length:null,bias:pairs.length?pairs.reduce((sum,p)=>sum+p.predicted-p.actual,0)/pairs.length:null,mape:pairs.length?pairs.reduce((sum,p)=>sum+Math.abs(p.predicted-p.actual)/p.actual,0)/pairs.length*100:null});
export function evaluationReport(cases:MealEvaluation[]){
  const trainingGroups=new Set(cases.filter(entry=>entry.split==='training').map(entry=>entry.captureGroup));
  const trainingPhotos=new Set(cases.filter(entry=>entry.split==='training'&&entry.photoSha256).map(entry=>entry.photoSha256));
  cases=cases.filter(entry=>entry.archivedAt===undefined);
  const versions=[...new Set(cases.map(entry=>entry.modelVersion))];
  return versions.map(modelVersion=>{
    const group=cases.filter(entry=>entry.modelVersion===modelVersion),seen=new Set<string>();let excludedLeakage=0,duplicatePhotos=0;
    const complete=group.filter(entry=>{
      if(!entry.complete||entry.split!=='holdout')return false;
      if(trainingGroups.has(entry.captureGroup)||(entry.photoSha256&&trainingPhotos.has(entry.photoSha256))){excludedLeakage++;return false;}
      if(entry.photoSha256&&seen.has(entry.photoSha256)){duplicatePhotos++;return false;}
      if(entry.photoSha256)seen.add(entry.photoSha256);return true;
    });
    let predictions=0,foods=0,matched=0,familyCorrect=0,weighed=0,counted=0;
    const weights:{actual:number;predicted:number}[]=[],counts:{actual:number;predicted:number}[]=[];
    for(const entry of complete){
      predictions+=entry.predictions.length;foods+=entry.truth.length;
      for(const truth of entry.truth){
        if(truth.grams!==null)weighed++;
        if(truth.visibleCount!==null)counted++;
        const prediction=entry.predictions.find(item=>item.id===truth.predictionId);if(!prediction)continue;
        matched++;if(prediction.family===truth.family)familyCorrect++;
        if(truth.visibleCount!==null&&prediction.family==='flatbread'&&truth.family==='flatbread'&&prediction.portion.unit==='pieces')counts.push({actual:truth.visibleCount,predicted:prediction.portion.amount});
        // This isolates quantity error using the confirmed reference recipe. It is
        // not end-to-end automatic nutrition accuracy; fallbacks and misses remain uncovered.
        if(truth.grams!==null&&truth.food&&prediction.family===truth.family&&prediction.portion.unit!=='serving'&&truth.referenceEstimate){
          weights.push({actual:truth.grams,predicted:truth.referenceEstimate.grams});
        }
      }
    }
    const negativeImages=complete.filter(entry=>!entry.truth.length).length,falsePositiveImages=complete.filter(entry=>!entry.truth.length&&entry.predictions.length>0).length;
    return {modelVersion,cases:group.length,completeCases:complete.length,negativeImages,falsePositiveImages,excludedTraining:group.filter(entry=>entry.split==='training').length,excludedLeakage,duplicatePhotos,predictions,foods,matched,missedFoods:foods-matched,unmatchedPredictions:predictions-matched,
      precision:predictions?matched/predictions:null,recall:foods?matched/foods:null,familyAccuracy:matched?familyCorrect/matched:null,
      weight:{...errors(weights),weighedFoods:weighed,coverage:weighed?weights.length/weighed:null},count:{...errors(counts),countedFoods:counted,coverage:counted?counts.length/counted:null}};
  });
}
