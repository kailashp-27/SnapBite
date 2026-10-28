import {describe,expect,it} from 'vitest';
import {fitPlateOutline,plateArea,validPlateReference} from './plate-reference';

describe('plate scale geometry',()=>{
  it('uses the projected ellipse and rejects cropped or degenerate references',()=>{
    expect(plateArea({x:.1,y:.2,width:.8,height:.6})).toBeCloseTo(Math.PI*.8*.6/4);
    for(const outline of [{x:.5,y:0,width:.8,height:.8},{x:0,y:0,width:0,height:.8},{x:NaN,y:0,width:.8,height:.8}])expect(()=>plateArea(outline)).toThrow();
    const fitted=fitPlateOutline({x:.9,y:-.1,width:.8,height:1.2});
    expect(fitted).toEqual({x:1-.8,y:0,width:.8,height:1});
    expect(()=>plateArea(fitted)).not.toThrow();
  });
  it('validates persisted reference metadata',()=>{
    expect(validPlateReference({source:'manual',areaFraction:.5})).toBe(true);
    for(const value of [null,{source:'manual',areaFraction:NaN},{source:'measured',areaFraction:.5},{source:'detected',areaFraction:2}])expect(validPlateReference(value)).toBe(false);
  });
});
