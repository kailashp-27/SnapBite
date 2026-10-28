import {useState} from 'react';
import {Check} from 'lucide-react';
import Modal from './Modal';
import {fitPlateOutline,type PlateOutline} from '../plate-reference';

interface Props {
  photo:string;
  initial:PlateOutline;
  onApply:(outline:PlateOutline)=>void;
  onClose:()=>void;
}

export default function PlateCalibration({photo,initial,onApply,onClose}:Props){
  const [outline,setOutline]=useState(()=>fitPlateOutline(initial));
  function resize(axis:'width'|'height',value:number){
    setOutline(previous=>fitPlateOutline({...previous,[axis]:value,
      [axis==='width'?'x':'y']:previous[axis==='width'?'x':'y']+(previous[axis]-value)/2}));
  }
  const controls=[
    {label:'Plate width',value:outline.width,min:.2,max:1,change:(value:number)=>resize('width',value)},
    {label:'Plate height',value:outline.height,min:.2,max:1,change:(value:number)=>resize('height',value)},
    {label:'Plate horizontal position',value:outline.x,min:0,max:1-outline.width,change:(value:number)=>setOutline(previous=>({...previous,x:value}))},
    {label:'Plate vertical position',value:outline.y,min:0,max:1-outline.height,change:(value:number)=>setOutline(previous=>({...previous,y:value}))},
  ];
  return <Modal title="Fit the plate outline" onClose={onClose}>
    <div className="plate-calibration-body">
    <p className="field-hint">Adjust the oval to the outer rim of one round plate. Include its full rim. Bowls and cropped plates need portion review.</p>
    <div className="plate-calibration-photo">
      <img src={photo} alt="Meal with adjustable plate outline"/>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Plate outline preview">
        <ellipse cx={(outline.x+outline.width/2)*100} cy={(outline.y+outline.height/2)*100} rx={outline.width*50} ry={outline.height*50} fill="#c3f66b18" stroke="#c3f66b" strokeWidth="2" vectorEffect="non-scaling-stroke"/>
      </svg>
    </div>
    <div className="plate-calibration-controls">{controls.map(control=><label key={control.label}><span>{control.label}<span className="plate-control-value" aria-hidden="true">{Math.round(control.value*100)}%</span></span><input aria-label={control.label} aria-valuetext={`${Math.round(control.value*100)} percent`} type="range" min={control.min} max={control.max} step={.005} value={control.value} disabled={control.max===0} onChange={event=>control.change(Number(event.target.value))}/></label>)}</div>
    <p className="field-hint">This sets the plate area in this photo. Use your plate’s known diameter for physical scale. Food depth is still estimated.</p>
    <button className="primary-button full" onClick={()=>onApply(outline)}><Check size={17}/>Use this outline</button>
    </div>
  </Modal>;
}
