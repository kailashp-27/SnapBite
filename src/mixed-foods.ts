import {db} from './db';
import type {Food} from './types';
export const mixedFoodIds=['usda:2707713','usda:2707613','usda:2708347','usda:2707714','parotta','usda:2708408','usda:2708985','usda:2706538','usda:2707427','usda:2706437','usda:2709631','recipe:photo-paneer-curry','kofta'];
export async function prepareMixedFoods():Promise<void>{
  if(await db.foodLibrary.get('recipe:photo-paneer-curry'))return;
  const weights:[[string,number],...Array<[string,number]>]=[['usda:2705740',40],['usda:2710247',35],['usda:2705597',12],['usda:2709795',8],['usda:2710186',5]];
  const ingredients=await db.foodLibrary.bulkGet(weights.map(([id])=>id));
  if(ingredients.some(food=>!food))return;
  const values={calories:0,protein:0,carbs:0,fat:0};
  weights.forEach(([,grams],index)=>{const food=ingredients[index]!;for(const key of ['calories','protein','carbs','fat'] as const)values[key]+=food[key]/food.grams*grams;});
  const food:Food={id:'recipe:photo-paneer-curry',name:'Paneer tomato curry (reference recipe)',category:'Indian',serving:'100 g',grams:100,...values,emoji:'🍛',aliases:['paneer curry','paneer tikka masala','paneer butter masala'],nutritionKind:'reference-recipe',portionOptions:[{label:'1 cup (reference estimate)',grams:240}],source:'Illustrative paneer tomato/cream curry, not a measured recipe. Finished edible yield assumed 100 g. USDA ingredient weights: '+weights.map(([id,grams],index)=>`${grams} g ${ingredients[index]!.name} (${id})`).join('; ')+'. Oil, cream, ingredient ratios and cooking yield vary.'};
  await db.transaction('rw',db.foodLibrary,async()=>{if(!await db.foodLibrary.get(food.id))await db.foodLibrary.add(food);});
}
export function friendlyFood(food:Food):string{
  return ({'usda:2707713':'Chapati / roti','usda:2707613':'Naan','usda:2708347':'Plain dosa','usda:2707714':'Puri','usda:2708408':'Plain rice','usda:2708985':'Vegetable biryani','usda:2706538':'Chicken biryani','usda:2707427':'Dal','usda:2706437':'Chicken curry','usda:2709631':'Palak paneer','recipe:photo-paneer-curry':'Paneer tomato curry'} as Record<string,string>)[food.id]??food.name;
}
