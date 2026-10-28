import {describe, expect, it} from 'vitest';
import {confidentPrediction, formatScore, normalizePixels, rankPredictions, softmax, type ScannerConfig} from './scanner-math';
import {matchingFoods, suggestedSearch} from './food-matching';
import {regionalFoods} from './regional-foods';

const config = {labels: ['pizza', 'samosa'], regionalLabels: ['dosa', 'biryani']} as ScannerConfig;
describe('recognition scores', () => {
  it('computes stable softmax for large logits', () => {
    const result = softmax([1000, 1000]); expect(result).toEqual([.5, .5]);
    expect(() => softmax([NaN, 1])).toThrow();
  });
  it('routes global food through the regional other-food score', () => {
    const result = rankPredictions([9, 0], [-5, -5, 9], config, 'auto');
    expect(result[0].label).toBe('pizza'); expect(result[0].confidence).toBeGreaterThan(.99);
  });
  it('keeps regional predictions and respects explicit cuisine selection', () => {
    expect(rankPredictions([9, 0], [9, -5, -5], config, 'auto')[0].label).toBe('dosa');
    expect(rankPredictions([9, 0], [9, -5, -5], config, 'global')[0].label).toBe('pizza');
    expect(rankPredictions([9, 0], [9, -5, -5], config, 'indian').every(result => result.cuisine === 'indian')).toBe(true);
  });
  it('applies calibrated routing without changing explicit cuisine rankings', () => {
    const calibrated = {...config, routing: {globalTemperature: .75, regionalTemperature: .9, otherBias: 4.1}};
    expect(rankPredictions([5, 0], [3, 0, 1], config, 'auto')[0].label).toBe('dosa');
    expect(rankPredictions([5, 0], [3, 0, 1], calibrated, 'auto')[0].label).toBe('pizza');
    expect(rankPredictions([5, 0], [3, 0, 1], calibrated, 'indian')[0].label).toBe('dosa');
    expect(() => rankPredictions([5, 0], [3, 0, 1], {...calibrated, routing: {...calibrated.routing, globalTemperature: 0}}, 'auto')).toThrow('Invalid scanner calibration');
  });
  it('rejects incompatible outputs and flags ambiguous suggestions', () => {
    expect(() => rankPredictions([1], [1,2,3], config, 'auto')).toThrow();
    expect(confidentPrediction([{label:'pizza',confidence:.51,cuisine:'global'},{label:'samosa',confidence:.48,cuisine:'global'}])).toBe(false);
    expect(formatScore(.9999)).toBe('99%+'); expect(formatScore(.0001)).toBe('<1%');
  });
});
describe('photo preparation and food matching', () => {
  it('normalizes RGB pixels into the model NCHW channel order', () => {
    const result = normalizePixels(new Uint8ClampedArray([255, 0, 128, 255]), {inputSize:1,mean:[.5,.5,.5],std:[.5,.5,.5]});
    expect(result[0]).toBe(1); expect(result[1]).toBe(-1); expect(result[2]).toBeCloseTo(128 / 255 * 2 - 1);
  });
  it('maps regional class names to foods without guessing nutritional values', () => {
    expect(matchingFoods('panipuri', regionalFoods)[0].id).toBe('pani-puri');
    expect(matchingFoods('ravioli', regionalFoods)).toEqual([]);
    expect(suggestedSearch('biryani')).toBe('biryani');
  });
});
