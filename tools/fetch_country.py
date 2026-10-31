"""Velmora's country at Sentinel-2's full 10 m: 200 x 200 km round its centre (43.675 E, 14.75 N, UTM 38N), for
tools/make_country.py. Copernicus Sentinel-2 L2A true-colour (TCI) from the public COGs on AWS (sentinel-cogs), read
tile by tile over HTTP ranges (only the 1024 px tiles inside the box), each MGRS tile a per-pixel median of its
clearest scenes (nodata left out), the MGRS tiles averaged where they overlap.

usage: python3 tools/fetch_country.py <scenes.json> <out dir>
  scenes.json: per MGRS tile (38PKA .. 38PMC), its scenes {p, n, cc, nd} from the dry months, clearest first (the
  listing below, list_scenes, writes it). Writes <out dir>/c10.npy (20,000 px square, 1.2 GB) and two working files.
Contains modified Copernicus Sentinel data (2023-2025).
"""
import io, json, sys, os, time, re, urllib.request, numpy as np, tifffile, concurrent.futures as cf
from pyproj import Transformer
B='https://sentinel-cogs.s3.us-west-2.amazonaws.com/'
class HF(io.RawIOBase):
    def __init__(s,u): s.u=u; s.p=0; s.n=int(urllib.request.urlopen(urllib.request.Request(u,method='HEAD'),timeout=60).headers['Content-Length']); s.c={}
    def seekable(s): return True
    def readable(s): return True
    def tell(s): return s.p
    def seek(s,o,w=0): s.p = o if w==0 else s.p+o if w==1 else s.n+o; return s.p
    def read(s,k=-1):
        if k<0: k=s.n-s.p
        if k==0: return b''
        for _ in range(4):
            try:
                r=urllib.request.Request(s.u,headers={'Range':f'bytes={s.p}-{s.p+k-1}'}); d=urllib.request.urlopen(r,timeout=120).read(); break
            except Exception as e: err=e
        else: raise err
        s.p+=len(d); return d
    def readinto(s,b): d=s.read(len(b)); b[:len(d)]=d; return len(d)

def list_scenes(tiles, out):
    """the dry months' scenes of each MGRS tile, clearest first (eo:cloud_cover, then the least nodata)"""
    def ls(prefix):
        x = urllib.request.urlopen(B + '?list-type=2&delimiter=/&prefix=' + prefix, timeout=60).read().decode()
        return re.findall(r'<Prefix>([^<]+)</Prefix>', x)[1:]
    def item(p):
        n = p.rstrip('/').split('/')[-1]
        try: j = json.load(urllib.request.urlopen(B + p + n + '.json', timeout=60))
        except Exception: return None
        pr = j['properties']; return dict(p=p, n=n, cc=pr.get('eo:cloud_cover'), nd=pr.get('s2:nodata_pixel_percentage'), dt=pr['datetime'])
    res = {}
    for t in tiles:
        ps = []
        for y, mo in [(2023, 11), (2023, 12), (2024, 1), (2024, 2), (2024, 11), (2024, 12), (2025, 1)]: ps += ls(f'sentinel-s2-l2a-cogs/{t[:2]}/{t[2]}/{t[3:]}/{y}/{mo}/')
        with cf.ThreadPoolExecutor(16) as ex: its = [i for i in ex.map(item, [p for p in ps if '_0_L2A' in p]) if i and i['nd'] is not None and i['nd'] < 70]
        res[t] = sorted(its, key=lambda i: i['cc'])[:10]
    json.dump(res, open(out, 'w'), indent=1)
if __name__ == '__main__' and len(sys.argv) > 2 and sys.argv[1] == '--list':
    list_scenes(['38PKA', '38PKB', '38PKC', '38PLA', '38PLB', '38PLC', '38PMA', '38PMB', '38PMC'], sys.argv[2]); sys.exit()
SCENES, OUTD = sys.argv[1], sys.argv[2]; os.chdir(OUTD)
tr = Transformer.from_crs('EPSG:4326', 'EPSG:32638', always_xy=True)
cx, cy = tr.transform(43.675, 14.75); R = 100000; G = 10
X0 = round((cx - R) / 10) * 10; Y0 = round((cy + R) / 10) * 10; N = 2 * R // G
print('origin', X0, Y0, N, flush=True)
SUM = np.lib.format.open_memmap('c10_sum.npy', 'w+', np.uint16, (N, N, 3))
CNT = np.lib.format.open_memmap('c10_cnt.npy', 'w+', np.uint8, (N, N))
J = json.load(open(SCENES))
def scenes(t):
    its = J[t]
    # the edge tiles of an orbit are half empty: more scenes, the ones with most data first
    return sorted(its, key=lambda i: i['nd'])[:4] if t.startswith('38PM') else its[:3]
def open_scene(it):
    f = HF(B + it['p'] + 'TCI.tif'); tf = tifffile.TiffFile(io.BufferedReader(f, buffer_size=1 << 16)); p = tf.pages[0]
    tp = p.tags['ModelTiepointTag'].value
    return dict(f=f, p=p, x0=tp[3], y0=tp[4])
def tile(sc, i):
    p = sc['p']; g = HF.__new__(HF); g.u = sc['f'].u; g.n = sc['f'].n; g.p = p.dataoffsets[i]
    d = g.read(p.databytecounts[i]); a, _, _ = p.decode(d, i); return a.reshape(p.tilelength, p.tilewidth, 3)
for t in J:
    t0 = time.time(); scs = [open_scene(it) for it in scenes(t)]; p = scs[0]['p']
    x0, y0 = scs[0]['x0'], scs[0]['y0']; tw, th = p.tilewidth, p.tilelength; nx = (p.imagewidth + tw - 1) // tw; ny = (p.imagelength + th - 1) // th
    jobs = []
    for ty in range(ny):
        for tx in range(nx):
            # this internal tile's place in the country grid
            gx = int(round((x0 + tx * tw * 10 - X0) / 10)); gy = int(round((Y0 - (y0 - ty * th * 10)) / 10))
            if gx + tw <= 0 or gy + th <= 0 or gx >= N or gy >= N: continue
            jobs.append((ty * nx + tx, gx, gy))
    def work(j):
        i, gx, gy = j
        st = np.stack([tile(s, i) for s in scs]).astype(np.float32)
        st[st.sum(-1) == 0] = np.nan
        with np.errstate(all='ignore'): med = np.nanmedian(st, 0)
        ok = ~np.isnan(med[..., 0])
        return i, gx, gy, np.nan_to_num(med).astype(np.uint8), ok
    with cf.ThreadPoolExecutor(8) as ex:
        for i, gx, gy, med, ok in ex.map(work, jobs):
            a0, b0 = max(gy, 0), max(gx, 0); a1, b1 = min(gy + th, N), min(gx + tw, N)
            m = med[a0 - gy:a1 - gy, b0 - gx:b1 - gx]; o = ok[a0 - gy:a1 - gy, b0 - gx:b1 - gx]
            SUM[a0:a1, b0:b1] += (m * o[..., None]).astype(np.uint16); CNT[a0:a1, b0:b1] += o.astype(np.uint8)
    print(t, len(scs), 'scenes', len(jobs), 'tiles', round(time.time() - t0), 's', flush=True)
SUM.flush(); CNT.flush()
OUT = np.lib.format.open_memmap('c10.npy', 'w+', np.uint8, (N, N, 3))
for r in range(0, N, 1000):
    c = CNT[r:r + 1000].astype(np.float32); OUT[r:r + 1000] = (SUM[r:r + 1000] / np.maximum(c, 1)[..., None]).astype(np.uint8)
OUT.flush(); print('gaps', float((CNT[::10, ::10] == 0).mean()), flush=True)
