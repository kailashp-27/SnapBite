import {describe,expect,it} from 'vitest';
import {cleanMaskRegion,isBorderBackground,isContainer,maskOverlap,plateReference,uniqueMasks,type MaskRegion} from './meal-regions';
const region=(id:string,mask:number[],quality=.9):MaskRegion=>({id,mask:new Uint8Array(mask),quality,box:[0,0,1,1],area:mask.filter(Boolean).length/mask.length});
describe('food mask selection',()=>{
  it('rejects a surrounding background frame while retaining a solid central object',()=>{
    const frame=region('frame',Array.from({length:64},(_,i)=>i%8===0||i%8===7||i<8||i>=56?1:0));
    const center=region('food',Array.from({length:64},(_,i)=>i%8>0&&i%8<7&&i>=8&&i<56?1:0));
    expect(isBorderBackground(frame,8)).toBe(true);expect(isBorderBackground(center,8)).toBe(false);
  });
  it('trims small disconnected speckles but retains ambiguous multi-component masks',()=>{
    const mask=Array.from({length:100},(_,i)=>i%10>=1&&i%10<=7&&i>=10&&i<80?1:0);mask[99]=1;
    const cleaned=cleanMaskRegion(region('speckled',mask),10);
    expect(cleaned.mask[99]).toBe(0);expect(cleaned.box).toEqual([.1,.1,.7,.7]);
    const split=region('split',[1,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1]);
    expect(cleanMaskRegion(split,4)).toBe(split);
  });
  it('keeps a large dish with tiny ingredient fragments, and prefers well-covered separate children',()=>{
    const parent=region('parent',Array(20).fill(1));
    const a=region('a',[1,1,...Array(18).fill(0)]),b=region('b',[0,0,1,1,...Array(16).fill(0)]);
    expect(isContainer(parent,[parent,a,b])).toBe(false);
    const left=region('left',[...Array(8).fill(1),...Array(12).fill(0)]),right=region('right',[...Array(8).fill(0),...Array(8).fill(1),...Array(4).fill(0)]);
    expect(isContainer(parent,[parent,left,right])).toBe(true);
  });
  it('does not remove an isolated oval food as if it were a plate',()=>{
    const oval={...region('oval',[1,1,1,0]),box:[.1,.1,.8,.8] as [number,number,number,number]};
    expect(plateReference([oval])).toBeNull();
  });
  it('removes repeated prompts for the same object without merging distinct objects',()=>{
    const a=region('a',[1,1,0,0]);const duplicate=region('duplicate',[1,1,0,0],.8);const b=region('b',[0,0,1,1]);
    expect(maskOverlap(a,b).iou).toBe(0);expect(uniqueMasks([a,duplicate,b]).map(r=>r.id)).toEqual(['a','b']);
  });
  it('handles empty masks without inventing overlap',()=>{
    expect(maskOverlap(region('a',[0,0]),region('b',[0,0]))).toEqual({iou:0,contained:0});
  });
});
