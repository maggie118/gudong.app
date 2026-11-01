# -*- coding: utf-8 -*-
from PIL import Image
import numpy as np
from collections import deque

src = r'C:\Users\Eastw Engineering\Downloads\古董圈创始藏家主页图标设计 (3).png'
out = r'C:\Users\Eastw Engineering\Documents\Gudong\古董圈创始藏家徽章_透明底.png'

img = Image.open(src).convert('RGBA')
a = np.array(img).astype(np.uint8)
H, W = a.shape[:2]

# detect background color from the four corners (median of a border ring)
border = np.concatenate([
    a[0:4, :, :3].reshape(-1,3),
    a[H-4:H, :, :3].reshape(-1,3),
    a[:, 0:4, :3].reshape(-1,3),
    a[:, W-4:W, :3].reshape(-1,3),
])
bg = np.median(border, axis=0)
print('bg detected', bg.astype(int))

rgb = a[:,:,:3].astype(np.float32)
dist = np.sqrt(((rgb - bg.astype(np.float32))**2).sum(axis=2))
thresh = 35.0
mask = dist < thresh

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

# edge feathering
opaque = alpha > 200
transp = alpha <= 200
n_t = np.zeros((H, W), dtype=bool)
n_t[1:,:] |= transp[:-1,:]
n_t[:-1,:] |= transp[1:,:]
n_t[:,1:] |= transp[:,:-1]
n_t[:,:-1] |= transp[:,1:]
boundary = opaque & n_t
# whiteness relative to bg -> transparency at boundary
d = np.sqrt(((rgb - bg.astype(np.float32))**2).sum(axis=2))
t = np.clip((d / (thresh*2.0)), 0.0, 1.0)  # closer to bg -> more transparent
new_a = (1.0 - t) * 255.0
alpha[boundary] = new_a[boundary].astype(np.uint8)

a[:,:,3] = alpha

# crop
ys, xs = np.nonzero(a[:,:,3] > 10)
minY, maxY = ys.min(), ys.max()
minX, maxX = xs.min(), xs.max()
crop = a[minY:maxY+1, minX:maxX+1, :]
Image.fromarray(crop, 'RGBA').save(out)
print('saved', out, crop.shape[1], 'x', crop.shape[0])
ca = crop[:,:,3]
print('opaque', int((ca>200).sum()), 'semi', int(((ca>0)&(ca<=200)).sum()), 'transparent', int((ca==0).sum()))
