"""Static decoder recovered from CHESS.EXE e23a/e277. Does not execute game code."""
from pathlib import Path
import struct
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
EGA = [(0,0,0),(0,0,170),(0,170,0),(0,170,170),(170,0,0),(170,0,170),(170,85,0),(170,170,170),
       (85,85,85),(85,85,255),(85,255,85),(85,255,255),(255,85,85),(255,85,255),(255,255,85),(255,255,255)]


class Bits:
    def __init__(self,data,offset):self.data=data;self.pos=offset*8
    def read(self,n=1):
        value=0
        for _ in range(n):
            if self.pos>=len(self.data)*8:raise ValueError('Truncated bitstream')
            value=(value<<1)|((self.data[self.pos>>3]>>(7-(self.pos&7)))&1)
            self.pos+=1
        return value


def decode(data,offset):
    size,other=struct.unpack_from('<II',data,offset)
    if size>16_000_000:raise ValueError('Invalid output size')
    bits=Bits(data,offset+8);symbols=[]
    def tree(depth=0):
        if depth>16 or len(symbols)>256:raise ValueError('Invalid tree')
        if bits.read():
            symbol=bits.read(8);symbols.append(symbol);return symbol
        left=tree(depth+1)
        bits.read() # Original e282 consumes a separator bit before the right subtree.
        return left,tree(depth+1)
    root=tree()
    if len(symbols)!=len(set(symbols)):raise ValueError('Repeated Huffman symbol')
    output=bytearray()
    for _ in range(size):
        node=root
        while isinstance(node,tuple):node=node[bits.read()]
        output.append(node)
    return bytes(output),bits.pos,other


def initial_frames():
    data=(ROOT/'ALLCANM1').read_bytes();metadata=[];offset=0
    while data[offset:offset+4]!=b'\0\0\0\0':
        metadata.append(tuple(data[offset:offset+4]));offset+=4
    pixels,end,other=decode(data,offset+4)
    assert len(pixels)==sum(((w+1)//2)*h for w,h,_,_ in metadata)
    frames=[];position=0
    for w,h,x,y in metadata:
        stride=(w+1)//2;image=Image.new('RGBA',(w,h))
        frame=bytearray(pixels[position:position+stride*h])
        # Original 2f13 reconstructs each row against the preceding reconstructed row.
        for row in range(1,h):
            for col in range(stride):frame[row*stride+col]^=frame[(row-1)*stride+col]
        for row in range(h):
            for col in range(w):
                byte=frame[row*stride+col//2]
                index=byte>>4 if col%2==0 else byte&15
                image.putpixel((col,row),(*EGA[index],0 if index==0 else 255))
        position+=stride*h;frames.append((image,(w,h,x,y)))
    return frames,end,other


def main():
    frames,end,other=initial_frames()
    sheet=Image.new('RGB',(8*150,6*220),'#303030');draw=ImageDraw.Draw(sheet)
    for i,(image,meta) in enumerate(frames):
        x=(i%8)*150;y=(i//8)*220
        enlarged=image.resize((image.width*4,image.height*4),Image.Resampling.NEAREST)
        sheet.paste(enlarged,(x+(150-enlarged.width)//2,y+8),enlarged)
        draw.text((x+8,y+201),f'{i:02d} {meta}',fill='white')
    target=ROOT/'analysis'/'original-frames.png';sheet.save(target)
    print(f'{len(frames)} frame candidates; stream ends at bit {end} (byte {end//8}); second header {other}; {target}')


if __name__=='__main__':main()
