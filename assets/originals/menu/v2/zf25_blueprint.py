# ZF-25 three-view line drawing from the spec (metres; x from the nose tip aft, y to the right, z up from the ground)
import math
from PIL import Image, ImageDraw, ImageFont
K=55; W,H=2400,1500
im=Image.new('RGB',(W,H),(250,250,250)); d=ImageDraw.Draw(im)
F='/home/user/saqr-alwadi/tests/out/trailer-target/fonts/package/files/ibm-plex-sans-arabic-latin-600-normal.woff2'
f=ImageFont.truetype(F,26); fs=ImageFont.truetype(F,18)
INK=(20,24,28); LT=(120,128,136)
def P(o,pts,sx=1,sy=-1): return [(o[0]+x*K*sx,o[1]+y*K*sy) for x,y in pts]
def poly(o,pts,w=3,col=INK,fill=None,sy=-1): q=P(o,pts,sy=sy); d.polygon(q,outline=col,fill=fill); d.line(q+[q[0]],fill=col,width=w)
def line(o,pts,w=2,col=INK,sy=-1): d.line(P(o,pts,sy=sy),fill=col,width=w)
def circ(o,c,r,w=3,col=INK,sy=-1):
    x,y=o[0]+c[0]*K,o[1]+c[1]*K*sy; d.ellipse([x-r*K,y-r*K,x+r*K,y+r*K],outline=col,width=w)
def lerp(a,b,t): return a+(b-a)*t
# ---- top view (planform): origin at the nose tip, y down the page = right wing
ot=(120,420)
half=[(0,0),(0.6,0.18),(1.6,0.38),(3.2,0.55),(5.0,0.75),(7.0,0.9),(8.5,1.15),(9.5,1.3),(15.5,1.3),(17.8,1.15)]
fus=half+[(p[0],-p[1]) for p in reversed(half)]
poly(ot,fus,sy=1)
for s in (1,-1):
    poly(ot,[(7.8,1.25*s),(13.4,6.2*s),(15.0,6.2*s),(15.0,1.3*s)],sy=1)
    poly(ot,[(15.6,1.25*s),(17.0,3.5*s),(17.6,3.5*s),(17.6,1.2*s)],sy=1)
    poly(ot,[(17.8,0.15*s),(19.0,0.15*s),(19.0,1.05*s),(17.8,1.05*s)],sy=1)
    line(ot,[(14.8,1.0*s),(17.4,1.05*s)],w=6,sy=1)          # the fin seen from above
    for yy in (2.3,3.8,5.0): line(ot,[(lerp(7.8,13.4,(yy-1.25)/4.95)+0.6,yy*s),(14.4,yy*s)],w=1,col=LT,sy=1)   # pylons
    line(ot,[(3.6,0),(7.4,0)],w=1,col=LT,sy=1)
d.ellipse([ot[0]+3.6*K,ot[1]-0.45*K,ot[0]+7.5*K,ot[1]+0.45*K],outline=INK,width=2)   # canopy
d.text((ot[0],ot[1]-6.9*K),'TOP VIEW',font=f,fill=INK)
# ---- side view: origin at the nose tip's station, z up; ground at z=0
os_=(1260,560)
top=[(0,2.2),(1.0,2.45),(3.2,2.75),(3.4,2.8)]
canopy=[(3.4,2.8),(4.2,3.35),(5.0,3.6),(5.6,3.6),(6.3,3.72),(7.0,3.55),(7.6,3.15)]
hump=[(7.6,3.15),(9,3.1),(14,3.05),(16.5,2.8),(17.8,2.65)]
belly=[(17.8,1.75),(15,1.5),(10,1.45),(7.0,1.5),(5.0,1.65),(3.2,1.75),(1.0,2.0),(0,2.2)]
poly(os_,top+canopy+hump+belly)
line(os_,[(5.5,3.6),(5.5,2.85)],w=2)                       # the canopy frame between the seats
line(os_,[(3.4,2.8),(7.6,2.85)],w=1,col=LT)
# the intakes under the belly: lip at 6.0 m, round, 0.9 m across, ducts faired back to 10.5 m
poly(os_,[(6.0,1.5),(6.0,0.6),(6.35,0.58),(9.0,0.95),(10.5,1.45),(7,1.5)])
# wing (root chord on the side, mid fuselage), tailplane, fin, nozzle
poly(os_,[(7.8,2.25),(15.0,2.25),(15.0,2.1),(9.0,2.1)],w=2)
poly(os_,[(15.6,2.35),(17.6,2.35),(17.6,2.25),(16.0,2.25)],w=2)
poly(os_,[(14.8,3.0),(16.9,5.55),(17.8,5.55),(17.6,2.85)],w=3)
poly(os_,[(17.8,1.75),(19.0,1.85),(19.0,2.65),(17.8,2.65)])
# gear: nose twin wheels under the cockpit at 4.0 m, mains at 11.8 m
line(os_,[(4.0,1.65),(4.0,0.35)],w=4); circ(os_,(4.0,0.33),0.33)
line(os_,[(11.8,1.45),(11.8,0.45)],w=5); circ(os_,(11.8,0.45),0.45)
line(os_,[(-0.6,2.2),(0,2.2)],w=2)                         # pitot
line(os_,[(-1,0),(20,0)],w=1,col=LT)
d.text((os_[0],os_[1]-6.2*K),'SIDE VIEW',font=f,fill=INK)
# ---- front view: origin at the centreline on the ground, y to the page's right
of=(1810,1380)
d.ellipse([of[0]-1.3*K,of[1]-3.0*K,of[0]+1.3*K,of[1]-1.45*K],outline=INK,width=3)    # fuselage, 2.6 x 1.55
d.ellipse([of[0]-0.5*K,of[1]-3.75*K,of[0]+0.5*K,of[1]-2.75*K],outline=INK,width=3)   # canopy
for s in (1,-1):
    circ(of,(0.55*s,1.05),0.45); circ(of,(0.55*s,1.05),0.3,w=1,col=LT)                  # the round belly intakes
    poly(of,[(1.25*s,2.3),(6.2*s,2.3),(6.2*s,2.15),(1.25*s,2.15)],w=3)                  # the wing, flat
    line(of,[(1.25*s,2.3),(3.5*s,2.38)],w=2,col=LT)                                    # tailplane behind
    line(of,[(1.0*s,3.0),((1.0+2.6*math.tan(math.radians(8)))*s,5.55)],w=6)            # fin, canted 8° out
    for yy in (2.3,3.8,5.0): line(of,[(yy*s,2.15),(yy*s,1.85)],w=2)                    # pylons
    line(of,[(1.6*s,1.45),(1.6*s,0.45)],w=4); circ(of,(1.6*s,0.45),0.45)
line(of,[(0,1.45),(0,0.35)],w=4); circ(of,(0,0.33),0.33)
line(of,[(-7,0),(7,0)],w=1,col=LT)
d.text((of[0]-6.5*K,of[1]-7.0*K),'FRONT VIEW',font=f,fill=INK)
# dimensions
d.text((60,H-60),'ZF-25  ·  length 19.0 m  ·  span 12.4 m  ·  height 5.55 m  ·  fictional design',font=fs,fill=LT)
im.save('zf25_blueprint.png')
print('ok')
