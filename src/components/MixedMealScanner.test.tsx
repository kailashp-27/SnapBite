// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import MixedMealScanner from './MixedMealScanner';

const mocks=vi.hoisted(()=>({
  foods:[{id:'usda:2707713',name:'Chapati / roti',category:'Indian',serving:'100 g',grams:100,calories:299,protein:10,carbs:50,fat:7,emoji:'',source:'test',portionOptions:[{label:'1 medium chappatti',grams:40}]},{id:'recipe:photo-paneer-curry',name:'Paneer curry',category:'Indian',serving:'100 g',grams:100,calories:250,protein:12,carbs:10,fat:18,emoji:'',source:'test',portionOptions:[{label:'1 cup',grams:240}]}],
  save:vi.fn(),detect:vi.fn(),logged:vi.fn(),notify:vi.fn(),
}));
vi.mock('../db',()=>({db:{scanPreferences:{get:async()=>undefined,put:async()=>undefined},foodLibrary:{bulkGet:async(ids:string[])=>ids.map(id=>mocks.foods.find(food=>food.id===id)),filter:(predicate:(food:typeof mocks.foods[number])=>boolean)=>({limit:()=>({toArray:async()=>mocks.foods.filter(predicate)})})}},addPhotoMeal:(...args:unknown[])=>mocks.save(...args)}));
vi.mock('../mixed-foods',()=>({mixedFoodIds:['usda:2707713','recipe:photo-paneer-curry'],prepareMixedFoods:async()=>{},friendlyFood:(food:{name:string})=>food.name}));
vi.mock('../mixed-model-assets',()=>({mixedManifest:async()=>({version:'mixed-v1',assets:[],totalBytes:1}),mixedReady:async()=>true,prepareMixed:async()=>{}}));
vi.mock('../scanner',()=>({warmMixedScanner:async()=>{}}));
vi.mock('../mixed-scan',()=>({detectMixedMeal:(...args:unknown[])=>mocks.detect(...args)}));

beforeEach(()=>{
  vi.clearAllMocks();mocks.save.mockResolvedValue(undefined);
  vi.stubGlobal('Image',class{src='';naturalWidth=800;naturalHeight=600;async decode(){}});
  vi.stubGlobal('URL',{createObjectURL:()=> 'blob:test-photo',revokeObjectURL:()=>{}});
  const region=(id:string,family:string,label:string)=>({id,family,confidence:.95,quality:.95,area:.08,box:[.1,.1,.2,.2],mask:new Uint8Array(4),predictions:[{label,confidence:.9,cuisine:'indian'}]});
  mocks.detect.mockResolvedValue({plate:null,regions:[region('bread-1','flatbread','naan'),region('bread-2','flatbread','naan'),region('bread-3','flatbread','naan'),region('curry','curry','paneer')]});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

async function scan(){
  const view=render(<MixedMealScanner date="2026-10-25" libraryReady notify={mocks.notify} onLogged={mocks.logged}/>);
  await waitFor(()=>expect((screen.getByRole('button',{name:'Choose meal photo'}) as HTMLButtonElement).disabled).toBe(false));
  const input=view.container.querySelectorAll('input[type="file"]')[1];
  fireEvent.change(input,{target:{files:[new File(['photo'],'meal.jpg',{type:'image/jpeg'})]}});
  await screen.findByLabelText('Visible pieces');return view;
}
describe('mixed-meal review flow',()=>{
  it('fits photo scale, preserves edited quantities, and saves the reference with the meal',async()=>{
    await scan();
    fireEvent.change(screen.getAllByLabelText('Recipe')[0],{target:{value:'usda:2707713'}});
    const cups=screen.getByLabelText('Estimated cups') as HTMLInputElement;
    const original=Number(cups.value);
    fireEvent.click(screen.getByRole('button',{name:'Set plate outline'}));
    fireEvent.change(screen.getByLabelText('Plate width'),{target:{value:'.6'}});
    fireEvent.change(screen.getByLabelText('Plate height'),{target:{value:'.6'}});
    fireEvent.click(screen.getByRole('button',{name:'Use this outline'}));
    expect(Number(cups.value)).toBeGreaterThan(original);
    fireEvent.change(cups,{target:{value:'.75'}});
    fireEvent.click(screen.getByRole('button',{name:'Adjust plate outline'}));
    fireEvent.change(screen.getByLabelText('Plate width'),{target:{value:'.7'}});
    fireEvent.click(screen.getByRole('button',{name:'Use this outline'}));
    expect(Number(cups.value)).toBe(.75);
    fireEvent.click(screen.getByRole('button',{name:'Confirm & log estimates'}));
    await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(1));
    const [items]=mocks.save.mock.calls[0];
    expect(items[1].estimate.grams).toBe(180);
    expect(items[1].estimate.plateReference.source).toBe('manual');
    expect(items[1].estimate.plateReference.areaFraction).toBeCloseTo(Math.PI*.7*.6/4);
    expect(items[1].estimate.basis).toContain('User-adjusted');
  });
  it('switches portion type when a bread suggestion is corrected to a curry',async()=>{
    await scan();
    fireEvent.change(screen.getAllByLabelText('Recipe')[0],{target:{value:'recipe:photo-paneer-curry'}});
    expect(screen.queryByLabelText('Visible pieces')).toBeNull();
    expect(screen.getAllByLabelText('Estimated cups')).toHaveLength(2);
  });
  it('suggests a visible count, requires recipe review and logs adjusted portions without entering grams',async()=>{
    await scan();
    expect((screen.getByLabelText('Visible pieces') as HTMLInputElement).value).toBe('3');
    const save=screen.getByRole('button',{name:'Confirm & log estimates'}) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getAllByLabelText('Recipe')[0],{target:{value:'usda:2707713'}});
    fireEvent.change(screen.getByLabelText('Visible pieces'),{target:{value:'2'}});
    fireEvent.change(screen.getByLabelText('Piece size'),{target:{value:'medium'}});
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(1));
    const [items,date,meal]=mocks.save.mock.calls[0];
    expect(items).toHaveLength(2);expect(date).toBe('2026-10-25');expect(['Breakfast','Lunch','Dinner']).toContain(meal);
    expect(items[0].estimate.grams).toBe(80);expect(items[0].estimate.description).toBe('2 medium pieces');
    expect(items[1].estimate.description).toContain('cup');
    await waitFor(()=>expect(mocks.logged).toHaveBeenCalledTimes(1));
  });
  it('does not log an invalid or missing estimated quantity',async()=>{
    await scan();fireEvent.change(screen.getAllByLabelText('Recipe')[0],{target:{value:'usda:2707713'}});
    fireEvent.change(screen.getByLabelText('Visible pieces'),{target:{value:'0'}});
    expect((screen.getByRole('button',{name:'Confirm & log estimates'}) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('lets a user replace an uncertain recipe from the offline library',async()=>{
    await scan();fireEvent.click(screen.getAllByRole('button',{name:'Find a different food'})[0]);
    fireEvent.change(screen.getByLabelText('Search meal foods'),{target:{value:'Chapati'}});
    fireEvent.click(await screen.findByRole('button',{name:/Chapati \/ roti/}));
    await waitFor(()=>expect((screen.getAllByLabelText('Recipe')[0] as HTMLSelectElement).value).toBe('usda:2707713'));
    expect(screen.queryByRole('dialog',{name:'Choose a meal food'})).toBeNull();
  });
});
