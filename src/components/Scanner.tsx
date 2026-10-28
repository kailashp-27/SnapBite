import {useState} from 'react';
import type {Food} from '../types';
import SingleDishScanner from './SingleDishScanner';
import MixedMealScanner from './MixedMealScanner';

export default function Scanner({date,libraryReady,onPick,notify,onLogged}:{date:string;libraryReady:boolean;onPick:(query:string,food?:Food,candidates?:Food[])=>void;notify:(message:string)=>void;onLogged:()=>void}){
  const [mode,setMode]=useState<'mixed'|'single'>('mixed');
  return <><div className="scan-workflow-tabs" aria-label="Scan workflow"><button aria-pressed={mode==='mixed'} onClick={()=>setMode('mixed')}>Mixed meal <span>PREVIEW</span></button><button aria-pressed={mode==='single'} onClick={()=>setMode('single')}>Single dish</button></div>{mode==='mixed'?<MixedMealScanner date={date} libraryReady={libraryReady} notify={notify} onLogged={onLogged}/>:<SingleDishScanner onPick={onPick} notify={notify}/>}</>;
}
