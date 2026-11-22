import { bleed } from '../solar-kite/src/bleed.js';
import { act, newShift, step } from './shift.js';
import { draw } from './art.js';

const motion = matchMedia('(prefers-reduced-motion: reduce)');
const canvas=document.querySelector('#game');
const ctx=canvas.getContext('2d');
const action=document.querySelector('#action');
const pause=document.querySelector('#pause');
const status=document.querySelector('#status');
let shift=newShift(), title=true, paused=false, previous;
const portrait=matchMedia('(orientation:portrait) and (max-width:650px)');
function sizeYard() {
  const height=portrait.matches?Math.max(181,Math.round(canvas.clientHeight*320/canvas.clientWidth)):180;
  if(canvas.height!==height) canvas.height=height;
  draw(ctx,shift,title,paused,motion.matches);
}
new ResizeObserver(sizeYard).observe(canvas);
function sync() {
  document.querySelector('#loads').textContent='Loads '+shift.loads+'/4';
  document.querySelector('#misses').textContent='Misses '+shift.misses+'/3';
  const ended=shift.phase==='win' || shift.phase==='lost';
  pause.disabled=title || ended;
  pause.textContent=paused?'Resume':'Pause';
  action.disabled=paused || shift.phase==='lower' || shift.phase==='hoist' || shift.phase==='fall';
  action.textContent=title?'Start shift':ended?'New shift':shift.phase==='carry'?'Release cell':'Lower magnet';
  const hints={
    seek:'Cyan crate: 1 load. Amber core: 2, center socket only.', lower:'Magnet descending…',
    hoist:'Winching up…', carry:shift.hot?'Lead the rover. Aim for its amber socket.':'Lead the rover. Aim inside the cyan rails.', fall:'Cell falling…',
    win:'Four loads delivered. Shift complete!', lost:'Three misses. Shift over.',
  };
  status.textContent=title?'Tap, Space or gamepad A. Ship four loads.':paused?'Shift paused.':
    [shift.note,hints[shift.phase]].filter(Boolean).join(' ');
  if(portrait.matches && !paused) {
    const short={seek:shift.note || 'Pick a crate or precision core.', lower:'Lowering magnet…',
      hoist:'Winching up…', carry:shift.hot?'Aim for the amber center.':'Aim between the cyan rails.',
      fall:'Cell falling…', win:hints.win, lost:hints.lost};
    status.textContent=title?'Deliver four loads. Cores need the center socket.':short[shift.phase];
  }
}
function operate() {
  if(paused) return;
  if(title || shift.phase==='win' || shift.phase==='lost') {
    shift=newShift();
    title=false;
    previous=undefined;
  } else act(shift);
  sync();
}
function togglePause() {
  if(pause.disabled) return;
  paused=!paused;
  draw(ctx,shift,title,paused,motion.matches);
  previous=undefined;
  sync();
}
action.onclick=operate;
canvas.onclick=operate;
pause.onclick=togglePause;
document.addEventListener('keydown',e=>{
  if(e.repeat) return;
  if(e.code==='Space' && document.activeElement!==pause) { e.preventDefault(); operate(); }
  if(e.code==='KeyP' || e.code==='Escape') togglePause();
});
document.addEventListener('visibilitychange',()=>{if(document.hidden && !paused && !pause.disabled) togglePause();});
document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
let padHeld=false;
function frame(now) {
  const pressed=Array.from(navigator.getGamepads?.() || []).some(p=>p?.buttons[0]?.pressed);
  if(pressed && !padHeld) operate();
  padHeld=pressed;
  const dt=Math.min(.05,(now-(previous??now))/1000);
  previous=now;
  const ended=shift.phase==='win' || shift.phase==='lost';
  const settling=ended && shift.time-shift.event.time<.9;
  if(!paused && (!ended || settling)) {
    const phase=shift.phase;
    if(ended) shift.time+=dt;
    else step(shift,dt);
    if(phase!==shift.phase) sync();
  }
  if(!paused && (!ended || settling)) draw(ctx,shift,title,paused,motion.matches);
  requestAnimationFrame(frame);
}
portrait.addEventListener('change',sync);
sync();
requestAnimationFrame(frame);
bleed(canvas);
