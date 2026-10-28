import {describe,expect,it} from 'vitest';
import {initialPortion,photoPortion} from './portion-estimates';
import type {Food} from './types';
const roti:Food={id:'roti',name:'Roti',category:'Indian',serving:'100 g',grams:100,calories:299,protein:10,carbs:50,fat:7,emoji:'',source:'test',portionOptions:[{label:'1 medium chappatti or roti (7")',grams:40}]};
describe('photo portion estimates',()=>{
  it('changes scale suggestions with a fitted plate while keeping assumed-area ranges broad',()=>{
    const assumed=initialPortion('curry',[.08],.65,26);
    const fitted=initialPortion('curry',[.08],.3,26);
    expect(fitted.amount).toBeGreaterThan(assumed.amount);
    const choice={unit:'cups' as const,amount:1,size:'medium' as const};
    const unknown=photoPortion(roti,'curry',choice,26,true,{source:'assumed',areaFraction:.65});
    const known=photoPortion(roti,'curry',choice,26,true,{source:'manual',areaFraction:.3});
    expect(unknown.highGrams).toBeGreaterThan(known.highGrams);
    expect(known.basis).toContain('user-fitted outline');
    expect(known.plateReference?.areaFraction).toBe(.3);
  });
  it('uses visible regions for count and projected area for a size suggestion',()=>{
    const result=initialPortion('flatbread',[.1,.1,.1],.65,26);
    expect(result.amount).toBe(3);expect(result.unit).toBe('pieces');
    expect(initialPortion('rice',[.2],.65,26).unit).toBe('cups');
  });
  it('uses actual source piece weights and records uncertainty instead of claiming a measurement',()=>{
    const estimate=photoPortion(roti,'flatbread',{unit:'pieces',amount:3,size:'medium'},26,true);
    expect(estimate.grams).toBe(120);expect(estimate.lowGrams).toBe(84);expect(estimate.highGrams).toBe(156);
    expect(estimate.method).toBe('photo-prototype-v1');expect(estimate.basis).toContain('USDA reference piece');
    expect(photoPortion(roti,'flatbread',{unit:'pieces',amount:3,size:'medium'},26,false).highGrams).toBeGreaterThan(estimate.highGrams);
  });
  it('converts fractional cups using the selected recipe reference rather than a fixed gram amount',()=>{
    const curry={...roti,portionOptions:[{label:'1 cup',grams:200}]};
    const estimate=photoPortion(curry,'curry',{unit:'cups',amount:.75,size:'medium'},26,false);
    expect(estimate.grams).toBe(150);expect(estimate.basis).toContain('Depth is not measured');
    expect(()=>photoPortion(curry,'curry',{unit:'cups',amount:0,size:'medium'},26,false)).toThrow();
    expect(()=>photoPortion(curry,'curry',{unit:'cups',amount:1,size:'medium'},0,false)).toThrow();
  });
});
