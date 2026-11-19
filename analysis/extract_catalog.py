"""Catalog confirmed static Battle Chess Huffman blocks; never runs the game."""
from pathlib import Path
import hashlib, json, struct
from PIL import Image
from decode_assets import decode, EGA

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'analysis' / 'catalog-assets'

def sha(data): return hashlib.sha256(data).hexdigest()
def header_candidates(data, minimum=0):
    found=[]
    for pos in range(minimum, len(data)-16):
        size, bits=struct.unpack_from('<II',data,pos)
        if not (1 <= size <= 100000 and 20 <= bits <= 800000 and pos+8+bits//8 <= len(data)):
            continue
        try:
            raw,end,declared=decode(data,pos)
            if declared-(end-(pos+8)*8)==7:
                found.append((pos,raw,end,declared))
        except (ValueError,RecursionError,IndexError):
            pass
    return found

def metadata(data, start, stride):
    rows=[]; p=start
    while p+stride<=len(data) and p-start < 8192:
        entry=data[p:p+stride]
        if not any(entry): return rows,p+stride
        w,h,x,y=entry[:4]
        if w>128 or h>128 or (w==0) != (h==0): return None
        row={'width':w,'height':h,'x':x,'y':y}
        if stride==6: row['encoded_bits']=int.from_bytes(entry[4:6],'little')
        rows.append(row);p+=stride
    return None

def write_frames(group, raw):
    pos=0
    for index,row in enumerate(group['frames']):
        w,h=row['width'],row['height'];size=((w+1)//2)*h
        chunk=bytearray(raw[pos:pos+size]);pos+=size
        stride=(w+1)//2
        if group['kind'] != 'delta':
            for i in range(stride,len(chunk)):
                chunk[i] ^= chunk[i-stride]
        if not w or not h: continue
        image=Image.new('P',(w,h)); image.putpalette([v for rgb in EGA for v in rgb]+[0]*(768-48))
        image.putdata([((chunk[y*((w+1)//2)+x//2] >> (4 if x%2==0 else 0)) & 15) for y in range(h) for x in range(w)])
        name=f"{group['file'].lower()}-group-{group['metadata_offset']:06d}-frame-{index:03d}.png"
        image.save(OUT/name,transparency=0)
        row['image']='catalog-assets/'+name
    assert pos==len(raw)

def parse_sequences(data):
    if not data: return []
    count=data[0]; position=1; sequences=[]
    for _ in range(count):
        length=data[position];base=data[position+1];position+=2
        frames=list(data[position:position+length]);position+=length
        if len(frames)!=length: raise ValueError('Truncated animation sequence')
        sequences.append({'base':base,'frames':frames})
    if position != len(data): raise ValueError('Unparsed animation sequence data')
    return sequences

def main():
    OUT.mkdir(parents=True,exist_ok=True)
    catalog={'description':'Static decoded data. EGA palette and index-0 transparency are display assumptions, not verified from source.', 'files':{},'blocks':[],'frame_groups':[]}
    for name in ('ALLCANM1','ALLCANM2'):
        data=(ROOT/name).read_bytes();catalog['files'][name]={'bytes':len(data),'sha256':sha(data)}
        blocks=header_candidates(data)
        for pos,raw,end,bits in blocks:
            target=f'{name.lower()}-block-{pos:06d}.bin';(OUT/target).write_bytes(raw)
            catalog['blocks'].append({'file':name,'header_offset':pos,'output_bytes':len(raw),'output_sha256':sha(raw),'declared_bits':bits,'consumed_bits':end-(pos+8)*8,'end_bit':end,'next_byte':(end+7)//8,'decoded':'catalog-assets/'+target})
        if name=='ALLCANM1':
            candidates=[(start,4,None) for start in (0,10289,11788,12303)]
        else:
            # The executable contains alternating metadata/header offsets.
            exe=(ROOT/'CHESS.EXE').read_bytes();table=79509
            offsets=list(struct.unpack_from('<59I',exe,table))
            pairs=list(zip(offsets[0::2],offsets[1::2]))
            last=metadata(data,offsets[-1],4)
            if not last: raise ValueError('Missing final metadata group')
            pairs.append((offsets[-1],last[1]))
            candidates=[]
            for start,header in pairs:
                choices=[]
                for stride in (4,6):
                    parsed=metadata(data,start,stride)
                    if not parsed: continue
                    rows,after=parsed
                    block=next((item for item in blocks if item[0]==header),None)
                    if not rows or not block or after>header: continue
                    total=sum(((r['width']+1)//2)*r['height'] for r in rows)
                    if total!=len(block[1]): continue
                    if stride==6 and sum(r['encoded_bits'] for r in rows)!=block[3]-7: continue
                    if stride==4 and after!=header: continue
                    if stride==6:
                        try: parse_sequences(data[after:header])
                        except (ValueError,IndexError): continue
                    choices.append(stride)
                if len(choices)!=1: raise ValueError(f'Ambiguous group at {start}: {choices}')
                candidates.append((start,choices[0],header))
            candidates.sort(key=lambda entry: (entry[1]!=6,entry[0]))
        for start,stride,known_header in candidates:
            parsed=metadata(data,start,stride)
            if not parsed: continue
            rows,after=parsed
            if not rows: continue
            total=sum(((r['width']+1)//2)*r['height'] for r in rows)
            matches=[block for block in blocks if (known_header is None and after<=block[0]<=after+8192 or block[0]==known_header) and len(block[1])==total and (stride!=6 or sum(r['encoded_bits'] for r in rows)==block[3]-7)]
            if len(matches)!=1: raise ValueError(f'Cannot identify block for {name} group {start}')
            pos,raw,_,_=matches[0]
            group={'file':name,'kind':'delta' if stride==6 else 'base','metadata_offset':start,'metadata_stride':stride,'frame_count':len(rows),'metadata_end':after,'header_offset':pos,'command_bytes_hex':data[after:pos].hex() if stride==6 else None,'sequences':parse_sequences(data[after:pos]) if stride==6 else [],'base_mapping_note':'High-bit base 0x80+n may refer to standing frame n+17; inferred, not verified.' if stride==6 else None,'frames':rows,'validation':'frame byte totals match decoded output'+(' and frame bit lengths match stream consumption' if stride==6 else '')}
            write_frames(group,raw);catalog['frame_groups'].append(group)
    (ROOT/'analysis'/'catalog.json').write_text(json.dumps(catalog,indent=2)+'\n',encoding='utf-8')
    print('blocks:',len(catalog['blocks']),'groups:',len(catalog['frame_groups']))
    for group in catalog['frame_groups']: print(group['file'],group['metadata_offset'],group['frame_count'],group['header_offset'])
if __name__=='__main__': main()
