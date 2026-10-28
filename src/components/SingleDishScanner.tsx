import {useEffect, useRef, useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {ArrowRight, Camera, Check, CircleHelp, Download, ImagePlus, LoaderCircle, ScanLine, Search, ShieldCheck, X} from 'lucide-react';
import {classify, warmScanner, type Prediction, type ScanMode} from '../scanner';
import {confidentPrediction, formatScore} from '../scanner-math';
import {prepareScanner, scannerManifest, scannerReady, type DownloadProgress, type ScannerManifest} from '../scanner-assets';
import {db} from '../db';
import {displayLabel, foodIdsForLabel, matchingFoods, suggestedSearch} from '../food-matching';
import type {Food} from '../types';
import {nutritionBasis} from '../nutrition';

const modes: {id: ScanMode; label: string}[] = [{id:'auto', label:'All dishes'}, {id:'indian', label:'Indian dishes'}, {id:'global', label:'Global dishes'}];
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);
const duration = (ms: number) => ms < 100 ? '<0.1s' : `${(ms / 1000).toFixed(1)}s`;

export default function Scanner({onPick, notify}: {onPick: (query: string, food?: Food, candidates?: Food[]) => void; notify: (message: string) => void}) {
  const [manifest, setManifest] = useState<ScannerManifest | null>(null);
  const [ready, setReady] = useState(false), [checking, setChecking] = useState(true), [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [photo, setPhoto] = useState(''), [predictions, setPredictions] = useState<Prediction[]>([]);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [mode, setMode] = useState<ScanMode>('auto');
  const [inferenceMs, setInferenceMs] = useState(0);
  const camera = useRef<HTMLInputElement>(null), gallery = useRef<HTMLInputElement>(null);
  const generation = useRef(0), download = useRef<AbortController | null>(null);
  const predictionKey = predictions.map(prediction => prediction.label).join('|');
  const foods = useLiveQuery(async () => {
    const ids = [...new Set(predictionKey.split('|').flatMap(foodIdsForLabel))];
    return (await db.foodLibrary.bulkGet(ids)).filter((food): food is Food => !!food);
  }, [predictionKey]) ?? [];

  useEffect(() => {
    let alive = true;
    (async () => {
      try {const value = await scannerManifest(); const cached = await scannerReady(value); if (alive) {setManifest(value); setReady(cached);}}
      catch(error) {if (alive) setMessage(error instanceof Error ? error.message : 'Scanner setup could not be checked.');}
      finally {if (alive) setChecking(false);}
    })();
    return () => {alive = false; generation.current++; download.current?.abort();};
  }, []);
  useEffect(() => () => {if (photo) URL.revokeObjectURL(photo);}, [photo]);

  async function setup() {
    if (preparing) return;
    const token = ++generation.current;
    download.current = new AbortController(); setPreparing(true); setMessage('');
    try {
      const value = manifest ?? await scannerManifest(); setManifest(value);
      await prepareScanner(value, current => {if (generation.current === token) setProgress(current);}, download.current.signal);
      await warmScanner();
      if (generation.current === token) {setReady(true); notify('Your scanner is ready, including offline');}
    } catch(error) {if (generation.current === token) setMessage(error instanceof Error ? error.message : 'Setup was interrupted. Tap Retry to continue.');}
    finally {if (generation.current === token) setPreparing(false);}
  }
  async function analyze(url: string, selectedMode: ScanMode) {
    const token = ++generation.current; setBusy(true); setPredictions([]); setMessage('');
    try {
      const image = new Image(); image.src = url; await image.decode();
      const result = await classify(image, selectedMode);
      if (token === generation.current) {setPredictions(result.predictions); setInferenceMs(result.inferenceMs);}
    } catch(error) {if (token === generation.current) setMessage(error instanceof Error ? error.message : 'This photo could not be read. Try a JPG or PNG.');}
    finally {if (token === generation.current) setBusy(false);}
  }
  function selectPhoto(file: File) {
    if (!file.type.startsWith('image/') || file.size > 20 * 1024 * 1024) {notify('Choose an image smaller than 20 MB.'); return;}
    const url = URL.createObjectURL(file); setPhoto(url); void analyze(url, mode);
  }
  const locked = busy || preparing || checking;
  const confident = confidentPrediction(predictions);
  return <div className="scanner-layout">
    <section className="card scanner-card">
      <div className="card-title"><h2><ScanLine size={20}/> Snap your plate</h2><span className="subtle-chip"><ShieldCheck size={13}/> PRIVATE & ON DEVICE</span></div>
      <div className={`scanner-readiness ${ready ? 'ready' : ''}`}>
        {checking ? <><LoaderCircle className="spin" size={16}/><span>Checking your offline scanner…</span></> : ready ? <><span className="status-dot"/><span>Ready offline · 116 dish categories</span><Check size={15}/></> : <><Download size={17}/><div><strong>Enable your offline scanner</strong><p>One download{manifest ? ` · ${mb(manifest.totalBytes)} MB` : ''}. Your photos stay on this device.</p></div></>}
      </div>
      {!ready && !checking && <div className="scanner-setup">
        {preparing && <><div className="setup-progress" role="progressbar" aria-label="Scanner download" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress ? Math.min(100, Math.round(progress.loaded / progress.total * 100)) : 0}><span style={{width:`${progress ? Math.min(100, progress.loaded / progress.total * 100) : 0}%`}}/></div><p>{progress?.loaded === progress?.total && progress ? 'Starting the recognition engine…' : progress ? `${mb(progress.loaded)} / ${mb(progress.total)} MB` : 'Preparing download…'}</p></>}
        <button className="primary-button full" disabled={preparing} onClick={() => void setup()}>{preparing ? <LoaderCircle className="spin" size={17}/> : <Download size={17}/>} {preparing ? 'Setting up scanner…' : message ? 'Retry scanner setup' : 'Enable offline scanner'}</button>
      </div>}
      <div className="scan-mode-tabs" aria-label="Food recognition mode">{modes.map(value => <button key={value.id} aria-pressed={mode === value.id} disabled={locked} className={mode === value.id ? 'selected' : ''} onClick={() => {setMode(value.id); if (photo && ready) void analyze(photo, value.id);}}>{value.label}</button>)}</div>
      <div className={`camera-zone ${photo ? 'has-photo' : ''}`}>
        {photo ? <><img src={photo} alt="Your food photo, processed locally"/>{!busy && <button className="clear-photo" aria-label="Clear selected photo" onClick={() => {generation.current++; setPhoto(''); setPredictions([]); setMessage('');}}><X size={17}/></button>}</> : <><div className="camera-illustration"><ScanLine size={62}/><span>🥗</span></div><h3>What’s on your plate?</h3><p>Keep one dish in the center.<br/>Good lighting makes a difference.</p></>}
        {busy && <div className="scan-loading"><LoaderCircle className="spin" size={30}/><span>Looking at your plate, on your device…</span></div>}
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={event => {const file = event.target.files?.[0]; if (file) selectPhoto(file); event.target.value = '';}}/>
      <input ref={gallery} type="file" accept="image/*" hidden onChange={event => {const file = event.target.files?.[0]; if (file) selectPhoto(file); event.target.value = '';}}/>
      <div className="camera-actions"><button className="primary-button" disabled={!ready || locked} onClick={() => camera.current?.click()}><Camera size={18}/> Take a photo</button><button className="secondary-button" disabled={!ready || locked} onClick={() => gallery.current?.click()}><ImagePlus size={18}/> Choose photo</button></div>
      {message && <div className="notice scanner-notice" role="alert"><CircleHelp size={19}/><p>{message}</p></div>}
      {predictions.length > 0 && <section className="scan-results" aria-live="polite"><div className="scan-results-heading"><div><h3>{confident ? 'Does this look right?' : 'A few possibilities to check'}</h3></div><span className="inference-time">{duration(inferenceMs)} · on device</span></div><p>Choose the dish, then confirm its recipe and portion.</p>{predictions.map((prediction, index) => {
        const matches = matchingFoods(prediction.label, foods);
        const minimumCalories = matches.length ? Math.min(...matches.map(food => food.calories / food.grams * 100)) : null;
        const maximumCalories = matches.length ? Math.max(...matches.map(food => food.calories / food.grams * 100)) : null;
        return <button className={`prediction-card ${index === 0 ? 'top-prediction' : ''}`} key={prediction.label} onClick={() => onPick(suggestedSearch(prediction.label), matches.length === 1 ? matches[0] : undefined, matches)}><span className="prediction-emoji">{matches[0]?.emoji ?? '🍽️'}</span><span className="prediction-description"><strong>{displayLabel(prediction.label)}</strong><small>{matches.length === 1 ? `${matches[0].name} · confirm weight` : matches.length > 1 ? 'Choose recipe & confirm weight' : 'Add nutrition from a label or recipe'}</small>{minimumCalories !== null && maximumCalories !== null && <span className="scan-nutrition-preview">~{Math.round(minimumCalories)}{Math.round(maximumCalories) !== Math.round(minimumCalories) ? `–${Math.round(maximumCalories)}` : ''} kcal / 100 g · {matches.every(food => food.nutritionKind === 'usda') ? 'USDA' : nutritionBasis(matches[0])}</span>}</span><span className="prediction-score">{formatScore(prediction.confidence)}<small>model score</small></span><ArrowRight size={17}/></button>;
      })}<p className="field-hint">These are suggestions, not measurements. A photo cannot determine portion weight or exact calories.</p></section>}
      <button className="scanner-manual text-button" onClick={() => onPick('')}><Search size={16}/> Search or add a food manually</button>
    </section>
    <aside className="scanner-info"><div className="card"><h2>How to scan</h2><ol><li>Snap one dish in good light</li><li>Review the food suggestion</li><li>Set your portion & save</li></ol><div className="model-status"><ShieldCheck size={15}/><span>No photo uploads.<br/>Works offline after setup.</span></div></div><div className="card coverage-card"><h3>Indian dishes included</h3><p>Biryani, dosa, dal, paneer, naan, chole bhature, pav bhaji, and more.</p><details><summary>See supported regional dishes</summary><p>Biryani · Chole bhature · Dabeli · Dal · Dhokla · Dosa · Jalebi · Kathi roll · Kofta · Naan · Pakora · Paneer · Pani puri · Pav bhaji · Vada pav</p><p>Idli and parotta are not supported by this model yet. Search your library for those dishes.</p></details></div></aside>
  </div>;
}
