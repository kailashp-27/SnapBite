// @vitest-environment jsdom
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import EvaluationEditor from './EvaluationEditor';
import {syntheticEvaluation} from '../evaluation-fixture';
const mocks=vi.hoisted(()=>({save:vi.fn()}));
vi.mock('../meal-evaluation-store',()=>({saveEvaluation:(...args:unknown[])=>mocks.save(...args),compressedEvaluationPhoto:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe('measured-meal annotation',()=>{
  it('records actual weights/counts without replacing the original predictions',async()=>{
    const original={...syntheticEvaluation(),truth:[],complete:false};
    const saved=vi.fn();render(<EvaluationEditor original={original} onClose={()=>{}} onSaved={saved}/>);
    fireEvent.click(screen.getByRole('button',{name:'Remove actual food 3'}));
    for(const [index,name,family] of [[1,'Measured bread','flatbread'],[2,'Measured curry','curry']] as const){
      fireEvent.change(screen.getByLabelText(`Actual food ${index} name`),{target:{value:name}});
      fireEvent.change(screen.getByLabelText(`Actual food ${index} family`),{target:{value:family}});
    }
    fireEvent.change(screen.getByLabelText('Actual food 1 grams'),{target:{value:'100'}});
    fireEvent.change(screen.getByLabelText('Actual food 1 count'),{target:{value:'3'}});
    fireEvent.change(screen.getByLabelText('Actual food 2 grams'),{target:{value:'150'}});
    fireEvent.click(screen.getByLabelText('I checked every actual food and all entered measurements'));
    fireEvent.click(screen.getByRole('button',{name:'Save evaluation example'}));
    await waitFor(()=>expect(mocks.save).toHaveBeenCalledTimes(1));
    const entry=mocks.save.mock.calls[0][0];
    expect(entry.truth[0].visibleCount).toBe(3);expect(entry.truth[0].grams).toBe(100);
    expect(entry.predictions[0].portion.amount).toBe(2);expect(entry.predictions).toHaveLength(3);
    expect(entry.complete).toBe(true);expect(entry.photo).toBeUndefined();expect(saved).toHaveBeenCalled();
  });
  it('requires an explicit actual family and valid name before saving',async()=>{
    render(<EvaluationEditor original={{...syntheticEvaluation(),truth:[],complete:false}} onClose={()=>{}} onSaved={()=>{}}/>);
    fireEvent.click(screen.getByRole('button',{name:'Save evaluation example'}));
    await screen.findByRole('alert');expect(mocks.save).not.toHaveBeenCalled();
  });
});
