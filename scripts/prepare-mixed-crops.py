"""Deterministic crop index for the manually reviewed training-plate labels."""
from pathlib import Path
import json
from PIL import Image,ImageOps,ImageDraw
root=Path(__file__).resolve().parents[1];work=root/'.ml-work/mixed'
metadata=json.loads((work/'data.json').read_text());entries=[entry for entry in metadata['entries'] if entry['split']=='train'][:28]
folder=work/'manual-crops';folder.mkdir(exist_ok=True);crops=[]
for entry in entries:
    image=Image.open(work/entry['file']).convert('RGB');width,height=image.size
    for ordinal,line in enumerate((work/entry['label']).read_text().splitlines()):
        label,cx,cy,bw,bh=map(float,line.split());box=[max(0,cx-bw/2),max(0,cy-bh/2),min(1,cx+bw/2),min(1,cy+bh/2)]
        crop=image.crop((int(box[0]*width),int(box[1]*height),max(int(box[0]*width)+1,int(box[2]*width)),max(int(box[1]*height)+1,int(box[3]*height))))
        crops.append({'id':len(crops),'file':entry['file'],'group':entry['group'],'cache':entry['sha256'][:16]+'-'+str(ordinal)+'.npz','box':box})
        crop.save(folder/f'{len(crops)-1}.jpg')
(work/'manual-crops.json').write_text(json.dumps(crops,indent=2))
for page in range((len(crops)+19)//20):
    output=Image.new('RGB',(1000,850),'#202020');draw=ImageDraw.Draw(output)
    for i,crop in enumerate(crops[page*20:(page+1)*20]):
        image=ImageOps.contain(Image.open(folder/f"{crop['id']}.jpg"),(195,180));x=i%5*200;y=i//5*212
        output.paste(image,(x+(195-image.width)//2,y));draw.text((x+5,y+183),str(crop['id'])+' | '+crop['group'][:17],fill='white')
    output.save(work/f'manual-sheet-{page}.jpg')
print(f'Prepared {len(crops)} crop review records from {len(entries)} training plate groups')
