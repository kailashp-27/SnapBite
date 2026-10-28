"""Render before/after detection diagnostics, not app screenshots or ground truth."""
from pathlib import Path
import json,sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'.ml-work/python'))
from PIL import Image,ImageOps,ImageDraw
data=json.loads((ROOT/'ml/reports/mixed-selection-v3.json').read_text())
sheet=Image.new('RGB',(1000,len(data['cases'])*420),'#151515');draw=ImageDraw.Draw(sheet)
colors={'flatbread':'#c3f66b','curry':'#edb985','rice':'#c5b5ef','other':'#eaeaea'}
for row,case in enumerate(data['cases']):
    image=ImageOps.exif_transpose(Image.open(ROOT/'.ml-work/mixed'/case['file'])).convert('RGB')
    for col,key in enumerate(['before','after']):
        view=ImageOps.contain(image,(480,370));overlay=ImageDraw.Draw(view)
        for item in case[key]:
            x,y,w,h=item['box'];x,y,w,h=x*view.width,y*view.height,w*view.width,h*view.height;color=colors[item['family']]
            overlay.rectangle((x,y,x+w,y+h),outline=color,width=2)
            overlay.text((x+2,y+2),f"{item['id']} {item['family']}",fill='black',stroke_fill=color,stroke_width=2)
        sheet.paste(view,(col*500+10,row*420+32));draw.text((col*500+10,row*420+8),f"Plate {case['ordinal']} - {key} ({len(case[key])} regions)",fill='white')
sheet.save(ROOT/'artifacts/mixed-selection-v3-contact.jpg')
