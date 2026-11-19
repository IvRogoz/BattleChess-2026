"""Export original decoded Battle Chess resources for the native web client."""
from pathlib import Path
import base64, hashlib, json, struct
from PIL import Image
from decode_assets import EGA

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / 'analysis' / 'catalog.json'
OUT = ROOT / 'web' / 'assets'

def sha(data): return hashlib.sha256(data).hexdigest()
def signed(n): return n if n<128 else n-256

def terminated_lists(data,start,count):
    result=[];pos=start
    for _ in range(count):
        end=data.index(b'\xff',pos);result.append(list(data[pos:end]));pos=end+1
    return result

def main():
    catalog=json.loads(CATALOG.read_text(encoding='utf-8'))
    for name,details in catalog['files'].items():
        if sha((ROOT/name).read_bytes())!=details['sha256']:
            raise ValueError(f'{name} changed since catalog extraction')
    OUT.mkdir(parents=True,exist_ok=True)
    (OUT/'blocks').mkdir(exist_ok=True)
    manifest={'version':1,'palette':EGA,'paletteNote':'Standard EGA palette; exact original hardware palette unverified.',
              'sources':catalog['files'],'groups':[],'blocks':[],'screens':{}}
    blocks={(b['file'],b['header_offset']):b for b in catalog['blocks']}
    for g in catalog['frame_groups']:
        block=blocks[(g['file'],g['header_offset'])]
        raw=(ROOT/'analysis'/block['decoded']).read_bytes()
        if sha(raw)!=block['output_sha256']: raise ValueError('Decoded block hash mismatch')
        frames=[];pos=0
        for row in g['frames']:
            w,h=row['width'],row['height'];stride=(w+1)//2;length=stride*h
            pixels=bytearray(raw[pos:pos+length]);pos+=length
            if g['kind'] != 'delta':
                for i in range(stride,len(pixels)):pixels[i]^=pixels[i-stride]
            frames.append({'w':w,'h':h,'x':signed(row['x']),'y':signed(row['y']),
                           'rawX':row['x'],'rawY':row['y'],'pixels':base64.b64encode(pixels).decode('ascii')})
        if pos!=len(raw): raise ValueError('Frame byte count mismatch')
        manifest['groups'].append({'file':g['file'],'kind':g['kind'],'metadataOffset':g['metadata_offset'],
            'headerOffset':g['header_offset'],'frames':frames,'sequences':g['sequences']})
    for b in catalog['blocks']:
        if b['file']!='ALLCANM1':continue
        raw=(ROOT/'analysis'/b['decoded']).read_bytes()
        if sha(raw)!=b['output_sha256']: raise ValueError('Decoded block hash mismatch')
        relative=f"blocks/allcanm1-{b['header_offset']}.bin"
        (OUT/relative).write_bytes(raw)
        manifest['blocks'].append({'file':b['file'],'headerOffset':b['header_offset'],
            'outputBytes':len(raw),'sha256':sha(raw),'path':relative})
    for name,offset in [('board',103746),('board-flat',110240),('board-patterned',163235),('title',146784)]:
        b=blocks[('ALLCANM1',offset)];data=bytearray((ROOT/'analysis'/b['decoded']).read_bytes()[:32000])
        if len(data)!=32000:raise ValueError('Incomplete screen data')
        for i in range(160,len(data)):data[i]^=data[i-160]
        image=Image.new('P',(320,200));image.putpalette([v for rgb in EGA for v in rgb]+[0]*(768-48))
        image.putdata([(data[y*160+x//2]>>(4 if x%2==0 else 0))&15 for y in range(200) for x in range(320)])
        image.save(OUT/(name+'.png'))
        manifest['screens'][name]={'path':name+'.png','file':'ALLCANM1','headerOffset':offset,
                                    'decodedOffset':0,'decodedBytes':32000,'rowStride':160}
    unpacked=(ROOT/'analysis'/'unpacked-image.bin').read_bytes();ds=0x5cc20
    manifest['tables']={
        'source':{'file':'CHESS.EXE','sha256':sha((ROOT/'CHESS.EXE').read_bytes()),
                  'unpackedSha256':sha(unpacked),'dataSegmentOffset':ds},
        'squareX':list(struct.unpack_from('<64H',unpacked,ds+0x034e)),
        'squareY':list(struct.unpack_from('<8H',unpacked,ds+0x03ce)),
        'initialBoard':list(unpacked[ds+0x1166:ds+0x1166+64]),
        'standingFrames':list(unpacked[ds+0x0166:ds+0x0166+64]),
        'flatX':list(struct.unpack_from('<64h',unpacked,ds+0x03de)),
        'flatY':list(struct.unpack_from('<8h',unpacked,ds+0x045e)),
        'flatFrames':list(unpacked[ds+0x01a6:ds+0x01a6+64]),
        'offsets':{'squareX':0x034e,'squareY':0x03ce,'initialBoard':0x1166,'standingFrames':0x0166},
        'resourceLists':terminated_lists(unpacked,ds+0x0f08,72),
        'timingA':terminated_lists(unpacked,ds+0x11ba,72),
        'timingB':terminated_lists(unpacked,ds+0x2010,72),
        'motionTimingA':terminated_lists(unpacked,ds+0x1c62,144),
        'motionTimingB':terminated_lists(unpacked,ds+0x2a98,144),
        'resourceIndexNote':'Actor 0 (victim): 6*(victim-1)+(attacker-1). Actor 1 (attacker): 36+6*(attacker-1)+(victim-1). timingA is packed sound mode; timingB is one-bit speaker mode.',
        'pieceTypes':{'bishop':1,'king':2,'knight':3,'pawn':4,'queen':5,'rook':6},
        'standingFrameBias':17
    }
    (OUT/'assets.json').write_text(json.dumps(manifest,separators=(',',':'))+'\n',encoding='utf-8')
    print('Exported',len(manifest['groups']),'groups,',len(manifest['blocks']),'blocks and',len(manifest['screens']),'screens')
if __name__=='__main__':main()
