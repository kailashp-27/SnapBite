export interface MaskRegion {
  id: string; box: [number, number, number, number]; area: number;
  quality: number; mask: Uint8Array;
}
export const MASK_SIZE = 96;
export const REGION_SELECTION_VERSION='mask-selection-v3';

/** Reject frame-shaped masks around a plate; this is not a general non-food detector. */
export function isBorderBackground(region:MaskRegion,size=MASK_SIZE):boolean {
  if(region.mask.length!==size*size)return false;
  let edge=0,edgeTotal=0,center=0,centerTotal=0;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const value=region.mask[y*size+x]>0?1:0;
    if(x===0||y===0||x===size-1||y===size-1){edge+=value;edgeTotal++;}
    if(x>=size*.3&&x<size*.7&&y>=size*.3&&y<size*.7){center+=value;centerTotal++;}
  }
  return edge/edgeTotal>.6&&center/Math.max(1,centerTotal)<.2;
}

/** Remove disconnected speckles only when one component holds >=95% of the mask. */
export function cleanMaskRegion<T extends MaskRegion>(region:T,size=MASK_SIZE):T {
  if(region.mask.length!==size*size)return region;
  const seen=new Uint8Array(region.mask.length),queue=new Int32Array(region.mask.length);
  let total=0;let largest:number[]=[];
  for(let start=0;start<region.mask.length;start++){
    if(!region.mask[start]||seen[start])continue;
    let front=0,end=1;queue[0]=start;seen[start]=1;const component:number[]=[];
    while(front<end){const index=queue[front++],x=index%size,y=Math.floor(index/size);component.push(index);
      for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
        const xx=x+dx,yy=y+dy,next=yy*size+xx;
        if(xx>=0&&xx<size&&yy>=0&&yy<size&&region.mask[next]&&!seen[next]){seen[next]=1;queue[end++]=next;}
      }
    }
    total+=component.length;if(component.length>largest.length)largest=component;
  }
  if(!total||largest.length===total||largest.length/total<.95)return region;
  const mask=new Uint8Array(region.mask.length);let left=size,top=size,right=0,bottom=0;
  for(const index of largest){mask[index]=1;const x=index%size,y=Math.floor(index/size);left=Math.min(left,x);top=Math.min(top,y);right=Math.max(right,x+1);bottom=Math.max(bottom,y+1);}
  return {...region,mask,area:largest.length/mask.length,box:[left/size,top/size,(right-left)/size,(bottom-top)/size]};
}
export function maskOverlap(a: MaskRegion, b: MaskRegion): {iou: number; contained: number} {
  let intersection=0, union=0, countA=0, countB=0;
  for(let i=0;i<a.mask.length;i++){const x=a.mask[i]>0,y=b.mask[i]>0; if(x)countA++;if(y)countB++;if(x&&y)intersection++;if(x||y)union++;}
  return {iou:union?intersection/union:0,contained:Math.min(countA,countB)?intersection/Math.min(countA,countB):0};
}
export function uniqueMasks(regions: MaskRegion[], limit=24): MaskRegion[] {
  const kept: MaskRegion[]=[];
  for(const region of [...regions].sort((a,b)=>b.quality-a.quality)) {
    if(!kept.some(other=>maskOverlap(region,other).iou>.72))kept.push(region);
    if(kept.length>=limit)break;
  }
  return kept.slice(0,limit);
}
export function plateReference(regions: MaskRegion[]): MaskRegion | null {
  return [...regions].filter(region=>{
    const [x,y,w,h]=region.box;
    const ellipseFill=region.area/Math.max(.001,w*h);
    return region.area>.25 && region.area<.93 && x>.005 && y>.005 && x+w<.995 && y+h<.995 && ellipseFill>.6&&isContainer(region,regions);
  }).sort((a,b)=>b.area-a.area)[0]??null;
}
export function isContainer(region: MaskRegion, regions: MaskRegion[]): boolean {
  const children=regions.filter(other=>other.id!==region.id && other.area<region.area*.8 && other.area>.015 && maskOverlap(region,other).contained>.9);
  if(!children.some((a,index)=>children.slice(index+1).some(b=>maskOverlap(a,b).iou<.15)))return false;
  // Two tiny ingredients do not make a whole dish a container. Prefer separate
  // objects only when their union explains most of the parent mask.
  let covered=0,parent=0;
  for(let i=0;i<region.mask.length;i++)if(region.mask[i]){parent++;if(children.some(child=>child.mask[i]))covered++;}
  return parent>0&&covered/parent>=.55;
}
