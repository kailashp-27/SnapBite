import {useDeferredValue,useState} from 'react';
import {useLiveQuery} from 'dexie-react-hooks';
import {Search} from 'lucide-react';
import Modal from './Modal';
import {db} from '../db';
import type {Food} from '../types';
import {number} from '../format';
export default function MealFoodSearch({onChoose,onClose}:{onChoose:(food:Food)=>void;onClose:()=>void}){
  const [query,setQuery]=useState('');const search=useDeferredValue(query.trim().toLowerCase());
  const results=useLiveQuery<Food[]>(async()=>search?await db.foodLibrary.filter(food=>`${food.name} ${food.aliases?.join(' ')??''}`.toLowerCase().includes(search)).limit(25).toArray():[],[search])??[];
  return <Modal title="Choose a meal food" onClose={onClose}><div className="search-box"><Search size={18}/><input autoFocus aria-label="Search meal foods" placeholder="Search chapati, paneer, curd…" value={query} onChange={event=>setQuery(event.target.value)}/></div><div className="search-results">{results.map(food=><button className="food-result" key={food.id} onClick={()=>onChoose(food)}><span className="result-emoji">{food.emoji}</span><span><strong>{food.name}</strong><small>{food.serving} · {food.grams} g</small></span><span className="result-calories">{number(food.calories/food.grams*100)}<small>kcal / 100 g</small></span></button>)}{search&&!results.length&&<p className="field-hint">No matching foods. Try a shorter name or add a custom food from the diary.</p>}{!search&&<p className="field-hint">Search your full offline nutrition library to correct a food suggestion.</p>}</div></Modal>;
}
