import {useCallback,useEffect,useState} from 'react';
import {Check,Plus,Trash2} from 'lucide-react';
import Modal from './Modal';
import MealFoodSearch from './MealFoodSearch';
import {conditionEvaluation,validateEvaluation,type MealEvaluation,type EvaluationTruth} from '../meal-evaluation';
import {compressedEvaluationPhoto,saveEvaluation} from '../meal-evaluation-store';
import type {PortionFamily} from '../portion-estimates';

const familyLabels={flatbread:'Flatbread',curry:'Curry / dal',rice:'Rice',other:'Other food'};
interface Row extends Omit<EvaluationTruth,'family'> {family:PortionFamily|'';}
const blank=(predictionId:string|null=null):Row=>({id:crypto.randomUUID(),name:'',family:'',predictionId,grams:null,visibleCount:null,food:null});
export default function EvaluationEditor({original,photoFile,onClose,onSaved}:{original:MealEvaluation;photoFile?:File;onClose:()=>void;onSaved:(entry:MealEvaluation)=>void}){
  const [rows,setRows]=useState<Row[]>(()=>original.truth.length?original.truth:original.predictions.map(prediction=>blank(prediction.id)));
  const [notes,setNotes]=useState(original.notes),[complete,setComplete]=useState(original.complete),[includePhoto,setIncludePhoto]=useState(!!photoFile||!!original.photo);
  const [captureGroup,setCaptureGroup]=useState(original.captureGroup),[split,setSplit]=useState(original.split);
  const [photo,setPhoto]=useState(''),[searching,setSearching]=useState<string|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
  useEffect(()=>{const source=photoFile??original.photo;if(!source)return;const url=URL.createObjectURL(source);setPhoto(url);return()=>URL.revokeObjectURL(url);},[photoFile,original.photo]);
  const requestClose=useCallback(()=>{if(!busy)onClose();},[busy,onClose]);
  function update(id:string,patch:Partial<Row>){setComplete(false);setRows(current=>current.map(row=>row.id===id?{...row,...patch}:row));}
  async function save(){
    setBusy(true);setError('');
    try{
      const entry=validateEvaluation(conditionEvaluation({...original,truth:rows.map(row=>({...row,family:row.family as PortionFamily,name:row.name.trim()})),complete,notes,captureGroup:captureGroup.trim(),split},original));
      let storedPhoto=includePhoto?original.photo:undefined;
      if(includePhoto&&photoFile)storedPhoto=await compressedEvaluationPhoto(photoFile);
      const photoSha256=photoFile?[...new Uint8Array(await crypto.subtle.digest('SHA-256',await photoFile.arrayBuffer()))].map(n=>n.toString(16).padStart(2,'0')).join(''):original.photoSha256;
      const savedEntry={...entry,photo:storedPhoto,...(photoSha256?{photoSha256}:{})};
      await saveEvaluation(savedEntry);onSaved(savedEntry);
    }catch(e){setError(e instanceof Error?e.message:'The evaluation could not be saved.');}finally{setBusy(false);}
  }
  if(searching)return <MealFoodSearch onClose={()=>setSearching(null)} onChoose={food=>{update(searching,{name:food.name.slice(0,200),food});setSearching(null);}}/>;
  return <Modal title="Check a measured meal" wide onClose={requestClose}><div className="evaluation-body">
    <p className="field-hint">The original scan stays fixed. Label every actual food, including missed foods. Enter cooked edible weights only when measured on a kitchen scale; leave them blank for detection-only examples. This does not log a diary meal.</p>
    {photo&&<div className="evaluation-photo"><img src={photo} alt="Meal used for evaluation"/><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Original predicted food groups">{original.predictions.map((prediction,index)=><g key={prediction.id}><rect x={prediction.box[0]*100} y={prediction.box[1]*100} width={prediction.box[2]*100} height={prediction.box[3]*100} fill="none" stroke="#c3f66b" strokeWidth="1" vectorEffect="non-scaling-stroke"/><text x={prediction.box[0]*100+1} y={prediction.box[1]*100+5} fill="#111" stroke="#c3f66b" strokeWidth=".6" paintOrder="stroke" fontSize="5">{index+1}</text></g>)}</svg></div>}
    <div className="evaluation-original"><strong>Original predictions</strong>{original.predictions.length?original.predictions.map((prediction,index)=><p key={prediction.id}>{index+1}. {familyLabels[prediction.family]} · {prediction.portion.amount} {prediction.portion.unit} · {Math.round(prediction.confidence*100)}% family score</p>):<p>No food groups found.</p>}<small>Photo scale: {original.diameterCm} cm · {original.plateReference.source}. Review edits and fitted outlines are excluded from this baseline.</small></div>
    {rows.map((row,index)=><article className="evaluation-truth" key={row.id}><div className="card-title"><h3>Actual food {index+1}</h3><button className="icon-button" disabled={busy} aria-label={`Remove actual food ${index+1}`} onClick={()=>{setComplete(false);setRows(current=>current.filter(item=>item.id!==row.id));}}><Trash2 size={16}/></button></div>
      <label>Food name<input aria-label={`Actual food ${index+1} name`} maxLength={200} value={row.name} disabled={busy} onChange={event=>update(row.id,{name:event.target.value,food:null})}/></label>
      <div className="form-row"><label>Actual family<select aria-label={`Actual food ${index+1} family`} value={row.family} disabled={busy} onChange={event=>update(row.id,{family:event.target.value as PortionFamily,visibleCount:null})}><option value="">Choose actual family</option>{Object.entries(familyLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>Matching original group<select aria-label={`Actual food ${index+1} match`} value={row.predictionId??''} disabled={busy} onChange={event=>update(row.id,{predictionId:event.target.value||null})}><option value="">Missed by scanner</option>{original.predictions.map((prediction,predictionIndex)=><option key={prediction.id} value={prediction.id} disabled={rows.some(other=>other.id!==row.id&&other.predictionId===prediction.id)}>{predictionIndex+1}. {familyLabels[prediction.family]}</option>)}</select></label></div>
      <div className="form-row"><label>Weighed weight (g, optional)<input aria-label={`Actual food ${index+1} grams`} type="number" min={.1} max={10000} step={.1} value={row.grams??''} disabled={busy} onChange={event=>update(row.id,{grams:event.target.value===''?null:Number(event.target.value)})}/></label>{row.family==='flatbread'&&<label>Actual visible pieces<input aria-label={`Actual food ${index+1} count`} type="number" min={1} max={100} step={1} value={row.visibleCount??''} disabled={busy} onChange={event=>update(row.id,{visibleCount:event.target.value===''?null:Number(event.target.value)})}/></label>}</div>
      <button className="text-button" disabled={busy} onClick={()=>setSearching(row.id)}>{row.food?'Change recipe reference':'Choose recipe reference for portion scoring'}</button>{row.food&&<p className="field-hint">Reference: {row.food.name}</p>}
    </article>)}
    <button className="secondary-button full" disabled={busy||rows.length>=30} onClick={()=>{setComplete(false);setRows(current=>[...current,blank()]);}}><Plus size={16}/>Add an actual or missed food</button>
    <p className="field-hint">Remove rows that are not actual foods. Once checked complete, any unmatched original groups count as false detections. Match each original group to at most one food.</p>
    <div className="form-row"><label>Capture session<input maxLength={100} value={captureGroup} disabled={busy} onChange={event=>setCaptureGroup(event.target.value)}/></label><label>Dataset use<select value={split} disabled={busy} onChange={event=>setSplit(event.target.value as typeof split)}><option value="holdout">Held-out evaluation</option><option value="training">Future training</option></select></label></div>
    <p className="field-hint">Use the same capture session for photos of the same meal. Sessions or exact photos also marked for training are excluded from held-out scores.</p>
    <label>Notes<textarea maxLength={2000} rows={2} value={notes} disabled={busy} onChange={event=>setNotes(event.target.value)}/></label>
    <label className="evaluation-check"><input type="checkbox" checked={includePhoto} disabled={busy||(!photoFile&&!original.photo)} onChange={event=>setIncludePhoto(event.target.checked)}/>Include a compressed photo, stored only on this device</label>
    <label className="evaluation-check"><input type="checkbox" checked={complete} disabled={busy} onChange={event=>setComplete(event.target.checked)}/>{rows.length?'I checked every actual food and all entered measurements':'I checked that this photo contains no edible food'}</label>
    {!complete&&<p className="field-hint">You can save an incomplete draft. Drafts do not contribute to scores.</p>}
    {error&&<p className="error-banner" role="alert">{error}</p>}
    <button className="primary-button full" disabled={busy||(!rows.length&&!complete)} onClick={()=>void save()}><Check size={17}/>{busy?'Saving evaluation…':'Save evaluation example'}</button>
  </div></Modal>;
}
