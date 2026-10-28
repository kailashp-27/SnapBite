import type {Food} from './types';
import {validPlateReference,type PlateReference} from './plate-reference';
export type PortionFamily='flatbread'|'curry'|'rice'|'other';
export type BreadSize='small'|'medium'|'large';
export interface PortionChoice {unit:'pieces'|'cups'|'serving';amount:number;size:BreadSize;}
export interface PhotoEstimate {
  method:'photo-prototype-v1';description:string;grams:number;lowGrams:number;highGrams:number;
  scale:'assumed'|'saved';plateDiameterCm:number;basis:string;
  plateReference?:PlateReference;
}
const sizes:Record<BreadSize,number>={small:27,medium:40,large:52};
export function initialPortion(family:PortionFamily,areas:number[],plateArea:number,diameterCm:number):PortionChoice{
  if(family==='flatbread'){
    const averageArea=areas.reduce((sum,area)=>sum+area,0)/Math.max(1,areas.length);
    const diameter=diameterCm*Math.sqrt(averageArea/Math.max(.05,plateArea));
    return {unit:'pieces',amount:Math.max(1,areas.length),size:diameter<16.5?'small':diameter>19?'large':'medium'};
  }
  if(family==='curry'||family==='rice'){
    const areaCm2=Math.PI*(diameterCm/2)**2*areas.reduce((sum,area)=>sum+area,0)/Math.max(.05,plateArea);
    // An explicit shape prior, not inferred depth or a trained weight model.
    const volume=areaCm2*(family==='rice'?2:1.8);
    return {unit:'cups',amount:Math.max(.25,Math.min(4,Math.round(volume/240*4)/4)),size:'medium'};
  }
  return {unit:'serving',amount:1,size:'medium'};
}
export function photoPortion(food:Food,family:PortionFamily,choice:PortionChoice,plateDiameterCm:number,savedScale:boolean,plateReference?:PlateReference):PhotoEstimate{
  if(!Number.isFinite(choice.amount)||choice.amount<=0||choice.amount>20||!Number.isFinite(plateDiameterCm)||plateDiameterCm<10||plateDiameterCm>50)throw Error('Check the portion and plate size.');
  if(plateReference&&!validPlateReference(plateReference))throw Error('Check the plate outline.');
  let grams:number,description:string,basis:string;
  if(choice.unit==='pieces'){
    const size=choice.size;
    const matching=food.portionOptions?.find(option=>option.label.toLowerCase().startsWith(`1 ${size}`));
    const wholeNaan=food.portionOptions?.find(option=>/^1 naan/i.test(option.label));
    const piece=wholeNaan??food.portionOptions?.find(option=>/^1 (?:piece|puri|dosa|parotta)/i.test(option.label));
    const inches=piece?.label.match(/(\d+(?:\.\d+)?)\s*"/);
    const diameterInches={small:6,medium:7,large:8}[size];
    const reference=matching?.grams??(piece?piece.grams*(inches?(diameterInches/Number(inches[1]))**2:({small:.75,medium:1,large:1.3}[size])):food.serving==='100 g'&&family==='flatbread'?sizes[size]:food.grams*({small:.75,medium:1,large:1.3}[size]));
    grams=reference*choice.amount;description=`${choice.amount} ${size} piece${choice.amount===1?'':'s'}`;
    basis=matching?'USDA reference piece weight; thickness and hidden pieces are uncertain.':'Typical flatbread piece weight; identity, size and thickness need review.';
  }else if(choice.unit==='cups'){
    const cup=food.portionOptions?.find(option=>/^1 cup(?:\b|,)/i.test(option.label));
    const gramsPerCup=cup?.grams??(family==='rice'?158:240);
    grams=choice.amount*gramsPerCup;description=`${choice.amount} cup${choice.amount===1?'':'s'}`;
    basis=`Projected food area and an assumed ${family==='rice'?'2':'1.8'} cm depth; ${cup?'USDA':'assumed'} cup weight. Depth is not measured.`;
  }else{
    const portion=food.portionOptions?.find(option=>/^1 /i.test(option.label)&&!/surface inch/i.test(option.label));
    grams=choice.amount*(portion?.grams??food.grams);description=`${choice.amount} × ${portion?.label??food.serving}`;basis='Typical serving fallback; quantity was not inferred from the photo.';
  }
  // Saving a diameter alone does not establish which pixels represent that plate.
  const hasScale=savedScale&&(!plateReference||plateReference.source!=='assumed');
  const uncertainty=choice.unit==='pieces'?(hasScale ? .3 : .45):(hasScale ? .45 : .65);
  if(plateReference)basis+=` Plate area: ${plateReference.source==='manual'?'user-fitted outline':plateReference.source==='detected'?'model-suggested outline':'assumed'}.`;
  return {method:'photo-prototype-v1',description,grams,lowGrams:grams*(1-uncertainty),highGrams:grams*(1+uncertainty),scale:savedScale?'saved':'assumed',plateDiameterCm,basis,...(plateReference?{plateReference}:{})};
}
