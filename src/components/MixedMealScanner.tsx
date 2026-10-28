import {useEffect, useRef, useState} from 'react';
import {Camera, Check, Download, ImagePlus, LoaderCircle, Plus, ScanLine, Trash2} from 'lucide-react';
import {db, addPhotoMeal} from '../db';
import {decimal, number} from '../format';
import {mixedManifest, mixedReady, prepareMixed, type MixedManifest} from '../mixed-model-assets';
import {warmMixedScanner} from '../scanner';
import {detectMixedMeal, type MealDetection, type MealRegion} from '../mixed-scan';
import {initialPortion, photoPortion, type BreadSize, type PortionChoice, type PortionFamily} from '../portion-estimates';
import {friendlyFood, mixedFoodIds, prepareMixedFoods} from '../mixed-foods';
import {foodIdsForLabel} from '../food-matching';
import {meals, type Food, type Meal} from '../types';
import type {DownloadProgress} from '../scanner-assets';
import MealFoodSearch from './MealFoodSearch';
import PlateCalibration from './PlateCalibration';
import MealPhotoOverlay from './MealPhotoOverlay';
import {plateArea as outlineArea,type PlateOutline,type PlateReference} from '../plate-reference';
import type {MealEvaluation} from '../meal-evaluation';
import {snapshotEvaluation} from '../meal-evaluation-store';
import EvaluationEditor from './EvaluationEditor';

interface Draft {id:string;family:PortionFamily;regions:MealRegion[];foodId:string;choice:PortionChoice|null;manual:boolean;}
interface Props {date:string;libraryReady:boolean;notify:(message:string)=>void;onLogged:()=>void;}
const familyName={flatbread:'Flatbread',curry:'Curry / dal',rice:'Rice',other:'Food'};
function familyForFood(id:string):PortionFamily{
  if(['usda:2707713','usda:2707613','usda:2708347','usda:2707714','parotta'].includes(id))return 'flatbread';
  if(['usda:2708408','usda:2708985','usda:2706538'].includes(id))return 'rice';
  if(['usda:2707427','usda:2706437','usda:2709631','recipe:photo-paneer-curry','kofta'].includes(id))return 'curry';
  return 'other';
}
function suggestedFood(region:MealRegion):string{
  const best=region.predictions[0];
  if(region.confidence<.6)return '';
  if(region.family==='flatbread')return best?.label==='dosa'&&best.confidence>=.6?'usda:2708347':'';
  if(region.family==='rice')return best?.label==='biryani'?'':'usda:2708408';
  if(region.family==='curry')return ({paneer:'recipe:photo-paneer-curry',dal:'usda:2707427',kofta:'kofta',chicken_curry:'usda:2706437'} as Record<string,string>)[best?.label]??'';
  const ids=best?foodIdsForLabel(best.label):[];return best?.confidence>=.5&&ids.length===1?ids[0]:'';
}
export default function MixedMealScanner({date,libraryReady,notify,onLogged}:Props){
  const [manifest,setManifest]=useState<MixedManifest|null>(null),[ready,setReady]=useState(false),[checking,setChecking]=useState(true);
  const [setupBusy,setSetupBusy]=useState(false),[progress,setProgress]=useState<DownloadProgress|null>(null),[error,setError]=useState('');
  const [photo,setPhoto]=useState(''),[imageSize,setImageSize]=useState({width:1,height:1}),[busy,setBusy]=useState(false),[stage,setStage]=useState('');
  const [detection,setDetection]=useState<MealDetection|null>(null),[drafts,setDrafts]=useState<Draft[]>([]),[foods,setFoods]=useState<Food[]>([]);
  const [diameter,setDiameter]=useState(26),[savedScale,setSavedScale]=useState(false),[active,setActive]=useState('');
  const [meal,setMeal]=useState<Meal>(new Date().getHours()<11?'Breakfast':new Date().getHours()<17?'Lunch':'Dinner'),[saving,setSaving]=useState(false);
  const [searching,setSearching]=useState<string|null>(null);
  const [plateOutline,setPlateOutline]=useState<PlateOutline|null>(null),[calibrating,setCalibrating]=useState(false);
  const [originalScan,setOriginalScan]=useState<MealEvaluation|null>(null),[evaluating,setEvaluating]=useState(false);
  const photoFile=useRef<File|null>(null);
  const camera=useRef<HTMLInputElement>(null),gallery=useRef<HTMLInputElement>(null),generation=useRef(0),controller=useRef<AbortController|null>(null);
  const alive=useRef(true);
  useEffect(()=>{
    alive.current=true;
    void(async()=>{try{const value=await mixedManifest();const available=await mixedReady(value);if(alive.current){setManifest(value);setReady(available);}}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Model setup unavailable.');}finally{if(alive.current)setChecking(false);}})();
    void db.scanPreferences.get('plate').then(value=>{if(value&&alive.current&&value.plateDiameterCm>=10&&value.plateDiameterCm<=50){setDiameter(value.plateDiameterCm);setSavedScale(true);}});
    return()=>{alive.current=false;generation.current++;controller.current?.abort();};
  },[]);
  useEffect(()=>()=>{if(photo)URL.revokeObjectURL(photo);},[photo]);
  useEffect(()=>{if(!libraryReady)return;void(async()=>{await prepareMixedFoods();const result=await db.foodLibrary.bulkGet(mixedFoodIds);if(alive.current)setFoods(result.filter((food):food is Food=>!!food));})().catch(()=>{});},[libraryReady]);

  async function setup(){
    setSetupBusy(true);setError('');controller.current=new AbortController();
    try{const value=manifest??await mixedManifest();setManifest(value);await prepareMixed(value,p=>{if(alive.current)setProgress(p);},controller.current.signal);await warmMixedScanner();if(alive.current){setReady(true);notify('Mixed-meal scanning is ready offline');}}
    catch(e){if(alive.current)setError(e instanceof Error?e.message:'Setup interrupted. Retry to resume.');}
    finally{if(alive.current)setSetupBusy(false);}
  }
  async function analyze(file:File){
    if(!file.type.startsWith('image/')||file.size>20*1024*1024){notify('Choose an image smaller than 20 MB.');return;}
    if(!Number.isFinite(diameter)||diameter<10||diameter>50){notify('Choose a plate diameter between 10 and 50 cm.');return;}
    const token=++generation.current,url=URL.createObjectURL(file);setPhoto(url);setBusy(true);setDrafts([]);setDetection(null);setPlateOutline(null);setCalibrating(false);setError('');
    setOriginalScan(null);setEvaluating(false);photoFile.current=file;
    try{
      const image=new Image();image.src=url;await image.decode();if(Math.max(image.naturalWidth/image.naturalHeight,image.naturalHeight/image.naturalWidth)>4)throw Error('Choose a regular plate photo with the whole plate visible.');
      setImageSize({width:image.naturalWidth,height:image.naturalHeight});
      const result=await detectMixedMeal(image,message=>{if(token===generation.current&&alive.current)setStage(message);});
      const ids=[...new Set([...mixedFoodIds,...result.regions.flatMap(region=>region.predictions.flatMap(prediction=>foodIdsForLabel(prediction.label)))])];
      await prepareMixedFoods();const fetched=(await db.foodLibrary.bulkGet(ids)).filter((food):food is Food=>!!food);
      const groups:Draft[]=[];
      for(const region of result.regions){
        const bread=region.family==='flatbread'&&region.confidence>=.7?groups.find(group=>group.family==='flatbread'&&group.regions.every(item=>item.confidence>=.7)):undefined;
        if(bread){bread.regions.push(region);continue;}
        const foodId=suggestedFood(region);
        groups.push({id:region.id,family:region.family,regions:[region],foodId:fetched.some(food=>food.id===foodId)?foodId:'',choice:null,manual:false});
      }
      const reference:PlateReference=result.plate?{source:'detected',areaFraction:result.plate.area}:{source:'assumed',areaFraction:.65};
      let snapshot:MealEvaluation|null=null;
      try{snapshot=await snapshotEvaluation(groups,reference,diameter,savedScale,manifest);}catch{/* Evaluation must not prevent ordinary food logging. */}
      if(token===generation.current&&alive.current){setFoods(fetched);setDetection(result);setDrafts(groups);setActive(groups[0]?.id??'');setOriginalScan(snapshot);}
    }catch(e){if(token===generation.current&&alive.current)setError(e instanceof Error?e.message:'The plate could not be read. Try another photo.');}
    finally{if(token===generation.current&&alive.current){setBusy(false);setStage('');}}
  }
  const plateReference:PlateReference=plateOutline?{source:'manual',areaFraction:outlineArea(plateOutline)}:detection?.plate?{source:'detected',areaFraction:detection.plate.area}:{source:'assumed',areaFraction:.65};
  const plateArea=plateReference.areaFraction;
  const detectedBox=detection?.plate?.box;
  const displayedOutline=plateOutline??(detectedBox?{x:detectedBox[0],y:detectedBox[1],width:detectedBox[2],height:detectedBox[3]}:null);
  function choiceFor(draft:Draft):PortionChoice{return draft.choice??initialPortion(draft.family,draft.regions.map(region=>region.area),plateArea,diameter);}
  const reviewed=drafts.map(draft=>{
    const food=foods.find(food=>food.id===draft.foodId);if(!food)return {draft,food:null,estimate:null};
    try{const estimate=photoPortion(food,draft.family,choiceFor(draft),diameter,savedScale,plateReference);if(draft.manual)estimate.basis='Added manually. '+estimate.basis;else if(draft.choice)estimate.basis='User-adjusted portion. '+estimate.basis;return {draft,food,estimate};}catch{return {draft,food,estimate:null};}
  });
  const valid=reviewed.filter((row):row is typeof row&{food:Food;estimate:NonNullable<typeof row.estimate>}=>!!row.food&&!!row.estimate);
  const total=valid.reduce((sum,{food,estimate})=>({calories:sum.calories+food.calories/food.grams*estimate.grams,low:sum.low+food.calories/food.grams*estimate.lowGrams,high:sum.high+food.calories/food.grams*estimate.highGrams,protein:sum.protein+food.protein/food.grams*estimate.grams,carbs:sum.carbs+food.carbs/food.grams*estimate.grams,fat:sum.fat+food.fat/food.grams*estimate.grams}),{calories:0,low:0,high:0,protein:0,carbs:0,fat:0});
  function changeFood(id:string,foodId:string){setDrafts(rows=>rows.map(row=>{
    if(row.id!==id)return row;const family=foodId?familyForFood(foodId):row.family;
    const choice:PortionChoice|null=family===row.family?row.choice:row.manual||family==='other'?{unit:family==='flatbread'?'pieces':family==='rice'||family==='curry'?'cups':'serving',amount:1,size:'medium'}:null;
    return {...row,foodId,family,choice};
  }));}
  function changeChoice(id:string,patch:Partial<PortionChoice>){setDrafts(rows=>rows.map(row=>row.id===id?{...row,choice:{...choiceFor(row),...patch}}:row));}
  async function save(){
    if(saving||valid.length!==drafts.length||!valid.length)return;setSaving(true);setError('');
    try{await addPhotoMeal(valid.map(({food,estimate})=>({food,estimate})),date,meal);notify(`${valid.length} estimated food portions added to ${meal.toLowerCase()}`);onLogged();}
    catch(e){setError(e instanceof Error?e.message:'The meal could not be saved.');}finally{if(alive.current)setSaving(false);}
  }
  const locked=busy||setupBusy||checking;
  return <div className="mixed-meal-layout">
    <section className="card mixed-capture-card">
      <div className="card-title"><h2><ScanLine size={20}/> Scan a whole meal</h2><span className="subtle-chip">EXPERIMENTAL</span></div>
      <p className="mixed-intro">Find separate foods and suggest portions. Review counts, sizes and recipes before logging.</p>
      <div className={`scanner-readiness ${ready?'ready':''}`}>{checking?<><LoaderCircle size={16} className="spin"/>Checking mixed-meal models…</>:ready?<><Check size={16}/>Ready offline · food regions & portion estimates</>:<><Download size={16}/>Enable mixed-meal scanning · {manifest?(manifest.totalBytes/1024/1024).toFixed(1):'13.1'} MB additional</>}</div>
      {!ready&&!checking&&<div className="scanner-setup">{setupBusy&&<><progress className="mixed-download" aria-label="Mixed-meal model download" max={progress?.total??1} value={progress?.loaded??0}/><p>{progress?`${(progress.loaded/1024/1024).toFixed(1)} / ${(progress.total/1024/1024).toFixed(1)} MB`:'Preparing models…'}</p></>}<button className="primary-button full" disabled={setupBusy} onClick={()=>void setup()}>{setupBusy?<LoaderCircle className="spin" size={17}/>:<Download size={17}/>} {setupBusy?'Setting up…':'Enable mixed-meal scanner'}</button></div>}
      <div className={`meal-photo ${photo?'has-meal-photo':''}`}>
        {photo?<><img src={photo} alt="Your meal, processed on this device"/>{detection&&<MealPhotoOverlay imageSize={imageSize} groups={drafts} plate={displayedOutline} active={active} onSelect={setActive}/>}</>:<div className="mixed-photo-empty"><ScanLine size={48}/><h3>Chapati, curry, rice—one scan.</h3><p>Keep the whole plate visible. Separate foods where possible.</p></div>}
        {busy&&<div className="scan-loading"><LoaderCircle className="spin" size={28}/><span>{stage||'Starting the meal scanner…'}</span></div>}
      </div>
      {photo&&detection&&!busy&&<div className="plate-scale-status"><span>{plateReference.source==='manual'?'Plate outline fitted':plateReference.source==='detected'?'Plate outline suggested':'Plate area assumed'}</span><button className="text-button" disabled={saving} onClick={()=>setCalibrating(true)}>{plateReference.source==='assumed'?'Set plate outline':'Adjust plate outline'}</button>{plateOutline&&<button className="text-button" disabled={saving} onClick={()=>setPlateOutline(null)}>Reset outline</button>}<small>Changes update suggested portions. Your edited quantities stay as entered.</small></div>}
      <input ref={camera} hidden type="file" accept="image/*" capture="environment" onChange={event=>{const file=event.target.files?.[0];if(file)void analyze(file);event.target.value='';}}/>
      <input ref={gallery} hidden type="file" accept="image/*" onChange={event=>{const file=event.target.files?.[0];if(file)void analyze(file);event.target.value='';}}/>
      <div className="camera-actions"><button className="primary-button" disabled={!ready||!libraryReady||locked} onClick={()=>camera.current?.click()}><Camera size={18}/>Take meal photo</button><button className="secondary-button" disabled={!ready||!libraryReady||locked} onClick={()=>gallery.current?.click()}><ImagePlus size={18}/>Choose meal photo</button></div>
      <details className="plate-profile"><summary>Plate size · {diameter} cm {savedScale?'saved':'assumed'}</summary><p>A known plate diameter improves scale. Bowl depth, hidden pieces and recipe ingredients remain uncertain.</p><label>Plate diameter (cm)<input type="number" min={10} max={50} step={.5} value={diameter||''} onChange={event=>{setDiameter(Number(event.target.value));setSavedScale(false);}}/></label><button className="secondary-button" disabled={diameter<10||diameter>50} onClick={()=>void db.scanPreferences.put({id:'plate',plateDiameterCm:diameter}).then(()=>{setSavedScale(true);notify('Plate diameter saved for future scans');}).catch(()=>notify('Plate size could not be saved'))}>Remember known plate size</button><small>{plateReference.source==='manual'?'Using your fitted plate outline.':plateReference.source==='detected'?'Using a model-suggested plate outline.':'Plate area is assumed. Fit an outline to improve the photo scale.'}</small></details>
      <details className="mixed-limits"><summary>How these estimates work</summary><p>Food regions use a local segmentation model. Flatbread counts include visible regions only. Portion sizes use image area, plate size, standard serving weights and assumed food depth—not measured grams. Hidden stacks, bowls and sauces can produce large errors. The ranges are provisional, not validated confidence intervals.</p></details>
      {originalScan&&!busy&&<details className="mixed-limits"><summary>Help improve scanning</summary><p>Have measured portions? Save the original scan with actual foods, visible counts and cooked weights. Evaluation examples stay separate from your diary and are managed in Settings.</p><button className="secondary-button full" disabled={saving} onClick={()=>setEvaluating(true)}>Check a measured meal</button></details>}
    </section>
    <section className="mixed-review" aria-live="polite">
      <div className="mixed-review-heading"><div><h2>Review your meal</h2><p>{busy?'Finding foods…':detection?`${drafts.length} food group${drafts.length===1?'':'s'} · suggested portions`:'Your food estimates will appear here.'}</p></div></div>
      {error&&<div className="error-banner" role="alert">{error}</div>}
      {detection?.notices?.map(notice=><p className="detection-notice" key={notice}>{notice}</p>)}
      {!busy&&detection&&drafts.length===0&&<div className="card mixed-no-results"><p>No reliable food regions found. Add the missed foods below or try a clearer photo.</p></div>}
      {drafts.map((draft,index)=>{const choice=choiceFor(draft),row=reviewed[index];return <article className={`card meal-estimate-card ${active===draft.id?'active':''}`} key={draft.id}>
        <div className="card-title"><h3><span>{index+1}</span>{familyName[draft.family]}</h3><button className="icon-button" aria-label={`Remove food ${index+1}`} disabled={saving} onClick={()=>setDrafts(rows=>rows.filter(row=>row.id!==draft.id))}><Trash2 size={16}/></button></div>
        <label>Recipe<select value={draft.foodId} disabled={saving} onChange={event=>changeFood(draft.id,event.target.value)}><option value="">Choose the food / recipe</option>{foods.map(food=><option value={food.id} key={food.id}>{friendlyFood(food)}</option>)}</select></label>
        <button className="text-button mixed-food-search" disabled={saving} onClick={()=>setSearching(draft.id)}>Find a different food</button>
        <div className="form-row"><label>{choice.unit==='pieces'?'Visible pieces':choice.unit==='cups'?'Estimated cups':'Servings'}<input type="number" min={choice.unit==='pieces'?1:.25} max={20} step={choice.unit==='pieces'?1:.25} value={choice.amount||''} disabled={saving} onChange={event=>changeChoice(draft.id,{amount:Number(event.target.value)})}/></label>{choice.unit==='pieces'?<label>Piece size<select value={choice.size} disabled={saving} onChange={event=>changeChoice(draft.id,{size:event.target.value as BreadSize})}><option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option></select></label>:<div className="item-energy"><strong>{row?.food&&row.estimate?`~${number(row.food.calories/row.food.grams*row.estimate.grams)}`:'—'}</strong><span>estimated kcal</span></div>}</div>
        {draft.family==='flatbread'&&<small className="visible-count-note">Check overlapping or hidden pieces.</small>}
        {choice.unit==='serving'&&row?.estimate&&<small className="visible-count-note">Typical portion: {row.estimate.description}</small>}
        <details className="portion-details"><summary>Portion details & source</summary>{row?.food&&row.estimate?<><p>Estimated weight: {number(row.estimate.lowGrams)}–{number(row.estimate.highGrams)} g. {row.estimate.basis}</p><p>{row.food.source}</p></>:<p>Select a recipe and portion to calculate nutrition.</p>}</details>
      </article>;})}
      {photo&&!busy&&<button className="secondary-button full missed-food-button" disabled={saving||drafts.length>=10} onClick={()=>{const id=crypto.randomUUID();setDrafts(rows=>[...rows,{id,family:'other',foodId:'',regions:[],choice:{unit:'serving',amount:1,size:'medium'},manual:true}]);setActive(id);}}><Plus size={16}/>Add a missed food</button>}
      {drafts.length>0&&<div className="card mixed-total"><div><span>{valid.length<drafts.length?'Selected foods only':'Estimated meal total'}</span><strong>{valid.length?`~${number(total.calories)}`:'—'} <small>kcal</small></strong>{valid.length>0&&<p>Portion range: {number(total.low)}–{number(total.high)} kcal</p>}</div><div className="mixed-total-macros"><span>Protein <b>{decimal(total.protein)} g</b></span><span>Carbs <b>{decimal(total.carbs)} g</b></span><span>Fat <b>{decimal(total.fat)} g</b></span></div><label>Log meal to<select value={meal} disabled={saving} onChange={event=>setMeal(event.target.value as Meal)}>{meals.map(value=><option key={value}>{value}</option>)}</select></label>{valid.length!==drafts.length&&<p className="field-hint">Choose a recipe and valid portion for each food.</p>}<button className="primary-button full" disabled={saving||valid.length!==drafts.length||!valid.length} onClick={()=>void save()}>{saving?<LoaderCircle size={17} className="spin"/>:<Check size={17}/>}Confirm & log estimates</button></div>}
    </section>
    {evaluating&&originalScan&&<EvaluationEditor original={originalScan} photoFile={photoFile.current??undefined} onClose={()=>setEvaluating(false)} onSaved={entry=>{setOriginalScan(entry);setEvaluating(false);notify('Evaluation example saved locally');}}/>}
    {calibrating&&<PlateCalibration photo={photo} initial={displayedOutline??{x:.1,y:.1,width:.8,height:.8}} onClose={()=>setCalibrating(false)} onApply={outline=>{setPlateOutline(outline);setCalibrating(false);}}/>}
    {searching&&<MealFoodSearch onClose={()=>setSearching(null)} onChoose={food=>{setFoods(current=>current.some(item=>item.id===food.id)?current:[...current,food]);changeFood(searching,food.id);setSearching(null);}}/>}
  </div>;
}
