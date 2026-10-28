import {useState, type FormEvent} from 'react';
import {ArrowLeft, Check, LoaderCircle} from 'lucide-react';
import {db, validateFoods} from '../db';
import type {Food} from '../types';

export default function CustomFoodForm({initialName, onSave, onCancel}: {initialName: string; onSave: (food: Food) => void; onCancel: () => void}) {
  const [name, setName] = useState(initialName), [serving, setServing] = useState('1 serving');
  const [values, setValues] = useState({grams: '', calories: '', protein: '', carbs: '', fat: ''});
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return; setBusy(true); setError('');
    try {
      const food = validateFoods([{id: `custom:${crypto.randomUUID()}`, name: name.trim(), category: 'Custom', serving: serving.trim(), grams: Number(values.grams), calories: Number(values.calories), protein: Number(values.protein), carbs: Number(values.carbs), fat: Number(values.fat), emoji: '🍽️', source: 'Nutrition entered by you; per the serving shown.'}])[0];
      await db.foodLibrary.add(food); onSave(food);
    } catch(error) {setError(error instanceof Error ? error.message : 'The food could not be saved.');} finally {setBusy(false);}
  }
  return <form className="custom-food-form" onSubmit={submit}>
    <button type="button" className="text-button" onClick={onCancel}><ArrowLeft size={16}/> Back to foods</button>
    <p className="field-hint">Recognizing a dish doesn’t measure its nutrition. Add values from its label or recipe, then choose your portion.</p>
    <label>Food name<input value={name} maxLength={100} required onChange={event => setName(event.target.value)}/></label>
    <label>Serving description<input value={serving} maxLength={80} required onChange={event => setServing(event.target.value)}/></label>
    <div className="form-row">{(['grams', 'calories', 'protein', 'carbs', 'fat'] as const).map(key => <label key={key}>{key === 'grams' ? 'Serving weight (g)' : `${key[0].toUpperCase() + key.slice(1)} (${key === 'calories' ? 'kcal' : 'g'})`}<input type="number" min={key === 'grams' ? '.1' : '0'} max="100000" step=".1" required value={values[key]} onChange={event => setValues({...values, [key]: event.target.value})}/></label>)}</div>
    {error && <p className="over-text field-hint" role="alert">{error}</p>}
    <button className="primary-button full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17}/> : <Check size={17}/>} Save food & choose portion</button>
  </form>;
}
