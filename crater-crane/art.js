import { drawText } from '../solar-kite/src/font.js';
import { bins, hook, rover } from './shift.js';

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
// Banded gas giant and a ring crossing in front of its lower hemisphere.
for(let y=-23;y<=23;y++) {
  const w=Math.floor(Math.sqrt(23*23-y*y));
  box(sky,248-w,54+y,2*w+1,1,['#ffb578','#e28c83','#ce7489','#f5a37e'][Math.floor((y+23)/5)%4]);
}
for(let i=0;i<720;i++) {
  const a=i*Math.PI/360, x=41*Math.cos(a), y=6*Math.sin(a);
  if(Math.sin(a)<0 && x*x+y*y<23*23) continue;
  box(sky,248+x,54+y-x*.26,2,2,'#ffdab0');
}
for(let x=0;x<320;x++) {
  const h=Math.round(105+10*Math.sin(x*.045)+6*Math.sin(x*.11));
  box(sky,x,h,1,150-h,'#454267');
  const near=Math.round(129+8*Math.sin(x*.071)+5*Math.cos(x*.14));
  box(sky,x,near,1,152-near,'#302f53');
}
box(sky,0,150,320,30,'#25253d');
for(let i=0;i<150;i++) box(sky,random()*320,152+random()*26,1+Math.floor(random()*6),1,'#414059');
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
function cell(g,x,y) {
  box(g,x-5,y-4,10,8,'#ffd078'); box(g,x-3,y-5,6,10,'#b86a4c');
  box(g,x-2,y-3,4,5,'#87ffdf'); box(g,x-1,y-2,2,2,'#fff5cc');
}
export function draw(g,s,title,paused) {
  g.drawImage(backdrop,0,0);
  const rx=rover(s), hx=hook(s), lowering=s.phase==='lower';
  const tip=lowering?s.drop.x:hx, y=lowering?s.drop.y:76;
  const rail=lowering?tip:158+120*Math.sin(s.time*(.95+s.loads*.09)-.09);
  box(g,rail-6,29,13,6,'#f2a950'); box(g,rail-3,35,7,3,'#727b92');
  line(g,rail,37,tip,y,'#c6d4e2');
  box(g,tip-4,y,9,3,'#ffb557'); box(g,tip-4,y+3,2,2,'#ffe1ad'); box(g,tip+3,y+3,2,2,'#ffe1ad');
  if(s.phase==='carry') cell(g,tip,y+8);
  else if(s.phase==='fall') cell(g,s.drop.x,s.drop.y);
  else cell(g,bins[s.cargo],139);
  box(g,rx-15,141,32,5,'#7189a3'); box(g,rx-16,136,3,7,'#9cf1e5'); box(g,rx+14,134,8,10,'#edab66');
  box(g,rx+15,135,5,4,'#79e1e4');
  for(const dx of [-9,0,12]) {box(g,rx+dx,146,5,5,'#0b1123'); box(g,rx+dx+1,147,2,2,'#8495a7');}
  if(title || paused || ['win','lost'].includes(s.phase)) {
    const label=title?'CRATER CRANE':paused?'PAUSED':s.phase==='win'?'SHIFT COMPLETE':'SHIFT OVER';
    const w=label.length*12+14;
    box(g,(320-w)/2,89,w,21,'#10162d'); box(g,(320-w)/2,108,w,2,'#ffb557');
    drawText(g,label,Math.round((320-label.length*12)/2),95,'#ffe4b2',2);
  }
  drawText(g,'LOADS '+s.loads+'/4',8,8,'#aff5e4');
  drawText(g,'MISSES '+s.misses+'/3',246,8,'#ffc378');
}
