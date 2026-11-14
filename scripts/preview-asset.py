"""Create a hosting-only preview rig. Original stays byte-identical."""
import io,json,struct,hashlib
from pathlib import Path
from PIL import Image
root=Path(__file__).resolve().parents[1]
b=(root/'public/avatar.glb').read_bytes()
assert hashlib.sha256(b).hexdigest()=='63c645a2a863b9972e9a9c2ed576a1de4c390b8475508e1473e69c87a3ee299c'
jlen=struct.unpack_from('<I',b,12)[0];j=json.loads(b[20:20+jlen]);start=20+jlen;blen=struct.unpack_from('<I',b,start)[0];binary=b[start+8:start+8+blen]
images={x['bufferView'] for x in j['images']};out=bytearray()
for i,v in enumerate(j['bufferViews']):
 data=binary[v.get('byteOffset',0):v.get('byteOffset',0)+v['byteLength']]
 if i in images:
  image=Image.open(io.BytesIO(data));image.thumbnail((512,512));buffer=io.BytesIO();image.save(buffer,format='PNG',optimize=True);data=buffer.getvalue()
 while len(out)%4:out.append(0)
 v['byteOffset']=len(out);v['byteLength']=len(data);out.extend(data)
while len(out)%4:out.append(0)
j['buffers'][0]['byteLength']=len(out);j['asset']['generator']='hosting-preview-texture-resize; original MPFB rig preserved separately'
js=json.dumps(j,separators=(',',':')).encode();js+=b' '*((-len(js))%4)
result=struct.pack('<III',0x46546c67,2,12+8+len(js)+8+len(out))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(out),0x004e4942)+out
path=root/'public/avatar-hosting-preview.glb';path.write_bytes(result)
print('Preview bytes',len(result),'sha256',hashlib.sha256(result).hexdigest());assert len(result)<25*1024*1024
