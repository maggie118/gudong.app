# -*- coding: utf-8 -*-
from PIL import Image
import numpy as np
from collections import deque

src = r'C:\Users\Eastw Engineering\Documents\Gudong\badge_raw.png'
out = r'C:\Users\Eastw Engineering\Documents\Gudong\创始藏家徽章_透明底.png'

img = Image.open(src).convert('RGBA')
a = np.array(img).astype(np.uint8)
H, W = a.shape[:2]

thresh = 235
mask = (a[:,:,0] > thresh) & (a[:,:,1] > thresh) & (a[:,:,2] > thresh)
visited = np.zeros((H, W), dtype=bool)
q = deque()

def push(y, x):
    if mask[y, x] and not visited[y, x]:
        visited[y, x] = True
        q.append((y, x))

for x in range(W):
    push(0, x); push(H-1, x)
for y in range(H):
    push(y, 0); push(y, W-1)

while q:
    y, x = q.popleft()
    if y+1 < H: push(y+1, x)
    if y-1 >= 0: push(y-1, x)
    if x+1 < W: push(y, x+1)
    if x-1 >= 0: push(y, x-1)

alpha = np.full((H, W), 255, dtype=np.uint8)
alpha[visited] = 0

# ---- edge feathering: smooth the boundary between opaque and transparent ----
opaque = alpha > 200
transp = alpha <= 200
# neighbours of transparent pixels
n_t = np.zeros((H, W), dtype=bool)
n_t[1:,:] |= transp[:-1,:]
n_t[:-1,:] |= transp[1:,:]
n_t[:,1:] |= transp[:,:-1]
n_t[:,:-1] |= transp[:,1:]
boundary = opaque & n_t

white = a.min(axis=2).astype(np.float32)          # whiteness ~ min(r,g,b)
t = np.clip((white - 200.0) / 35.0, 0.0, 1.0)     # whiter -> closer to bg -> more transparent
new_a = (1.0 - t) * 255.0
alpha[boundary] = new_a[boundary].astype(np.uint8)

a[:,:,3] = alpha

# ---- crop to content bounding box ----
ys, xs = np.nonzero(a[:,:,3] > 10)
minY, maxY = ys.min(), ys.max()
minX, maxX = xs.min(), xs.max()
crop = a[minY:maxY+1, minX:maxX+1, :]

out_img = Image.fromarray(crop, 'RGBA')
out_img.save(out)
print('saved', out, crop.shape[1], 'x', crop.shape[0])

# report alpha stats
ca = crop[:,:,3]
print('opaque', int((ca>200).sum()), 'semi', int(((ca>0)&(ca<=200)).sum()), 'transparent', int((ca==0).sum()))
