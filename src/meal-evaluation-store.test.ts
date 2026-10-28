import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import {webcrypto} from 'node:crypto';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {db} from './db';
import {exportEvaluations,importEvaluations,saveEvaluation,snapshotEvaluation} from './meal-evaluation-store';
import {syntheticEvaluation} from './evaluation-fixture';

beforeEach(async()=>{vi.stubGlobal('crypto',webcrypto);await db.open();});
afterEach(async()=>{await db.delete();vi.unstubAllGlobals();});
describe('evaluation storage',()=>{
  it('upgrades a version-three diary without changing its meal or water records',async()=>{
    await db.delete();
    const previous=new Dexie('snapbite');previous.version(3).stores({foodLibrary:'id,name,category,*aliases',dailyLogs:'++id,date,[date+meal],foodId,createdAt',days:'date',preferences:'id',libraryState:'id',scanPreferences:'id'});
    await previous.open();
    await previous.table('days').put({date:'2026-10-25',water:3});
    await previous.table('dailyLogs').add({date:'2026-10-25',meal:'Lunch',foodId:'existing',name:'Existing meal',emoji:'',serving:'1 bowl',portions:1,calories:200,protein:10,carbs:25,fat:7,createdAt:1});
    previous.close();await db.open();
    expect((await db.days.get('2026-10-25'))?.water).toBe(3);
    expect((await db.dailyLogs.toArray())[0].name).toBe('Existing meal');expect(await db.mealEvaluations.count()).toBe(0);
  });
  it('freezes original counts and scale without writing to the diary',async()=>{
    const groups=[{id:'bread',foodId:'',family:'flatbread' as const,regions:[{area:.1,confidence:.9,box:[.1,.1,.2,.2] as [number,number,number,number]},{area:.1,confidence:.9,box:[.5,.1,.2,.2] as [number,number,number,number]}]}];
    const reference={source:'assumed' as const,areaFraction:.65};
    const snapshot=await snapshotEvaluation(groups,reference,26,false,null);
    groups[0].regions.pop();reference.areaFraction=.3;
    expect(snapshot.predictions[0].portion.amount).toBe(2);expect(snapshot.plateReference.areaFraction).toBe(.65);
    expect(snapshot.modelVersion).toMatch(/^meal-[a-f0-9]{16}$/);
    await saveEvaluation(syntheticEvaluation());
    expect(await db.mealEvaluations.count()).toBe(1);expect(await db.dailyLogs.count()).toBe(0);
  });
  it('round-trips metadata, skips existing IDs and rejects invalid imports atomically',async()=>{
    const example=syntheticEvaluation();await saveEvaluation(example);
    const exported=await exportEvaluations(false);
    expect(await importEvaluations(exported)).toBe(0);
    expect((await db.mealEvaluations.get(example.id))?.notes).toBe(example.notes);
    await expect(importEvaluations({...exported,cases:[{...example,id:'new-case'},{...example,id:'invalid',truth:[{...example.truth[0],grams:-1}]}]})).rejects.toThrow();
    expect(await db.mealEvaluations.count()).toBe(1);
    await db.mealEvaluations.clear();expect(await importEvaluations(exported)).toBe(1);
  });
});
