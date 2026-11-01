# -*- coding: utf-8 -*-
from PIL import Image
import numpy as np

src = r'C:\Users\Eastw Engineering\Documents\Gudong\创始藏家徽章_透明底.png'
img = Image.open(src).convert('RGBA')
a = np.array(img)
H, W = a.shape[:2]
alpha = a[:,:,3]
print('size', W, 'x', H)
print('total px', alpha.size)
print('opaque px', int((alpha>200).sum()))
print('semi px', int(((alpha>0)&(alpha<=200)).sum()))
print('transparent px', int((alpha==0).sum()))

# corner pixels (should be transparent)
corners = [(0,0),(W-1,0),(0,H-1),(W-1,H-1)]
for (x,y) in corners:
    print('corner', x, y, 'alpha', int(a[y,x,3]), 'rgb', tuple(int(v) for v in a[y,x,:3]))

# compose onto deep brown background to check for white fringe
bg = np.zeros((H,W,4), dtype=np.uint8)
bg[:,:,0]=43; bg[:,:,1]=30; bg[:,:,2]=20; bg[:,:,3]=255
comp = a.astype(np.float32)/255.0
bgg = bg.astype(np.float32)/255.0
out = np.zeros_like(comp)
for c in range(3):
    out[:,:,c] = comp[:,:,c]*comp[:,:,3] + bgg[:,:,c]*(1-comp[:,:,3])
out[:,:,3] = 1.0
prev = Image.fromarray((out*255).astype(np.uint8), 'RGBA')
prev.save(r'C:\Users\Eastw Engineering\Documents\Gudong\预览_透明徽章叠深棕底.png')
print('preview saved')
