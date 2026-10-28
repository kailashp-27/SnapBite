export interface PlateOutline {x:number;y:number;width:number;height:number;}
export interface PlateReference {source:'manual'|'detected'|'assumed';areaFraction:number;}

export function validPlateReference(value:unknown):value is PlateReference {
  if(typeof value!=='object'||value===null)return false;
  const reference=value as Record<string,unknown>;
  return ['manual','detected','assumed'].includes(String(reference.source))&&typeof reference.areaFraction==='number'&&Number.isFinite(reference.areaFraction)&&reference.areaFraction>0&&reference.areaFraction<=1;
}

/** A projected ellipse is a scale reference, not a reconstruction of food volume. */
export function plateArea(outline:PlateOutline):number {
  const {x,y,width,height}=outline;
  if (![x,y,width,height].every(Number.isFinite)||x<0||y<0||width<.2||height<.2||x+width>1.000001||y+height>1.000001) {
    throw Error('Keep the whole plate outline inside the photo.');
  }
  return Math.PI*width*height/4;
}

export function fitPlateOutline(value:PlateOutline):PlateOutline {
  const width=Math.max(.2,Math.min(1,value.width));
  const height=Math.max(.2,Math.min(1,value.height));
  return {x:Math.max(0,Math.min(1-width,value.x)),y:Math.max(0,Math.min(1-height,value.y)),width,height};
}
