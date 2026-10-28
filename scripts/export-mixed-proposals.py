"""Run real native ONNX inference and cache proposals/logits for the TS selector audit.
No category IDs or weights from the source dataset are treated as ground truth.
"""
from pathlib import Path
import hashlib,json,sys,time
ROOT=Path(__file__).resolve().parents[1];WORK=ROOT/'.ml-work/mixed'
sys.path.insert(0,str(ROOT/'.ml-work/python'))
import numpy as np
import onnxruntime as ort
from PIL import Image,ImageOps
options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
def session(name):return ort.InferenceSession(str(ROOT/'ml/models'/name),options,providers=['CPUExecutionProvider'])
encoder=session('vision_encoder_quantized.onnx');decoder=session('prompt_encoder_mask_decoder_quantized.onnx');classifier=session('snapbite-v1.onnx')
config=json.loads((ROOT/'public/models/snapbite-v1/config.json').read_text())
entries=[entry for entry in json.loads((WORK/'data.json').read_text())['entries'] if entry['split']=='test']
def overlap(a,b):
    return np.logical_and(a['mask'],b['mask']).sum()/max(1,np.logical_or(a['mask'],b['mask']).sum())
def prep(image):
    w,h=image.size;factor=256/min(w,h);image=image.resize((int(w*factor),int(h*factor)),Image.Resampling.BILINEAR);w,h=image.size
    pixels=np.asarray(image.crop(((w-224)//2,(h-224)//2,(w-224)//2+224,(h-224)//2+224)),np.float32)/255
    return ((pixels-np.array(config['mean'],np.float32))/np.array(config['std'],np.float32)).transpose(2,0,1)[None]
if '--classify-clean' in sys.argv:
    data=json.loads((WORK/'clean-regions.json').read_text())
    for entry in data['cases']:
        image=ImageOps.exif_transpose(Image.open(WORK/entry['file'])).convert('RGB');w,h=image.size
        for region in entry['regions']:
            x,y,bw,bh=region['box'];crop=image.crop((int(x*w),int(y*h),max(int(x*w)+1,int((x+bw)*w)),max(int(y*h)+1,int((y+bh)*h))))
            g,r=classifier.run(None,{'input':prep(crop)});region['globalLogits']=g[0].tolist();region['regionalLogits']=r[0].tolist()
    (WORK/'clean-logits.json').write_text(json.dumps(data));print('Classified cleaned region crops with the real native model.',flush=True);sys.exit(0)
cases=[]
for ordinal in [0,4,5,7,10]:
    entry=entries[ordinal];image=ImageOps.exif_transpose(Image.open(WORK/entry['file'])).convert('RGB');w,h=image.size;start=time.perf_counter()
    rw,rh=round(w*1024/max(w,h)),round(h*1024/max(w,h));pixels=np.asarray(image.resize((rw,rh),Image.Resampling.BILINEAR),np.float32)/255
    normalized=(pixels-np.array(config['mean'],np.float32))/np.array(config['std'],np.float32)
    tensor=np.zeros((1,3,1024,1024),np.float32);tensor[0,:,:rh,:rw]=normalized.transpose(2,0,1)
    embeddings=encoder.run(None,{'pixel_values':tensor});points=np.array([[(x+.5)*rw/5,(y+.5)*rh/5] for y in range(5) for x in range(5)],np.float32).reshape(1,25,1,2)
    scores,logits=decoder.run(None,{'input_points':points,'input_labels':np.ones((1,25,1),np.int64),'image_embeddings':embeddings[0],'image_positional_embeddings':embeddings[1]})
    candidates=[]
    xs=np.minimum(255,np.floor((np.arange(96)+.5)/96*rw/4).astype(int));ys=np.minimum(255,np.floor((np.arange(96)+.5)/96*rh/4).astype(int))
    for index in range(75):
        quality=float(scores.reshape(-1)[index])
        if quality<.8:continue
        values=logits.reshape(75,256,256)[index][np.ix_(ys,xs)];mask=values>0;area=float(mask.mean());possible=(values>-1).sum()
        if area<.008 or area>.93 or not possible or (values>1).sum()/possible<.82:continue
        yy,xx=np.where(mask);box=[float(xx.min()/96),float(yy.min()/96),float((xx.max()+1-xx.min())/96),float((yy.max()+1-yy.min())/96)]
        candidates.append({'id':str(index),'mask':mask,'area':area,'box':box,'quality':quality})
    regions=[]
    for region in sorted(candidates,key=lambda item:-item['quality']):
        if not any(overlap(region,other)>.72 for other in regions):regions.append(region)
    output=[]
    for region in regions[:24]:
        x,y,bw,bh=region['box'];crop=image.crop((int(x*w),int(y*h),max(int(x*w)+1,int((x+bw)*w)),max(int(y*h)+1,int((y+bh)*h))))
        if max(crop.width/crop.height,crop.height/crop.width)>8:continue
        global_logits,regional_logits=classifier.run(None,{'input':prep(crop)})
        output.append({**region,'mask':region['mask'].reshape(-1).astype(int).tolist(),'globalLogits':global_logits[0].tolist(),'regionalLogits':regional_logits[0].tolist()})
    cases.append({'ordinal':ordinal,'file':entry['file'],'photoSha256':hashlib.sha256((WORK/entry['file']).read_bytes()).hexdigest(),'width':w,'height':h,'seconds':time.perf_counter()-start,'regions':output})
    print(f"Cached real proposals for held-out plate {ordinal}: {len(output)} regions",flush=True)
(WORK/'proposals.json').write_text(json.dumps({'runtime':'Native ONNX CPU, 2 threads; not browser/mobile timings','cases':cases}))
