import head from './meal-region-head.json';
import {rankPredictions,softmax,type ScannerConfig} from './scanner-math';
export type MealFamily='flatbread'|'curry'|'rice'|'other'|'background';
export function rankMealRegion(global:Float32Array,regional:Float32Array,config:ScannerConfig){
  if(config.modelSha256!==head.modelSha256)throw Error('The mixed-meal classifier needs an updated model package.');
  if(global.length+regional.length!==head.mean.length)throw Error('The region feature dimensions do not match.');
  const features=[...global,...regional].map((value,index)=>(value-head.mean[index])/head.scale[index]);
  const scores=softmax(head.weight.map((weights,index)=>weights.reduce((sum,weight,i)=>sum+weight*features[i],head.bias[index])));
  const best=scores.indexOf(Math.max(...scores));
  return {family:head.classes[best] as MealFamily,confidence:scores[best],predictions:rankPredictions(global,regional,config,'auto')};
}
