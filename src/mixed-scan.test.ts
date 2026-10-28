import {describe,expect,it,vi} from 'vitest';
vi.mock('./scanner',()=>({classifyMealRegion:vi.fn(),segmentPhoto:vi.fn()}));
import {selectFoodRegions,type MealRegion} from './mixed-scan';
function region(id:string,mask:number[],confidence:number):MealRegion{return {id,mask:new Uint8Array(mask),area:mask.filter(Boolean).length/mask.length,box:[0,0,1,1],quality:.95,family:'flatbread',confidence,predictions:[{label:'naan',confidence:.9,cuisine:'indian'}]};}
describe('mixed-food instance selection',()=>{
  it('keeps two separate pieces instead of letting their higher-scoring parent hide both',()=>{
    const parent=region('parent',Array(10).fill(1),.99),a=region('a',[1,1,1,1,0,0,0,0,0,0],.85),b=region('b',[0,0,0,0,0,1,1,1,1,0],.8);
    expect(selectFoodRegions([parent,a,b]).map(item=>item.id)).toEqual(['a','b']);
  });
});
