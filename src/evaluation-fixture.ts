// Synthetic arithmetic fixture for tests and the documented CLI example.
// These numbers are not measured food-model performance.
import type {MealEvaluation} from './meal-evaluation';
import type {Food} from './types';
export function syntheticEvaluation():MealEvaluation{
  const bread:Food={id:'test:bread',name:'Synthetic bread',category:'Test',serving:'100 g',grams:100,calories:300,protein:10,carbs:50,fat:5,emoji:'',source:'Synthetic test fixture',portionOptions:[{label:'1 medium roti',grams:40}]};
  const curry:Food={...bread,id:'test:curry',name:'Synthetic curry',portionOptions:[{label:'1 cup',grams:200}]};
  return {id:'synthetic-case',createdAt:1,modelVersion:'SYNTHETIC-ARITHMETIC-ONLY',modelDetails:'Not a real model benchmark',captureGroup:'synthetic-session',split:'holdout',diameterCm:26,savedDiameter:false,plateReference:{source:'assumed',areaFraction:.65},complete:true,notes:'Synthetic test data; never report as measured model accuracy.',
    predictions:[
      {id:'bread',family:'flatbread',confidence:.8,box:[.1,.1,.2,.2],portion:{unit:'pieces',amount:2,size:'medium'},suggestedFoodId:null},
      {id:'curry',family:'curry',confidence:.8,box:[.4,.1,.2,.2],portion:{unit:'cups',amount:1,size:'medium'},suggestedFoodId:null},
      {id:'false-positive',family:'other',confidence:.5,box:[.7,.1,.2,.2],portion:{unit:'serving',amount:1,size:'medium'},suggestedFoodId:null},
    ],truth:[
      {id:'actual-bread',name:'Synthetic bread',family:'flatbread',predictionId:'bread',grams:100,visibleCount:3,food:bread,referenceEstimate:{grams:80,foodId:bread.id,predictionId:'bread',method:'photo-prototype-v1'}},
      {id:'actual-curry',name:'Synthetic curry',family:'curry',predictionId:'curry',grams:150,visibleCount:null,food:curry,referenceEstimate:{grams:200,foodId:curry.id,predictionId:'curry',method:'photo-prototype-v1'}},
      {id:'missed-rice',name:'Synthetic missed rice',family:'rice',predictionId:null,grams:100,visibleCount:null,food:null},
    ]};
}
