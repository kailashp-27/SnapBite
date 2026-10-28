import {useRef,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {Archive,Download,FlaskConical,RotateCcw,Upload} from 'lucide-react';
import {db} from '../db';
import {evaluationReport,type MealEvaluation} from '../meal-evaluation';
import {exportEvaluations,importEvaluations} from '../meal-evaluation-store';
import EvaluationEditor from './EvaluationEditor';

function download(value:unknown,name:string){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const percent=(n:number|null)=>n===null?'—':`${Math.round(n*100)}%`;
const metric=(n:number|null,unit:string)=>n===null?'—':`${n.toFixed(1)} ${unit}`;
export default function EvaluationLibrary({notify}:{notify:(message:string)=>void}){
  const entries=useLiveQuery(()=>db.mealEvaluations.orderBy('createdAt').reverse().toArray(),[])??[];
  const [editing,setEditing]=useState<MealEvaluation|null>(null),[busy,setBusy]=useState(false),[includePhotos,setIncludePhotos]=useState(true),[showArchived,setShowArchived]=useState(false);
  const importRef=useRef<HTMLInputElement>(null);
  const reports=evaluationReport(entries),active=entries.filter(entry=>entry.archivedAt===undefined);
  async function exportData(){setBusy(true);try{download(await exportEvaluations(includePhotos),'snapbite-meal-evaluation.json');notify('Evaluation dataset exported');}catch(e){notify(e instanceof Error?e.message:'Export failed.');}finally{setBusy(false);}}
  async function importData(file:File){
    if(file.size>100*1024*1024){notify('Choose an evaluation file smaller than 100 MB.');return;}
    setBusy(true);try{const count=await importEvaluations(JSON.parse(await file.text()));notify(`${count} new evaluation examples imported; existing examples kept`);}catch(e){notify(e instanceof Error?e.message:'Import failed.');}finally{setBusy(false);}
  }
  async function archive(entry:MealEvaluation){try{await db.mealEvaluations.update(entry.id,{archivedAt:entry.archivedAt===undefined?Date.now():undefined});}catch{notify('The evaluation could not be updated.');}}
  return <div className="card settings-card evaluation-library"><h2><FlaskConical size={19}/>Scanner evaluation</h2><p>Collect measured examples from the scanner’s “Help improve scanning” section. Original predictions are frozen before recipe, quantity or plate-outline edits.</p>
    <p className="field-hint">{active.length} active examples · {active.filter(entry=>entry.complete).length} checked complete. Examples and photos stay on this device. They are exported separately from your diary backup.</p>
    {!active.length&&<p className="evaluation-empty">No measured evaluation data yet. Accuracy scores will appear after you add and verify held-out examples.</p>}
    {reports.map(report=><section className="evaluation-report" key={report.modelVersion}><h3>{report.modelVersion}</h3><p>{report.completeCases} eligible held-out examples · {report.foods} actual food groups</p>{report.negativeImages>0&&<p className="field-hint">No-food checks: {report.falsePositiveImages}/{report.negativeImages} images had false detections.</p>}<div className="evaluation-metrics">
      <div><span>Food-group recall</span><strong>{percent(report.recall)}</strong><small>{report.matched}/{report.foods} matched</small></div>
      <div><span>Group precision</span><strong>{percent(report.precision)}</strong><small>{report.unmatchedPredictions} unmatched predictions</small></div>
      <div><span>Family accuracy</span><strong>{percent(report.familyAccuracy)}</strong><small>Matched groups only</small></div>
      <div><span>Visible-piece error</span><strong>{metric(report.count.mae,'pieces')}</strong><small>{report.count.samples}/{report.count.countedFoods} counted groups scored</small></div>
      <div><span>Portion error</span><strong>{metric(report.weight.mae,'g')}</strong><small>{report.weight.samples}/{report.weight.weighedFoods} weighed groups scored</small></div>
      <div><span>Portion bias</span><strong>{metric(report.weight.bias,'g')}</strong><small>Positive means overestimated</small></div>
    </div><p className="field-hint">Portion scores use the confirmed recipe and original suggested quantity, not edited servings. Misses, family mismatches, missing recipe references and serving fallbacks reduce coverage. Group matches are human-reviewed, not a mask-IoU benchmark.</p>
    {(report.excludedTraining>0||report.excludedLeakage>0||report.duplicatePhotos>0)&&<p className="field-hint">Excluded: {report.excludedTraining} training examples, {report.excludedLeakage} shared training-session/photo examples, {report.duplicatePhotos} repeated photos.</p>}</section>)}
    {entries.length>0&&<><label className="evaluation-check"><input type="checkbox" checked={includePhotos} onChange={event=>setIncludePhotos(event.target.checked)}/>Include saved photos in dataset export</label><button className="secondary-button full" disabled={busy} onClick={()=>void exportData()}><Download size={16}/>{busy?'Working…':'Export evaluation dataset'}</button><button className="secondary-button full" disabled={busy} onClick={()=>download({format:'snapbite-evaluation-report',version:1,reports},'snapbite-evaluation-report.json')}><Download size={16}/>Export scores</button></>}
    <input ref={importRef} hidden type="file" accept=".json,application/json" onChange={event=>{const file=event.target.files?.[0];if(file)void importData(file);event.target.value='';}}/>
    <button className="secondary-button full" disabled={busy} onClick={()=>importRef.current?.click()}><Upload size={16}/>Import evaluation dataset</button>
    {entries.length>0&&<><label className="evaluation-check"><input type="checkbox" checked={showArchived} onChange={event=>setShowArchived(event.target.checked)}/>Show archived examples</label><div className="evaluation-case-list">{entries.filter(entry=>showArchived||entry.archivedAt===undefined).map(entry=><div key={entry.id}><button className="evaluation-case-open" onClick={()=>setEditing(entry)}><strong>{entry.truth.map(item=>item.name).join(', ')||'No edible food'}</strong><small>{new Date(entry.createdAt).toLocaleDateString()} · {entry.archivedAt!==undefined?'Archived':entry.complete?'Checked':'Draft'} · {entry.split==='training'?'Training':'Held out'}</small></button><button className="icon-button" aria-label={`${entry.archivedAt===undefined?'Archive':'Restore'} example ${entry.truth[0]?.name??''}`} onClick={()=>void archive(entry)}>{entry.archivedAt===undefined?<Archive size={16}/>:<RotateCcw size={16}/>}</button></div>)}</div></>}
    {editing&&<EvaluationEditor original={editing} onClose={()=>setEditing(null)} onSaved={()=>{setEditing(null);notify('Evaluation updated');}}/>}
  </div>;
}
