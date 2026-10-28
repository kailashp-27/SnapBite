"""Train a small region-family head on disjoint original Indian plate images.

This is a crop classifier, not a validated mass regressor or chapati counter.
"""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
WORK = ROOT / '.ml-work/mixed'
sys.path.insert(0,str(ROOT / '.ml-work/python'))
import numpy as np
import onnxruntime as ort
from PIL import Image, ImageOps

config=json.loads((ROOT/'public/models/snapbite-v1/config.json').read_text())
metadata=json.loads((WORK/'data.json').read_text())
options=ort.SessionOptions(); options.intra_op_num_threads=2; options.inter_op_num_threads=1
engine=ort.InferenceSession(str(ROOT/'ml/models/snapbite-v1.onnx'),options,providers=['CPUExecutionProvider'])
assert hashlib.sha256((ROOT/'ml/models/snapbite-v1.onnx').read_bytes()).hexdigest()==config['modelSha256']
rng=np.random.default_rng(2026)
classes=['flatbread','curry','rice','other','background']
(WORK/'features').mkdir(exist_ok=True)

def prep(image):
    w,h=image.size; ratio=256/min(w,h)
    image=image.resize((int(w*ratio),int(h*ratio)),Image.Resampling.BILINEAR)
    w,h=image.size; image=image.crop(((w-224)//2,(h-224)//2,(w-224)//2+224,(h-224)//2+224))
    x=np.asarray(image,np.float32)/255
    return ((x-np.array(config['mean'],np.float32))/np.array(config['std'],np.float32)).transpose(2,0,1)[None]

def iou(a,b):
    area=max(0,min(a[2],b[2])-max(a[0],b[0]))*max(0,min(a[3],b[3])-max(a[1],b[1]))
    return area/max(1e-8,(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-area)

rows=[]; seen=set(); skipped=[]
for index,entry in enumerate(metadata['entries']):
    if entry['sha256'] in seen:
        skipped.append(entry['file']); continue
    seen.add(entry['sha256'])
    image=ImageOps.exif_transpose(Image.open(WORK/entry['file'])).convert('RGB')
    w,h=image.size; boxes=[]
    for line in (WORK/entry['label']).read_text().splitlines():
        label,cx,cy,bw,bh=map(float,line.split())
        if not(0<=label<16 and bw>0 and bh>0): continue
        box=[max(0,cx-bw/2),max(0,cy-bh/2),min(1,cx+bw/2),min(1,cy+bh/2)]
        family=0 if label==0 else 1 if label in [1,7] else 2 if label==2 else 3
        boxes.append((family,box))
    crops=list(boxes)
    # Actual background crops must contain almost no annotated food pixels.
    for _ in range(30):
        bw,bh=rng.uniform(.12,.35,2); x,y=rng.uniform(0,1-bw),rng.uniform(0,1-bh)
        box=[x,y,x+bw,y+bh]
        overlaps=[]
        for _,target in boxes:
            intersection=max(0,min(box[2],target[2])-max(box[0],target[0]))*max(0,min(box[3],target[3])-max(box[1],target[1]))
            overlaps.append(intersection/(bw*bh))
        if max(overlaps,default=0)<.02:
            crops.append((4,box))
        if sum(family==4 for family,_ in crops)>=4: break
    for ordinal,(family,box) in enumerate(crops):
        cache=WORK/'features'/f"{entry['sha256'][:16]}-{ordinal}.npz"
        if cache.exists(): values=np.load(cache); logits=values['logits']
        else:
            crop=image.crop((int(box[0]*w),int(box[1]*h),max(int(box[0]*w)+1,int(box[2]*w)),max(int(box[1]*h)+1,int(box[3]*h))))
            g,r=engine.run(None,{'input':prep(crop)})
            logits=np.concatenate([g[0],r[0]])
            np.savez_compressed(cache,logits=logits)
        rows.append({'file':entry['file'],'group':entry['group'],'split':entry['split'],'label':family,'box':box,'x':logits})
    if(index+1)%20==0: print(f'Extracted regions from {index+1} original plates',flush=True)

X=np.stack([r['x'] for r in rows]).astype(np.float32); y=np.array([r['label'] for r in rows])
fit=np.array([i for i,r in enumerate(rows) if r['split']=='train' and hashlib.sha256(r['group'].encode()).digest()[1]%5!=0])
val=np.array([i for i,r in enumerate(rows) if r['split']=='train' and hashlib.sha256(r['group'].encode()).digest()[1]%5==0])
test=np.array([i for i,r in enumerate(rows) if r['split']=='test'])
assert not({rows[i]['group'] for i in fit}&{rows[i]['group'] for i in test})
mean=X[fit].mean(0); scale=np.maximum(X[fit].std(0),.2); X=(X-mean)/scale

def softmax(x):
    e=np.exp(x-x.max(-1,keepdims=True)); return e/e.sum(-1,keepdims=True)
def balanced(logits,indices):
    p=np.argmax(logits,axis=1)
    return float(np.mean([np.mean(p[y[indices]==i]==i) for i in range(5) if np.any(y[indices]==i)]))

W=np.zeros((117,5),np.float32); b=np.zeros(5,np.float32)
groups=[fit[y[fit]==i] for i in range(5)]
assert all(len(g)>2 for g in groups), 'Insufficient group coverage'
best=(-1,None,None,0)
for epoch in range(200):
    for _ in range(20):
        batch=np.concatenate([rng.choice(g,16,replace=True) for g in groups])
        p=softmax(X[batch]@W+b); p[np.arange(len(batch)),y[batch]]-=1; p/=len(batch)
        W-=.025*(X[batch].T@p+.002*W); b-=.025*p.sum(0)
    score=balanced(X[val]@W+b,val)
    if score>best[0]: best=(score,W.copy(),b.copy(),epoch)
    if epoch-best[3]>25: break
W,b=best[1:3]
params={'version':'meal-region-v1','modelSha256':config['modelSha256'],'classes':classes,'mean':mean.tolist(),'scale':scale.tolist(),'weight':W.T.tolist(),'bias':b.tolist(),'minimumConfidence':.55}
(WORK/'rejected-region-head.json').write_text(json.dumps(params,separators=(',',':'))+'\n')
def metrics(indices):
    prediction=np.argmax(X[indices]@W+b,axis=1)
    return {'regions':len(indices),'accuracy':float(np.mean(prediction==y[indices])),'balancedAccuracy':balanced(X[indices]@W+b,indices),'confusion':[[int(np.sum((y[indices]==a)&(prediction==p))) for p in range(5)] for a in range(5)]}
report={'dataset':metadata['dataset'],'datasetRevision':metadata['datasetRevision'],'modelSha256':config['modelSha256'],'originalImages':len(seen),'duplicateImagesRemoved':len(skipped),'classes':classes,'validation':metrics(val),'test':metrics(test),'fitRegions':len(fit),'bestEpoch':best[3]+1,'limits':'Ground-truth box crop classification only. Not an end-to-end detector, count-accuracy test, or portion-weight validation. The source annotations group flatbreads and do not label individual chapati counts or food weights.'}
(ROOT/'ml/reports/rejected-mixed-region-head.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2),flush=True)
