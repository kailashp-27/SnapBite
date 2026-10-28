import {describe,expect,it} from 'vitest';
import {conditionEvaluation,evaluationReport,validateEvaluation,validateEvaluationExport} from './meal-evaluation';
import {syntheticEvaluation} from './evaluation-fixture';

describe('held-out meal evaluation',()=>{
  it('freezes reference-conditioned grams and preserves them when measured weights are corrected',()=>{
    const original=syntheticEvaluation(),updated=structuredClone(original);
    updated.truth[0].grams=105;
    const result=conditionEvaluation(updated,original);
    expect(result.truth[0].referenceEstimate?.grams).toBe(80);
    const report=evaluationReport([result])[0];expect(report.weight.mae).toBe(37.5);
    const changedRecipe=structuredClone(original);changedRecipe.truth[0].food!.portionOptions![0].grams=50;
    expect(conditionEvaluation(changedRecipe,original).truth[0].referenceEstimate?.grams).toBe(100);
  });
  it('accepts checked no-food images and counts their false detections',()=>{
    const negative=validateEvaluation({...syntheticEvaluation(),truth:[]});
    const [report]=evaluationReport([negative]);
    expect(report.negativeImages).toBe(1);expect(report.falsePositiveImages).toBe(1);
    expect(report.precision).toBe(0);expect(report.recall).toBeNull();expect(report.weight.mae).toBeNull();
  });
  it('scores errors against frozen quantities and exposes missing coverage',()=>{
    const [report]=evaluationReport([validateEvaluation(syntheticEvaluation())]);
    expect(report.missedFoods).toBe(1);expect(report.unmatchedPredictions).toBe(1);
    expect(report.precision).toBeCloseTo(2/3);expect(report.recall).toBeCloseTo(2/3);
    expect(report.weight.mae).toBe(35);expect(report.weight.bias).toBe(15);expect(report.weight.coverage).toBeCloseTo(2/3);
    expect(report.count.mae).toBe(1);expect(report.count.bias).toBe(-1);
  });
  it('does not turn empty, incomplete, archived or training data into accuracy',()=>{
    expect(evaluationReport([])).toEqual([]);
    for(const patch of [{complete:false},{split:'training' as const}]){
      const [report]=evaluationReport([{...syntheticEvaluation(),...patch}]);
      expect(report.completeCases).toBe(0);expect(report.weight.mae).toBeNull();expect(report.recall).toBeNull();
    }
    expect(evaluationReport([{...syntheticEvaluation(),archivedAt:1}])).toEqual([]);
  });
  it('excludes leaked sessions, identical training photos, and duplicate evaluation photos',()=>{
    const base=syntheticEvaluation(),hash='a'.repeat(64),holdoutHash='b'.repeat(64);
    const [report]=evaluationReport([
      {...base,id:'train',split:'training',photoSha256:hash,archivedAt:1},
      {...base,id:'session-leak'},
      {...base,id:'photo-leak',captureGroup:'other-session',photoSha256:hash},
      {...base,id:'clean',captureGroup:'heldout-session',photoSha256:holdoutHash},
      {...base,id:'duplicate',captureGroup:'another-name',photoSha256:holdoutHash},
    ]);
    expect(report.completeCases).toBe(1);expect(report.excludedLeakage).toBe(2);expect(report.duplicatePhotos).toBe(1);
  });
  it('keeps model versions separate and excludes serving fallbacks and wrong families from gram scores',()=>{
    const base=syntheticEvaluation();
    base.predictions[0].family='other';base.predictions[0].portion.unit='serving';
    const reports=evaluationReport([base,{...syntheticEvaluation(),id:'other',modelVersion:'other-model'}]);
    expect(reports).toHaveLength(2);expect(reports[0].weight.samples).toBe(1);expect(reports[0].weight.coverage).toBeCloseTo(1/3);
  });
  it('rejects duplicate matches, malformed weights, food references and photo payloads before import',()=>{
    const base=syntheticEvaluation();
    expect(()=>validateEvaluation({...base,truth:[base.truth[0],{...base.truth[1],predictionId:'bread'}]})).toThrow();
    expect(()=>validateEvaluation({...base,truth:[{...base.truth[0],grams:NaN}]})).toThrow();
    expect(()=>validateEvaluation({...base,truth:[{...base.truth[0],food:{...base.truth[0].food,grams:0}}]})).toThrow();
    expect(()=>validateEvaluationExport({format:'snapbite-meal-evaluation',version:1,cases:[{...base,photoDataUrl:'https://example.com/photo.jpg'}]})).toThrow();
    expect(()=>validateEvaluationExport({format:'snapbite-meal-evaluation',version:1,cases:[base,base]})).toThrow();
  });
});
