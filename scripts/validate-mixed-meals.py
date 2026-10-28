"""Native-runtime integration audit mirroring the web prototype.

Outputs are visual diagnostics, not portion/count ground-truth metrics.
"""
from pathlib import Path
import json,sys,time
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'.ml-work/mixed'
sys.path.insert(0,str(ROOT/'.ml-work/python'))
import numpy as np
import onnxruntime as ort
from PIL import Image,ImageOps,ImageDraw

options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
def session(name):return ort.InferenceSession(str(ROOT/'ml/models'/name),options,providers=['CPUExecutionProvider'])
encoder=session('vision_encoder_quantized.onnx');decoder=session('prompt_encoder_mask_decoder_quantized.onnx');classifier=session('snapbite-v1.onnx')
head=json.loads((ROOT/'src/meal-region-head.json').read_text());meta=json.loads((WORK/'data.json').read_text());entries=[entry for entry in meta['entries'] if entry['split']=='test']
config=json.loads((ROOT/'public/models/snapbite-v1/config.json').read_text())
def softmax(x):
    x=np.exp(x-x.max());return x/x.sum()
def overlap(a,b):
    intersection=np.logical_and(a['mask'],b['mask']).sum();union=np.logical_or(a['mask'],b['mask']).sum()
    return (intersection/max(1,union),intersection/max(1,min(a['mask'].sum(),b['mask'].sum())))
def prep(image):
    w,h=image.size;factor=256/min(w,h);image=image.resize((int(w*factor),int(h*factor)),Image.Resampling.BILINEAR);w,h=image.size
    pixels=np.asarray(image.crop(((w-224)//2,(h-224)//2,(w-224)//2+224,(h-224)//2+224)),np.float32)/255
    return ((pixels-np.array(config['mean'],np.float32))/np.array(config['std'],np.float32)).transpose(2,0,1)[None]
reports=[]
for ordinal in [0,4,5,7,10]:
    entry=entries[ordinal];image=ImageOps.exif_transpose(Image.open(WORK/entry['file'])).convert('RGB');w,h=image.size;start=time.perf_counter()
    rw,rh=round(w*1024/max(w,h)),round(h*1024/max(w,h));pixels=np.asarray(image.resize((rw,rh),Image.Resampling.BILINEAR),np.float32)/255
    normalized=(pixels-np.array(config['mean'],np.float32))/np.array(config['std'],np.float32)
    tensor=np.zeros((1,3,1024,1024),np.float32);tensor[0,:,:rh,:rw]=normalized.transpose(2,0,1)
    embedding=encoder.run(None,{'pixel_values':tensor});points=np.array([[(x+.5)*rw/5,(y+.5)*rh/5] for y in range(5) for x in range(5)],np.float32).reshape(1,25,1,2)
    scores,logits=decoder.run(None,{'input_points':points,'input_labels':np.ones((1,25,1),np.int64),'image_embeddings':embedding[0],'image_positional_embeddings':embedding[1]})
    candidates=[]
    for index in range(75):
        score=float(scores.reshape(-1)[index])
        if score<.8:continue
        xs=np.minimum(255,np.floor((np.arange(96)+.5)/96*rw/4).astype(int));ys=np.minimum(255,np.floor((np.arange(96)+.5)/96*rh/4).astype(int));values=logits.reshape(75,256,256)[index][np.ix_(ys,xs)]
        mask=values>0;area=float(mask.mean());possible=(values>-1).sum()
        if area<.008 or area>.93 or not possible or (values>1).sum()/possible<.82:continue
        y,x=np.where(mask);box=[x.min()/96,y.min()/96,(x.max()+1-x.min())/96,(y.max()+1-y.min())/96]
        candidates.append({'id':str(index),'mask':mask,'area':area,'box':box,'quality':score})
    regions=[]
    for region in sorted(candidates,key=lambda r:-r['quality']):
        if not any(overlap(region,other)[0]>.72 for other in regions):regions.append(region)
    regions=regions[:24]
    plates=[r for r in regions if .25<r['area']<.93 and r['box'][0]>.005 and r['box'][1]>.005 and r['box'][0]+r['box'][2]<.995 and r['box'][1]+r['box'][3]<.995 and r['area']/(r['box'][2]*r['box'][3])>.6]
    plate=max(plates,key=lambda r:r['area']) if plates else None
    def container(region):
        children=[r for r in regions if r['id']!=region['id'] and .015<r['area']<region['area']*.65 and overlap(region,r)[1]>.9]
        return any(overlap(a,b)[0]<.15 for i,a in enumerate(children) for b in children[i+1:])
    objects=[r for r in regions if r is not plate and not container(r)][:18];classified=[]
    for region in objects:
        x,y,bw,bh=region['box'];crop=image.crop((int(x*w),int(y*h),max(int(x*w)+1,int((x+bw)*w)),max(int(y*h)+1,int((y+bh)*h))))
        if max(crop.width/crop.height,crop.height/crop.width)>8:continue
        g,r=classifier.run(None,{'input':prep(crop)});features=(np.concatenate([g[0],r[0]])-np.array(head['mean']))/np.array(head['scale'])
        score=softmax(np.array(head['weight'])@features+np.array(head['bias']));best=int(score.argmax())
        routing=config.get('routing',{'globalTemperature':1,'regionalTemperature':1,'otherBias':0})
        gp=softmax(g[0]/routing['globalTemperature']);rl=r[0].astype(float)/routing['regionalTemperature'];rl[-1]+=routing['otherBias'];rp=softmax(rl)
        combined=np.concatenate([gp*rp[-1],rp[:-1]]);labels=config['labels']+config['regionalLabels'];label=labels[int(combined.argmax())]
        family=head['classes'][best];confidence=float(score[best])
        if family=='flatbread' and confidence<.8 and label not in ['naan','dosa','pancakes','french_toast','garlic_bread']:
            family='other';confidence=min(.55,confidence)
        region={**region,'family':family,'confidence':confidence,'labelSuggestion':label}
        if region['family']=='background' or region['confidence']<.45 or region['area']<.015:continue
        classified.append(region)
    selected=[]
    for region in sorted(classified,key=lambda r:-(r['quality']*r['confidence']*(.85 if r['family']=='other' else 1))):
        if any(overlap(region,other)[0]>.4 or overlap(region,other)[1]>.88 for other in selected):continue
        selected.append(region)
        if len(selected)>=10:break
    output=ImageOps.contain(image,(900,900));draw=ImageDraw.Draw(output);ww,hh=output.size
    for index,region in enumerate(selected):
        x,y,bw,bh=region['box'];color={'flatbread':'#c3f66b','curry':'#edb985','rice':'#c5b5ef','other':'#eaeaea'}[region['family']]
        draw.rectangle((int(x*ww),int(y*hh),int((x+bw)*ww),int((y+bh)*hh)),outline=color,width=3)
        draw.text((int(x*ww)+3,int(y*hh)+3),f"{index+1} {region['family']} {region['confidence']:.2f}",fill='black',stroke_fill=color,stroke_width=2)
    output.save(ROOT/f'artifacts/mixed-native-test-{ordinal}.jpg')
    report={'file':entry['file'],'seconds':time.perf_counter()-start,'maskProposals':len(regions),'selectedRegions':[{k:v for k,v in region.items() if k!='mask'} for region in selected],'plateReferenceFound':plate is not None}
    reports.append(report);print(json.dumps({**report,'selectedRegions':[(r['family'],round(r['confidence'],2)) for r in selected]}),flush=True)
(ROOT/'ml/reports/mixed-native-integration.json').write_text(json.dumps({'runtime':'ONNX Runtime CPU, 2 threads; not a browser or phone speed benchmark','limits':'Visual audit only. Source class labels were rejected. No portion weights or count ground truth available, so no quantity accuracy is claimed.','cases':reports},indent=2)+'\n')
