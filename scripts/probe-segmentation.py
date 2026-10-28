from pathlib import Path
import sys,json,time
sys.path.insert(0,str(Path('.ml-work/python').resolve()))
import numpy as np
import onnxruntime as ort
from PIL import Image,ImageOps,ImageDraw

work=Path('.ml-work/mixed')
options=ort.SessionOptions();options.intra_op_num_threads=2;options.inter_op_num_threads=1
encoder=ort.InferenceSession(str(work/'vision_encoder_quantized.onnx'),options,providers=['CPUExecutionProvider'])
decoder=ort.InferenceSession(str(work/'prompt_encoder_mask_decoder_quantized.onnx'),options,providers=['CPUExecutionProvider'])
entry=json.loads((work/'data.json').read_text())['entries'][0]
image=ImageOps.exif_transpose(Image.open(work/entry['file'])).convert('RGB')
w,h=image.size;rw,rh=round(w*1024/max(w,h)),round(h*1024/max(w,h))
pixels=(np.asarray(image.resize((rw,rh),Image.Resampling.BILINEAR),np.float32)/255-np.array([.485,.456,.406]))/np.array([.229,.224,.225])
tensor=np.zeros((1,3,1024,1024),np.float32);tensor[0,:,:rh,:rw]=pixels.transpose(2,0,1)
start=time.perf_counter();embeddings=encoder.run(None,{'pixel_values':tensor});print('Encoder seconds',time.perf_counter()-start,flush=True)
points=np.array([[(x+.5)*rw/5,(y+.5)*rh/5] for y in range(5) for x in range(5)],np.float32).reshape(1,25,1,2)
start=time.perf_counter();scores,masks=decoder.run(None,{'input_points':points,'input_labels':np.ones((1,25,1),np.int64),'image_embeddings':embeddings[0],'image_positional_embeddings':embeddings[1]})
print('Decoder seconds',time.perf_counter()-start,'shapes',scores.shape,masks.shape,flush=True)
preview=image.copy();draw=ImageDraw.Draw(preview)
records=[]
for point in range(25):
    for choice in range(3):
        mask=masks[0,point,choice,:max(1,round(rh/4)),:max(1,round(rw/4))]>0
        ys,xs=np.where(mask)
        area=float(mask.mean())
        if len(xs)==0 or not(.006<area<.8) or scores[0,point,choice]<.8:continue
        box=[float(xs.min()/mask.shape[1]),float(ys.min()/mask.shape[0]),float((xs.max()+1)/mask.shape[1]),float((ys.max()+1)/mask.shape[0])]
        records.append({'quality':float(scores[0,point,choice]),'area':area,'box':box})
        draw.rectangle([box[0]*w,box[1]*h,box[2]*w,box[3]*h],outline='red',width=2)
(work/'sam-probe.json').write_text(json.dumps({'file':entry['file'],'regions':records},indent=2))
preview.save(work/'sam-probe.jpg')
print('Candidate masks',len(records),flush=True)
