import type {MealRegion} from '../mixed-scan';
import type {PlateOutline} from '../plate-reference';

interface Props {
  imageSize:{width:number;height:number};
  groups:{id:string;regions:MealRegion[]}[];
  plate:PlateOutline|null;
  active:string;
  onSelect:(id:string)=>void;
}

export default function MealPhotoOverlay({imageSize:{width,height},groups,plate,active,onSelect}:Props){
  const stroke=Math.max(width,height)*.003;
  return <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="xMidYMid meet" className="meal-regions-overlay" aria-label="Detected food regions">
    {plate&&<ellipse aria-label="Plate scale outline" cx={(plate.x+plate.width/2)*width} cy={(plate.y+plate.height/2)*height} rx={plate.width*width/2} ry={plate.height*height/2} fill="none" stroke="#a9c7ed" strokeWidth={stroke} strokeDasharray={`${stroke*4} ${stroke*3}`} pointerEvents="none"/>}
    {groups.map((group,index)=>group.regions.map(region=>{
      const [x,y,w,h]=region.box;
      return <g key={region.id} role="button" tabIndex={0} aria-label={`Review food ${index+1}`} onClick={()=>onSelect(group.id)} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(group.id);}}}>
        <rect x={x*width} y={y*height} width={w*width} height={h*height} fill="none" stroke={group.id===active?'#c3f66b':'#e6ba89'} strokeWidth={stroke}/>
        <text x={(x+.012)*width} y={(y+.05)*height} fill="#101510" stroke="#c3f66b" paintOrder="stroke" strokeWidth={stroke*2} fontSize={Math.max(width,height)*.04}>{index+1}</text>
      </g>;
    }))}
  </svg>;
}
