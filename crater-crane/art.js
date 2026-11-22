import { drawText } from '../solar-kite/src/font.js';
import { bins, hook, rover, hotBin, hoistTime } from './shift.js';

const backdrop = document.createElement('canvas');
backdrop.width = 320;
backdrop.height = 180;
const sky = backdrop.getContext('2d');
function box(g,x,y,w,h,color) {
  g.fillStyle = color;
  g.fillRect(Math.round(x),Math.round(y),w,h);
}
function line(g,x,y,u,v,color) {
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(u-x), Math.abs(v-y))));
  for (let i=0; i<=n; i++) box(g,x+(u-x)*i/n,y+(v-y)*i/n,1,1,color);
}
for (let y=0;y<180;y++) {
  const band = Math.floor(y/12);
  box(sky,0,y,320,1,`rgb(${11+band*3},${15+band*2},${43+band*4})`);
}
let seed=72;
function random() { seed=seed*16807%2147483647; return seed/2147483647; }
for(let i=0;i<130;i++) box(sky,random()*320,random()*112,1,1,i%5?'#8b95ba':'#ffe9bd');
// A distant auroral curtain. All terrain, atmospheric light and masonry are baked once.
for (let x=0; x<216; x++) {
  const crest = 46 + 10*Math.sin(x*.038) + 7*Math.sin(x*.067);
  const height = 8 + Math.round(12*(1+Math.sin(x*.11)));
  for (let y=0; y<height; y++) {
    sky.globalAlpha = .28*(y/height)**2*(1-x/216);
    box(sky,x,crest-height+y,1,1,'#43edce');
  }
}
sky.globalAlpha=1;
// Banded gas giant and a ring crossing in front of its lower hemisphere.
for(let y=-23;y<=23;y++) {
  const w=Math.floor(Math.sqrt(23*23-y*y));
  box(sky,248-w,47+y,2*w+1,1,['#ffb578','#e28c83','#ce7489','#f5a37e'][Math.floor((y+23)/5)%4]);
}
for (let y=-22; y<=22; y++) {
  const w=Math.floor(Math.sqrt(23*23-y*y));
  for(let x=-w; x<=w; x++) {
    const shade=(x+23)/46;
    if(x>8+4*Math.sin(y*.13) && random()<shade*.3) box(sky,248+x,47+y,1,1,'#a46081');
    if(x < -w+2) box(sky,248+x,47+y,1,1,'#ffdaa0');
  }
}
for(let i=0;i<720;i++) {
  const a=i*Math.PI/360, x=41*Math.cos(a), y=6*Math.sin(a);
  if(Math.sin(a)<0 && x*x+y*y<23*23) continue;
  box(sky,248+x,47+y-x*.26,2,2,'#ffdab0');
}
for(let x=0;x<320;x++) {
  const h=Math.round(105+10*Math.sin(x*.045)+6*Math.sin(x*.11));
  box(sky,x,h,1,150-h,'#454267');
  const near=Math.round(129+8*Math.sin(x*.071)+5*Math.cos(x*.14));
  box(sky,x,near,1,152-near,'#302f53');
}
box(sky,0,150,320,30,'#25253d');
for(let i=0;i<150;i++) box(sky,random()*320,152+random()*26,1+Math.floor(random()*6),1,'#414059');
// Pressure domes, striped refinery stacks and the freight line beneath the deck.
for (const x of [20,76,124,178,289]) {
  const h=7+Math.floor(random()*11);
  box(sky,x,138-h,9,h,'#4f506b'); box(sky,x+1,138-h,2,h,'#77718a');
  box(sky,x+1,140-h,7,2,'#a17785'); box(sky,x+4,135-h,1,3,'#c28d77');
}
for (const x of [24,125,193]) {
  for(let y=0;y<9;y++) {
    const w=Math.round(Math.sqrt(81-(8-y)**2)*1.8);
    box(sky,x-w,129+y,w*2+1,1,'#525976');
  }
  box(sky,x-13,135,26,2,'#788fa0');
  for(let j=-11;j<13;j+=5) box(sky,x+j,135,2,1,'#abd6cf');
}
box(sky,0,152,320,3,'#54516a'); box(sky,0,158,320,2,'#191c32');
for(let x=0;x<320;x+=16) {
  box(sky,x,153,8,1,'#b49883'); line(sky,x,155,x+4,159,'#797083');
  box(sky,x,169,11,2,'#39394f');
}
for (const x of [5,308]) {
  box(sky,x,29,7,120,'#535979');
  for(let y=32;y<143;y+=10) line(sky,x,y,x+6,y+8,'#afb0b8');
}
box(sky,5,27,310,5,'#737d97');
for(let x=6;x<311;x+=8) box(sky,x,28,4,2,'#313952');
for(const x of bins) {
  box(sky,x-12,144,24,5,'#7b7080');
  for(let j=-9;j<12;j+=5) box(sky,x+j,145,2,2,'#ffb557');
}
const cyan='#76fbe4', amber='#ffb54f', white='#fff3d0', dark='#14192f';
function cell(g,x,y,hot) {
  if(hot) {
    for(let i=-6;i<=6;i++) {
      const half=6-Math.abs(i);
      box(g,x-half,y+i,half*2+1,1,Math.abs(i)>3?'#e56e51':amber);
    }
    box(g,x-1,y-3,3,6,white);
  } else {
    box(g,x-7,y-5,14,10,'#346782'); box(g,x-7,y-5,14,2,cyan);
    box(g,x-6,y-3,2,8,'#51b7bc'); box(g,x-2,y-2,5,4,cyan);
  }
}
function payoff(g,e,age,reduced) {
  if(!e || age>.85) return;
  const color=e.credit===2?amber:cyan;
  if(!reduced && e.kind!=='miss') {
    const count=e.kind==='land'?16:8;
    for(let i=0;i<count;i++) {
      const angle=Math.PI*(i+.5)/count;
      const speed=22+(i%4)*10;
      const x=e.x+Math.cos(angle)*speed*age;
      const y=139-Math.sin(angle)*speed*age+26*age*age;
      if(y<147) box(g,x,y,age<.3?3:2,2,i%3?color:white);
    }
    if(e.kind==='catch' && age<.27) {
      const r=6+Math.round(30*age);
      for(const side of [-1,1]) {
        line(g,e.x+side*r,137,e.x+side*(r+3),132,color);
        line(g,e.x+side*(r+3),132,e.x+side*(r-1),133,white);
      }
    }
    if(e.kind==='land' && age<.5) {
      const span=Math.round(10+age*75);
      box(g,e.x-span,149,8,2,color); box(g,e.x+span-8,149,8,2,color);
    }
  }
  if(e.kind==='land') {
    const y=reduced?116:120-Math.round(age*13);
    const label=e.credit===2?'CORE +2':'+1';
    box(g,e.x-label.length*3-3,y-3,label.length*6+5,11,dark);
    drawText(g,label,e.x-label.length*3,y,color);
  }
}
export function draw(g,s,title,paused,reduced) {
  g.drawImage(backdrop,0,0);
  const rx=rover(s), hx=hook(s);
  const lowering=s.phase==='lower', hoisting=s.phase==='hoist';
  const lift=hoisting?Math.min(1,(s.time-s.event.time)/hoistTime):1;
  const tip=lowering?s.drop.x:hoisting?s.event.x+(hx-s.event.x)*lift:hx;
  const y=lowering?s.drop.y:hoisting?137-61*lift:76;
  const rail=lowering?tip:158+120*Math.sin(s.time*(.95+s.loads*.09)-.09);
  const carrying=hoisting || s.phase==='carry' || s.phase==='fall';
  const tint=carrying && s.hot?amber:cyan;
  for(let gy=Math.ceil(y+10);gy<139;gy+=8) box(g,tip,gy,1,3,'#7794a5');
  box(g,rail-8,28,17,7,'#a15f4a'); box(g,rail-7,28,15,3,'#ffd082');
  box(g,rail-4,35,9,3,'#8297a9'); box(g,rail+3,31,3,2,cyan);
  line(g,rail,37,tip,y,'#e8dcbe');
  box(g,tip-7,y-3,15,8,dark);
  box(g,tip-6,y-2,13,5,'#c9814d'); box(g,tip-6,y-2,13,2,'#ffe3a1');
  box(g,tip-6,y+2,3,4,tint); box(g,tip+4,y+2,3,4,tint);
  for(const hot of [false,true]) {
    const x=hot?hotBin(s):bins[s.cargo];
    if(carrying && s.hot===hot) continue;
    cell(g,x,138,hot);
    drawText(g,hot?'X2':'X1',x-5,153,hot?amber:cyan);
  }
  if(hoisting || s.phase==='carry') cell(g,tip,y+7,s.hot);
  if(s.phase==='fall') {
    if(!reduced) box(g,s.drop.x-1,s.drop.y-14,3,11,s.hot?'#d87548':'#449fa4');
    cell(g,s.drop.x,s.drop.y,s.hot);
  }
  box(g,rx-18,139,39,8,'#434f69'); box(g,rx-15,140,29,3,'#84b6bf');
  box(g,rx-16,135,3,7,cyan); box(g,rx+14,135,3,7,cyan);
  box(g,rx-6,138,13,3,amber); box(g,rx-2,136,5,2,white);
  box(g,rx+17,132,9,12,'#e39457'); box(g,rx+18,133,6,5,'#94efe6');
  for(const dx of [-12,-3,10,19]) {
    box(g,rx+dx,145,6,6,dark); box(g,rx+dx+1,146,4,3,'#8896a2');
  }
  if(s.event) payoff(g,s.event,s.time-s.event.time,reduced);
  if(title || paused || s.phase==='win' || s.phase==='lost') {
    const label=title?'CRATER CRANE':paused?'PAUSED':s.phase==='win'?'SHIFT COMPLETE':'SHIFT OVER';
    const w=label.length*12+14;
    box(g,(320-w)/2,89,w,21,dark); box(g,(320-w)/2,108,w,2,amber);
    drawText(g,label,Math.round((320-label.length*12)/2),95,white,2);
  }
  drawText(g,'LOADS '+s.loads+'/4',8,8,cyan);
  drawText(g,'MISSES '+s.misses+'/3',246,8,amber);
}
