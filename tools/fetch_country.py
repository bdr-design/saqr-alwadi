"""Velmora's country at Sentinel-2's full 10 m: 200 x 200 km round its centre (43.675 E, 14.75 N, UTM 38N), for
tools/make_country.py. Copernicus Sentinel-2 L2A true-colour (TCI) from the public COGs on AWS (sentinel-cogs), read
tile by tile over HTTP ranges (only the 1024 px tiles inside the box), each MGRS tile a per-pixel median of its
clearest scenes with clouds and their shadows left out (below), the MGRS tiles averaged where they overlap.

usage: python3 tools/fetch_country.py --list <scenes.json>      (the scenes, listed first)
       python3 tools/fetch_country.py <scenes.json> <out dir>
  scenes.json: per MGRS tile (38PKA .. 38PMC), its scenes {p, n, cc, nd} from the dry months, clearest first (the
  listing below, list_scenes, writes it). Writes <out dir>/c10.npy (20,000 px square, 1.2 GB) and two working files.
Contains modified Copernicus Sentinel data (2023-2025).
"""
import io, json, sys, os, time, re, urllib.request, numpy as np, tifffile, concurrent.futures as cf
from pyproj import Transformer
B='https://sentinel-cogs.s3.us-west-2.amazonaws.com/'
class HF(io.RawIOBase):
    def __init__(s,u):
        s.u=u; s.p=0; s.c={}
        for k in range(6):
            try: s.n=int(urllib.request.urlopen(urllib.request.Request(u,method='HEAD'),timeout=60).headers['Content-Length']); break
            except Exception as e:
                if k == 5: raise
                time.sleep(2 ** k)
    def seekable(s): return True
    def readable(s): return True
    def tell(s): return s.p
    def seek(s,o,w=0): s.p = o if w==0 else s.p+o if w==1 else s.n+o; return s.p
    def read(s,k=-1):
        if k<0: k=s.n-s.p
        if k==0: return b''
        for t in range(6):
            try:
                r=urllib.request.Request(s.u,headers={'Range':f'bytes={s.p}-{s.p+k-1}'}); d=urllib.request.urlopen(r,timeout=120).read(); break
            except Exception as e: err=e; time.sleep(2 ** t)
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
# Each MGRS tile from up to 8 of its clearest scenes, every pixel the median of the scenes that saw it clear
# (Sentinel-2's own scene classification, SCL: saturated, cloud shadow, cloud, cirrus, and a 40 m margin round them,
# left out); where none did, the median of all that saw it.
from scipy import ndimage
SCENES, OUTD = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2]); os.chdir(OUTD)
tr = Transformer.from_crs('EPSG:4326', 'EPSG:32638', always_xy=True)
cx, cy = tr.transform(43.675, 14.75); R = 100000
X0 = round((cx - R) / 10) * 10; Y0 = round((cy + R) / 10) * 10; N = 2 * R // 10
J = json.load(open(SCENES))
SUM = np.lib.format.open_memmap('c10_sum.npy', 'w+', np.uint16, (N, N, 3))
CNT = np.lib.format.open_memmap('c10_cnt.npy', 'w+', np.uint8, (N, N))
BAD = np.zeros(256, bool); BAD[[1, 3, 8, 9, 10]] = True
def open_scene(it):
    f = HF(B + it['p'] + 'TCI.tif'); tf = tifffile.TiffFile(io.BufferedReader(f, buffer_size=1 << 16)); p = tf.pages[0]; tp = p.tags['ModelTiepointTag'].value
    s = HF(B + it['p'] + 'SCL.tif'); scl = tifffile.TiffFile(io.BufferedReader(s, buffer_size=1 << 20)).series[0].asarray()
    bad = ndimage.binary_dilation(BAD[scl], iterations=2)
    return dict(f=f, p=p, x0=tp[3], y0=tp[4], bad=bad)
def tile(sc, i):
    p = sc['p']; g = HF.__new__(HF); g.u = sc['f'].u; g.n = sc['f'].n; g.p = p.dataoffsets[i]
    a, _, _ = p.decode(g.read(p.databytecounts[i]), i); return a.reshape(p.tilelength, p.tilewidth, 3)
tot = time.time()
for t in J:
    t0 = time.time()
    with cf.ThreadPoolExecutor(8) as ex: scs = list(ex.map(open_scene, J[t][:8]))
    p = scs[0]['p']; x0, y0 = scs[0]['x0'], scs[0]['y0']; tw = p.tilewidth; nx = (p.imagewidth + tw - 1) // tw
    jobs = []
    for ty in range(nx):
        for tx in range(nx):
            gx = int(round((x0 + tx * tw * 10 - X0) / 10)); gy = int(round((Y0 - (y0 - ty * tw * 10)) / 10))
            if gx + tw <= 0 or gy + tw <= 0 or gx >= N or gy >= N: continue
            jobs.append((ty, tx, gx, gy))
    def work(j):
        ty, tx, gx, gy = j; i = ty * nx + tx
        st = np.stack([tile(s, i) for s in scs]).astype(np.float32)
        nod = st.sum(-1) == 0
        bad = np.stack([np.kron(s['bad'][ty * 512:(ty + 1) * 512, tx * 512:(tx + 1) * 512], np.ones((2, 2), bool))[:tw, :tw] for s in scs])
        bad = np.pad(bad, ((0, 0), (0, tw - bad.shape[1]), (0, tw - bad.shape[2])), constant_values=True)
        clear = st.copy(); clear[nod | bad] = np.nan; anyv = st.copy(); anyv[nod] = np.nan
        with np.errstate(all='ignore'):
            med = np.nanmedian(clear, 0)
            hole = np.isnan(med[..., 0])
            # (the median of every scene that saw it, only where no scene saw it clear)
            if hole.any(): alt = np.nanmedian(anyv, 0); med[hole] = alt[hole]
        ok = ~np.isnan(med[..., 0])
        return gx, gy, np.round(np.nan_to_num(med)).astype(np.uint8), ok, int(hole.sum() - (~ok).sum())
    cl = 0
    with cf.ThreadPoolExecutor(8) as ex:
        for gx, gy, med, ok, h in ex.map(work, jobs):
            a0, b0, a1, b1 = max(gy, 0), max(gx, 0), min(gy + tw, N), min(gx + tw, N)
            m = med[a0 - gy:a1 - gy, b0 - gx:b1 - gx]; o = ok[a0 - gy:a1 - gy, b0 - gx:b1 - gx]
            SUM[a0:a1, b0:b1] += (m * o[..., None]).astype(np.uint16); CNT[a0:a1, b0:b1] += o.astype(np.uint8); cl += h
    print(t, len(scs), 'scenes', len(jobs), 'tiles', round(time.time() - t0), 's; px never clear', cl, flush=True)
SUM.flush(); CNT.flush()
OUT = np.lib.format.open_memmap('c10.npy', 'w+', np.uint8, (N, N, 3))
for r in range(0, N, 1000):
    c = CNT[r:r + 1000].astype(np.float32); OUT[r:r + 1000] = np.round(SUM[r:r + 1000] / np.maximum(c, 1)[..., None]).astype(np.uint8)
OUT.flush(); print('gaps', float((CNT[::10, ::10] == 0).mean()), 'total', round(time.time() - tot), 's', flush=True)
