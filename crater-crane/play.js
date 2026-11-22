import { bleed } from '../solar-kite/src/bleed.js';
import { act, newShift, step } from './shift.js';
import { draw } from './art.js';

const canvas=document.querySelector('#game');
const ctx=canvas.getContext('2d');
const action=document.querySelector('#action');
const pause=document.querySelector('#pause');
const status=document.querySelector('#status');
let shift=newShift(), title=true, paused=false, previous;
function sync() {
  const ended=shift.phase==='win' || shift.phase==='lost';
  pause.disabled=title || ended;
  pause.textContent=paused?'Resume':'Pause';
  action.disabled=paused || shift.phase==='lower' || shift.phase==='fall';
  action.textContent=title?'Start shift':ended?'New shift':shift.phase==='carry'?'Release cell':'Lower magnet';
  const hints={
    seek:'Lower over the glowing cell.', lower:'Magnet descending…',
    carry:'Lead the rover and release.', fall:'Cell falling…',
    win:'Four loads delivered. Shift complete!', lost:'Three misses. Shift over.',
  };
  status.textContent=title?'Space, tap or gamepad A to operate the crane.':paused?'Shift paused.':
    [shift.note,hints[shift.phase]].filter(Boolean).join(' ');
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
  if(!paused && !['win','lost'].includes(shift.phase)) {
    const phase=shift.phase;
    step(shift,dt);
    if(phase!==shift.phase) sync();
  }
  draw(ctx,shift,title,paused);
  requestAnimationFrame(frame);
}
sync();
requestAnimationFrame(frame);
bleed(canvas);
