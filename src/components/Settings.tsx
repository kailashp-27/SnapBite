import {useEffect, useRef, useState, type FormEvent} from 'react';
import {ArrowDownToLine, Check, LoaderCircle, Plus, Settings2, ShieldCheck, Upload} from 'lucide-react';
import {db, saveGoals, validateFoods} from '../db';
import {restoreBackup, validateBackup} from '../backup';
import {dateKey, type Goals} from '../types';
import Modal from './Modal';
import EvaluationLibrary from './EvaluationLibrary';

export default function Settings({goals, count, notify}: {goals: Goals; count: number; notify: (text: string) => void}) {
  const [draft, setDraft] = useState(goals), [saving, setSaving] = useState(false), [importing, setImporting] = useState(false);
  const [persistent, setPersistent] = useState<boolean | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  const [restoreData, setRestoreData] = useState<ReturnType<typeof validateBackup> | null>(null);
  const [restoring, setRestoring] = useState(false);
  useEffect(() => {setDraft(goals);}, [goals]);
  useEffect(() => {navigator.storage?.persisted?.().then(setPersistent).catch(() => setPersistent(false));}, []);
  async function submit(e: FormEvent) {
    e.preventDefault(); setSaving(true);
    try {await saveGoals({...draft, name: draft.name.trim().slice(0, 40)}); notify('Your goals have been saved');} catch {notify('Goals could not be saved. Please try again.');} finally {setSaving(false);}
  }
  async function backup() {
    try {
      const data = await db.transaction('r', db.dailyLogs, db.days, db.preferences, db.foodLibrary, async () => ({version: 1, exportedAt: new Date().toISOString(), dailyLogs: await db.dailyLogs.toArray(), days: await db.days.toArray(), preferences: await db.preferences.toArray(), foodLibrary: await db.foodLibrary.toArray()}));
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
      const link = document.createElement('a'); link.href = url; link.download = `snapbite-backup-${dateKey()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('Backup exported');
    } catch {notify('Backup could not be exported.');}
  }
  async function importFoods(file: File) {
    if (file.size > 100 * 1024 * 1024) {notify('Choose a food library smaller than 100 MB.'); return;}
    setImporting(true);
    try {const foods = validateFoods(JSON.parse(await file.text())); await db.transaction('rw', db.foodLibrary, async () => {for (let i = 0; i < foods.length; i += 1000) await db.foodLibrary.bulkPut(foods.slice(i, i + 1000));}); notify(`${foods.length.toLocaleString()} foods imported`);} catch(e) {notify(e instanceof Error ? e.message : 'Import failed.');} finally {setImporting(false);}
  }
  async function prepareRestore(file: File) {
    if (file.size > 100 * 1024 * 1024) {notify('Choose a backup smaller than 100 MB.'); return;}
    try {setRestoreData(validateBackup(JSON.parse(await file.text())));} catch(e) {notify(e instanceof Error ? e.message : 'This backup could not be read.');}
  }
  async function confirmRestore() {
    if (!restoreData || restoring) return; setRestoring(true);
    try {await restoreBackup({version: 1, ...restoreData}); setRestoreData(null); notify('Your backup has been restored');} catch(e) {notify(e instanceof Error ? e.message : 'Restore failed. Your existing diary is unchanged.');} finally {setRestoring(false);}
  }
  return <div className="settings-layout"><form onSubmit={submit} className="card settings-card"><div className="card-title"><h2>Your daily goals</h2><Settings2 size={18}/></div><p>A starting point you can make your own.</p><label>Your name<input value={draft.name} maxLength={40} placeholder="What should we call you?" onChange={e => setDraft({...draft, name: e.target.value})}/></label><div className="form-row">{(['calories', 'protein', 'carbs', 'fat', 'water'] as const).map(key => <label key={key}>{key === 'water' ? 'Water (glasses)' : `${key[0].toUpperCase() + key.slice(1)} (${key === 'calories' ? 'kcal' : 'g'})`}<input type="number" required min="1" max={key === 'water' ? 40 : key === 'calories' ? 10000 : 1000} step="1" value={draft[key]} onChange={e => setDraft({...draft, [key]: e.target.value === '' ? '' : Number(e.target.value)} as Goals)}/></label>)}</div><p className="field-hint">Choose goals that fit your needs. These defaults are placeholders, not personalized nutrition advice.</p><button disabled={saving} className="primary-button"><Check size={17}/>{saving ? 'Saving…' : 'Save my goals'}</button></form><div className="settings-side"><div className="card settings-card"><h2><ShieldCheck size={20}/> Private by design</h2><p>Your diary lives in IndexedDB on this device. No account needed, no photos uploaded.</p><div className="storage-status"><span className="status-dot"/>{count.toLocaleString()} foods stored locally</div><p className="field-hint">{persistent ? 'Persistent storage is enabled. Clearing browser data still removes your diary.' : 'Your browser may reclaim storage. Request persistent storage and keep a backup.'}</p><button className="secondary-button full" disabled={persistent === true} onClick={async () => {try {const result = await navigator.storage?.persist?.(); setPersistent(!!result); notify(result ? 'Persistent storage enabled' : 'Your browser has not granted persistent storage. Keep a backup.');} catch {notify('Persistent storage is unavailable in this browser.');}}}>{persistent ? <Check size={17}/> : <ShieldCheck size={17}/>} {persistent ? 'Storage protected' : 'Request persistent storage'}</button><button className="secondary-button full" onClick={() => void backup()}><ArrowDownToLine size={17}/> Export full backup</button><input ref={restoreRef} type="file" accept=".json,application/json" hidden onChange={e => {const file = e.target.files?.[0]; if (file) void prepareRestore(file); e.target.value = "";}}/><button className="secondary-button full" onClick={() => restoreRef.current?.click()}><Upload size={17}/> Restore a backup</button></div><div className="card settings-card"><h2><Upload size={19}/> Grow your food library</h2><p>Import a normalized JSON food array. Existing food IDs are updated; your diary stays as logged.</p><p className="field-hint">Up to 100 MB per import. See README for the schema and data attribution requirements.</p><input type="file" accept=".json,application/json" ref={importRef} hidden onChange={e => {const file = e.target.files?.[0]; if (file) void importFoods(file); e.target.value = '';}}/><button className="secondary-button full" disabled={importing} onClick={() => importRef.current?.click()}>{importing ? <LoaderCircle className="spin" size={17}/> : <Plus size={17}/>} {importing ? 'Importing…' : 'Import food library'}</button></div><EvaluationLibrary notify={notify}/></div>{restoreData && <Modal title="Restore your diary" onClose={() => {if (!restoring) setRestoreData(null);}}><div className="help-content"><p>This backup contains <strong>{restoreData.dailyLogs.length} food entries</strong>, {restoreData.days.length} water records, and {restoreData.foodLibrary.length} foods.</p><p>Restoring replaces the diary, goals, and food library on this device. Export your current backup first if you want to keep it.</p><div className="restore-actions"><button className="secondary-button" disabled={restoring} onClick={() => setRestoreData(null)}>Keep my diary</button><button className="primary-button" disabled={restoring} onClick={() => void confirmRestore()}>{restoring ? "Restoring…" : "Replace with backup"}</button></div></div></Modal>}</div>;
}
