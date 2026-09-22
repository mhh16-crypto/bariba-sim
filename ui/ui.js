import { C, FLIP } from '../engine/constants.js';
import { makeRng } from '../engine/rng.js';
import { attackOX, defenceOX, deckTotal } from '../engine/coins.js';
import { stepWorld, atRest } from '../engine/physics.js';
import { newMatch, beginShot, finishShot, applyPlacement, canRelocate, PHASE, OUT, SAFE_NONE, SAFE_RESET, SAFE_RELOCATE } from '../engine/rules.js';
import { drawField, drawCoin, drawAim, drawRelocateExclusions, drawFacingGuide, worldPoint, screenX, screenY } from './render.js';
import { beginPointerDrag, movePointerDrag, pointerDelta } from './pointer.js';

const $ = s => document.querySelector(s);
const canvas = $('#board'), ctx = canvas.getContext('2d');
const boardWrap = $('#boardWrap');
const setupEl = $('#setup');
const statusEl = $('#status'), hintEl = $('#hint'), playerCards = $('#playerCards'), logEl = $('#log');
const placementBanner = $('#placementBanner'), confirmPlacement = $('#confirmPlacement'), eventFlash = $('#eventFlash');
const pickerEl = $('#coinPicker'), pickerList = $('#pickerList'), pickerSearch = $('#pickerSearch'), pickerFilters = $('#pickerFilters');
const coinDefs = await fetch('./data/coins.json').then(r => { if (!r.ok) throw new Error(`coins.json ${r.status}`); return r.json(); });

if (new URLSearchParams(location.search).has('test')) {
  const { runBrowserTests } = await import('../test/browser.js');
  const r = runBrowserTests(coinDefs);
  document.body.innerHTML = `<pre style="padding:20px;font:14px/1.6 ui-monospace,monospace">${r.failed ? '❌' : '✅'} ${r.passed} passed, ${r.failed} failed\n\n${r.lines.join('\n')}</pre>`;
  throw new Error('browser smoke test mode');
}

let seed = (Date.now() >>> 0) || 1;
let rng = makeRng(seed);
let match = null;
let view = { scale: 1, ox: 0, oy: 0 };
let drag = null;
let animating = false;
let animationFrameId = null;
let animationGeneration = 0;
let eventFlashTimer = null;
let placementDraft = null;
let setupState = { janken: null, winnerSide: null, sides: null, first: null };
let selectedCoins = [[3, 4, 2], [15, 16, 14]];
let pickerState = { player: null, slot: null, query: '', rarity: 'ALL' };

function coinLabel(c) {
  const split = c.faces.order.ox === c.faces.xtreme.ox ? `${c.faces.order.ox}` : `O ${c.faces.order.ox} / X ${c.faces.xtreme.ox}`;
  return `${c.rarity} ${c.name} — ${split} — ${c.set}`;
}
function coinCardHtml(c, slot) {
  const meta = c.faces.order.ox !== c.faces.xtreme.ox;
  return `<div class="coin-card-grid"><span class="slot-no">0${slot+1}</span><div class="coin-copy"><strong>${c.rarity} ${c.name} ${meta ? '<span class="pill">META</span>' : ''}</strong><span class="sub">${c.set}</span></div><div class="coin-stats"><span class="coin-stat order"><small>ORDER</small><b>${c.faces.order.ox}</b></span><span class="coin-stat xtreme"><small>XTREME</small><b>${c.faces.xtreme.ox}</b></span></div></div>`;
}
function renderSelectedCoins() {
  for (const player of [0, 1]) {
    $(`#deck${player}`).innerHTML = selectedCoins[player].map((coinIndex, slot) =>
      `<button class="coin-card" data-player="${player}" data-slot="${slot}" type="button" aria-label="玩家 ${player + 1} 第 ${slot + 1} 顆硬幣">${coinCardHtml(coinDefs[coinIndex],slot)}</button>`
    ).join('');
    const total = deckTotal(selectedCoins[player].map(i => coinDefs[i]));
    const totalEl = $(`#deckTotal${player}`);
    totalEl.textContent = `Deck OX ${total.toLocaleString()} / 15,000`;
    totalEl.classList.toggle('invalid', total > 15000);
  }
  updateStartAvailability();
}

function decksAreValid() {
  return selectedCoins.every(deck => deck.length === 3 && deckTotal(deck.map(i => coinDefs[i])) <= 15000);
}

function updateStartAvailability() {
  const start = $('#start');
  if (start) start.disabled = !decksAreValid();
}
function renderFilters() {
  const filters = ['ALL', 'META', 'RR', 'BBR', 'BR', 'R', 'C'];
  pickerFilters.innerHTML = filters.map(f => `<button class="chip ${pickerState.rarity === f ? 'active' : ''}" data-filter="${f}" type="button">${f}</button>`).join('');
}
function matchesPicker(c) {
  const q = pickerState.query.trim().toLowerCase();
  const meta = c.faces.order.ox !== c.faces.xtreme.ox;
  if (pickerState.rarity === 'META' && !meta) return false;
  if (!['ALL', 'META'].includes(pickerState.rarity) && c.rarity !== pickerState.rarity) return false;
  return !q || [c.name, c.rarity, c.set, ...(c.variants || [])].join(' ').toLowerCase().includes(q);
}
function renderPicker() {
  renderFilters();
  const rows = coinDefs.map((c, i) => ({ c, i })).filter(({ c }) => matchesPicker(c));
  pickerList.innerHTML = rows.map(({ c, i }) => {
    const meta = c.faces.order.ox !== c.faces.xtreme.ox;
    return `<button class="picker-coin" data-coin-index="${i}" type="button"><div class="picker-name"><strong><span class="rarity">${c.rarity}</span>${c.name}${meta ? ' <span class="pill">META</span>' : ''}</strong><div class="picker-set">${c.set}</div></div><div class="face-values"><span class="face-value order"><small>ORDER</small><b>${c.faces.order.ox}</b></span><span class="face-value xtreme"><small>XTREME</small><b>${c.faces.xtreme.ox}</b></span></div></button>`;
  }).join('') || '<div class="sub">沒有符合條件的硬幣。</div>';
}
function openPicker(player, slot) {
  pickerState = { player, slot, query: '', rarity: 'ALL' };
  pickerSearch.value = '';
  $('#pickerTitle').textContent = `玩家 ${player + 1} · 第 ${slot + 1} 顆硬幣`;
  renderPicker();
  pickerEl.classList.remove('hidden');
  pickerEl.setAttribute('aria-hidden', 'false');
  pickerSearch.focus({ preventScroll: true });
}
function closePicker() {
  pickerEl.classList.add('hidden');
  pickerEl.setAttribute('aria-hidden', 'true');
  pickerState.player = null;
  pickerState.slot = null;
}
for (const player of [0, 1]) $(`#deck${player}`).addEventListener('click', ev => {
  const btn = ev.target.closest('[data-slot]');
  if (btn) openPicker(player, Number(btn.dataset.slot));
});
$('#closePicker').addEventListener('click', closePicker);
pickerEl.addEventListener('click', ev => { if (ev.target === pickerEl) closePicker(); });
pickerSearch.addEventListener('input', ev => { pickerState.query = ev.target.value; renderPicker(); });
pickerFilters.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-filter]');
  if (!btn) return;
  pickerState.rarity = btn.dataset.filter;
  renderPicker();
});
pickerList.addEventListener('click', ev => {
  const btn = ev.target.closest('[data-coin-index]');
  if (!btn || pickerState.player == null || pickerState.slot == null) return;
  selectedCoins[pickerState.player][pickerState.slot] = Number(btn.dataset.coinIndex);
  renderSelectedCoins();
  closePicker();
});
renderSelectedCoins();

const setupStepIds = { janken:'jankenStep', side:'sideStep', toss:'tossStep', ready:'startStep' };
const setupStepOrder = Object.keys(setupStepIds);
function setSetupStep(step){
  for(const [name,id] of Object.entries(setupStepIds)) $(`#${id}`).classList.toggle('hidden',name!==step);
  const current=setupStepOrder.indexOf(step);
  document.querySelectorAll('[data-flow]').forEach(el=>{
    const index=setupStepOrder.indexOf(el.dataset.flow);
    el.classList.toggle('current',index===current);el.classList.toggle('done',index<current);
  });
}
setSetupStep('janken');

document.querySelectorAll('[data-janken]').forEach(b=>b.addEventListener('click',()=>{
  setupState.janken = Number(b.dataset.janken);
  setupState.winnerSide=null;setupState.sides=null;setupState.first=null;
  document.querySelectorAll('[data-janken]').forEach(x=>x.classList.toggle('primary',x===b));
  document.querySelectorAll('[data-side]').forEach(x=>x.classList.remove('primary'));
  setSetupStep('side');
}));
document.querySelectorAll('[data-side]').forEach(b=>b.addEventListener('click',()=>{
  if (setupState.janken == null) return;
  setupState.winnerSide = b.dataset.side;
  const loserSide = b.dataset.side === 'order' ? 'xtreme' : 'order';
  setupState.sides = setupState.janken === 0 ? [b.dataset.side, loserSide] : [loserSide, b.dataset.side];
  setupState.first=null;
  document.querySelectorAll('[data-side]').forEach(x=>x.classList.toggle('primary',x===b));
  $('#tossInfo').textContent = `玩家 ${setupState.janken+1} 選擇 ${b.dataset.side.toUpperCase()}。旋轉該玩家的硬幣；若落下時所選陣營朝上，該玩家先攻。`;
  setSetupStep('toss');
}));
$('#toss').addEventListener('click',()=>{
  const chosenUp = rng() < .5;
  setupState.first = chosenUp ? setupState.janken : 1 - setupState.janken;
  $('#startInfo').innerHTML = `${chosenUp ? '所選陣營朝上' : '相反陣營朝上'} → <strong>玩家 ${setupState.first+1} 先攻</strong>`;
  setSetupStep('ready');
});
document.querySelectorAll('[data-setup-back]').forEach(b=>b.addEventListener('click',()=>setSetupStep(b.dataset.setupBack)));
$('#start').addEventListener('click', startMatch);

function startMatch() {
  if (!setupState.sides || setupState.first == null) return;
  if (!decksAreValid()) return;
  const defs = selectedCoins.map(deck => deck.map(index => coinDefs[index]));
  match = newMatch({ defs, sides: setupState.sides, first: setupState.first });
  rng = makeRng(seed);
  logEl.innerHTML = '';
  addLog(`Seed ${seed} · 玩家 ${match.turn+1} 先攻`);
  setupEl.classList.add('hidden');
  updateHud(); draw();
}

function resetSetupFlow({ newSeed = false } = {}) {
  animationGeneration++;
  if (animationFrameId != null) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  if(eventFlashTimer!=null)clearTimeout(eventFlashTimer);
  eventFlashTimer=null;eventFlash.classList.add('hidden');
  if (newSeed) seed = (Math.random() * 2 ** 32) >>> 0;
  rng = makeRng(seed);
  match = null;
  drag = null;
  animating = false;
  placementDraft = null;
  setupState = { janken: null, winnerSide: null, sides: null, first: null };
  logEl.innerHTML = '';
  setupEl.classList.remove('hidden');
  setSetupStep('janken');
  document.querySelectorAll('[data-janken],[data-side]').forEach(x => x.classList.remove('primary'));
  renderSelectedCoins();
  updatePlacementUi();
  updateHud();
  draw();
}

function resize() {
  const rect = boardWrap.getBoundingClientRect();
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(rect.width * dpr));
  canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  canvas.style.width = `${rect.width}px`; canvas.style.height = `${rect.height}px`;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const pad = 28;
  const scale = Math.min((rect.width-pad*2)/C.FIELD_W,(rect.height-pad*2)/C.FIELD_H);
  view = { scale, ox:(rect.width-C.FIELD_W*scale)/2, oy:(rect.height-C.FIELD_H*scale)/2 };
  draw();
}
new ResizeObserver(resize).observe(boardWrap);

function draw() {
  const rect = boardWrap.getBoundingClientRect();
  ctx.clearRect(0,0,rect.width,rect.height);
  drawField(ctx,view);
  if (!match) return;
  const placement = currentPlacement();
  if (placement?.kind === SAFE_RELOCATE && placementDraft?.stage === 'move') drawRelocateExclusions(ctx,view,match,placement.coin);
  for (const c of match.world.coins) drawCoin(ctx,view,c,{ selected: placement?.coin===c || (!animating && match.phase===PHASE.AIM && c.owner===match.turn) });
  if (drag?.mode === 'aim') drawAim(ctx,view,drag.coin,{x:drag.x,y:drag.y});
  if (placement && placementDraft?.stage === 'face') drawFacingGuide(ctx,view,placement.coin);
}

function updateHud() {
  if (!match) {
    statusEl.textContent = '準備中';
    hintEl.textContent = '請完成對戰設定。';
    playerCards.innerHTML = '';
    updatePlacementUi();
    return;
  }
  if (match.phase === PHASE.GAME_OVER) {
    statusEl.textContent = match.winner === 'draw' ? '平手' : `玩家 ${match.winner+1} 勝利`;
    hintEl.textContent = '這場對戰已結束。';
  } else if (match.phase === PHASE.PLACEMENT) {
    statusEl.textContent = `玩家 ${match.turn+1}：SAFE 處理`;
    hintEl.textContent = currentPlacement()?.kind === SAFE_RELOCATE ? '先把硬幣搬到合法位置，再選擇朝向。' : '硬幣已回到射擊前位置；請選擇朝向。';
  } else if (animating) {
    statusEl.textContent = '模擬中…'; hintEl.textContent = '等待所有硬幣停下。';
  } else {
    statusEl.textContent = `玩家 ${match.turn+1} 的回合`;
    hintEl.textContent = '從自己的硬幣往後拖曳再放開。射擊方向與拖曳方向相反。';
  }
  playerCards.innerHTML = [0, 1].map(owner => {
    const coins = match.world.coins.filter(c => c.owner === owner);
    const alive = coins.filter(c => c.alive).length;
    const rows = coins.map(c=>{
      const flipped=c.ringUp!==c.side;
      const stateClass=!c.alive?'out':c.core==='released'?(flipped?'flipped':'unlocked'):'set';
      const stateLabel=!c.alive?'OUT':c.core==='released'?(flipped?'解鎖＋翻面':'核心解鎖'):'核心鎖定';
      return `<div class="player ${stateClass}"><div class="player-name"><strong>${c.def.rarity} ${c.def.name}</strong><div class="state-row"><span class="state-badge ${stateClass}">${stateLabel}</span><span class="face-badge ${c.ringUp}">${c.ringUp.toUpperCase()} 朝上</span></div></div><div class="ox">ATK <strong>${attackOX(c)}</strong><br>DEF <strong>${defenceOX(c)}</strong></div></div>`;
    }).join('');
    return `<section class="team p${owner + 1}"><div class="team-head"><span>玩家 ${owner + 1}</span><span>${alive} / 3</span></div>${rows}</section>`;
  }).join('');
  updatePlacementUi();
}

function addLog(s) {
  const d=document.createElement('div'); d.textContent=s; logEl.appendChild(d); logEl.scrollTop=logEl.scrollHeight;
}
function resultName(r){ return r===OUT?'OUT':r===SAFE_NONE?'SAFE':r===SAFE_RESET?'SAFE · 回原位':r===SAFE_RELOCATE?'SAFE · 場內重置':r; }
function showEventFlash(title,detail,flipped=false){
  if(eventFlashTimer!=null)clearTimeout(eventFlashTimer);
  eventFlash.replaceChildren();
  const strong=document.createElement('strong');strong.textContent=title;
  const span=document.createElement('span');span.textContent=detail;
  eventFlash.append(strong,span);eventFlash.classList.toggle('flipped',flipped);eventFlash.classList.remove('hidden');
  eventFlashTimer=setTimeout(()=>eventFlash.classList.add('hidden'),1800);
}
function logResolution(shooter, resolutions, events) {
  const releases=events.filter(e=>e.type==='release');
  for (const e of releases) addLog(`P${e.coin.owner+1} ${e.coin.def.name}：核心解除${e.flipped?' · 翻面':' · 未翻面'} · hit ${(e.squareness*100).toFixed(0)}%`);
  if(releases.length){
    const flipped=releases.some(e=>e.flipped);const names=releases.map(e=>e.coin.def.name).join('、');
    showEventFlash(flipped?'CORE UNLOCK + FLIP':'CORE UNLOCK',`${names} · ${flipped?'硬幣已翻面':'硬幣未翻面'}`,flipped);
  }
  for (const {coin,result} of resolutions) {
    const bits=[`P${coin.owner+1} ${coin.def.name}`,coin.core==='released'?'解除':'SET',coin.ringUp!==coin.side?'翻面':'未翻面'];
    if (coin.owner!==shooter.owner && coin.core==='released' && coin.ringUp===coin.side) bits.push(`OX ${attackOX(shooter)} → ${defenceOX(coin)}`);
    bits.push(resultName(result)); addLog(bits.join(' · '));
  }
}

function pointerPos(ev){ const r=canvas.getBoundingClientRect(); return {x:ev.clientX-r.left,y:ev.clientY-r.top}; }
function hitCoin(p,c){ return Math.hypot(p.x-screenX(view,c.x),p.y-screenY(view,c.y)) <= Math.max(28,C.COIN_RADIUS*view.scale*1.4); }
function insideCanvas(p){ return p.x>=0&&p.y>=0&&p.x<=canvas.clientWidth&&p.y<=canvas.clientHeight; }

canvas.addEventListener('pointerdown', ev=>{
  if (!match || drag || animating || match.phase===PHASE.GAME_OVER) return;
  const p=pointerPos(ev);
  if (match.phase===PHASE.AIM) {
    const c=match.world.coins.find(c=>c.alive&&c.owner===match.turn&&hitCoin(p,c));
    if (c) drag=beginPointerDrag('aim',ev.pointerId,p,{coin:c});
  } else if (match.phase===PHASE.PLACEMENT) {
    const pl=currentPlacement(); if(!pl) return;
    if (placementDraft?.stage==='move') drag=beginPointerDrag('move',ev.pointerId,p,{coin:pl.coin});
    else if (placementDraft?.stage==='face'&&hitCoin(p,pl.coin)) drag=beginPointerDrag('face',ev.pointerId,p,{coin:pl.coin});
  }
  if (!drag) return;
  canvas.setPointerCapture?.(ev.pointerId);
  ev.preventDefault();
  draw();
});
window.addEventListener('pointermove', ev=>{
  if (!match || animating) return;
  const p=pointerPos(ev);
  if (drag && !movePointerDrag(drag,ev.pointerId,p)) return;
  if (drag?.mode==='aim') { draw(); }
  else if (drag?.mode==='move') {
    const wp=worldPoint(view,p.x,p.y); const pl=currentPlacement();
    if (pl && canRelocate(match,pl.coin,wp.x,wp.y)) { pl.coin.x=wp.x;pl.coin.y=wp.y; placementDraft.valid=true; }
    else placementDraft.valid=false;
    draw();
  } else if (drag?.mode==='face'||(!drag&&ev.pointerType==='mouse'&&insideCanvas(p)&&match.phase===PHASE.PLACEMENT&&placementDraft?.stage==='face')) {
    setFacingFromPointer(drag?.coin??currentPlacement().coin,p);draw();
  }
});
function releasePointer(ev) {
  if (canvas.hasPointerCapture?.(ev.pointerId)) canvas.releasePointerCapture(ev.pointerId);
}

function finishPointerGesture(ev, point=pointerPos(ev)) {
  if (!match || animating || !drag || drag.pointerId!==ev.pointerId) return;
  movePointerDrag(drag,ev.pointerId,point);
  const gesture=drag; drag=null;
  releasePointer(ev);
  if (gesture.mode==='aim') {
    const c=gesture.coin;
    const delta=pointerDelta(gesture,{x:screenX(view,c.x),y:screenY(view,c.y)},8);
    if (!delta) { draw(); return; }
    const power=Math.min(1,delta.distance/180); const speed=power*C.MAX_SHOT_SPEED;
    shoot(c,-delta.dx/delta.distance*speed,-delta.dy/delta.distance*speed);
  } else if (gesture.mode==='move') { draw(); updatePlacementUi(); }
  else if (gesture.mode==='face') {
    if(pointerDelta(gesture,{x:gesture.startX,y:gesture.startY},12)===null){draw();return;}
    setFacingFromPointer(gesture.coin,gesture);
    commitCurrentPlacement();
  }
}
window.addEventListener('pointerup', finishPointerGesture);

function cancelPointer(ev) {
  if (!drag || drag.pointerId!==ev.pointerId) return;
  releasePointer(ev);
  drag = null;
  draw();
  updatePlacementUi();
}
window.addEventListener('pointercancel', cancelPointer);
canvas.addEventListener('lostpointercapture', ev => {
  if (drag?.pointerId===ev.pointerId && ev.buttons===0) {
    finishPointerGesture(ev,{x:drag.x,y:drag.y});
  }
});
boardWrap.addEventListener('touchmove', ev => ev.preventDefault(), { passive: false });
for (const eventName of ['gesturestart', 'gesturechange', 'gestureend']) {
  boardWrap.addEventListener(eventName, ev => ev.preventDefault(), { passive: false });
}

function shoot(coin,vx,vy){
  const idx=match.world.coins.indexOf(coin); const shooter=beginShot(match,{coinIndex:idx,vx,vy});
  const generation = animationGeneration;
  animating=true; updateHud();
  let last=performance.now(),acc=0;
  function frame(now){
    if (generation !== animationGeneration || !match) return;
    acc+=Math.min(.05,(now-last)/1000); last=now;
    while(acc>=C.DT && !atRest(match.world) && match.world.t<C.MAX_SIM_SECONDS){stepWorld(match.world,rng);acc-=C.DT;}
    draw();
    if(atRest(match.world)||match.world.t>=C.MAX_SIM_SECONDS){
      if(match.world.t>=C.MAX_SIM_SECONDS){for(const c of match.world.coins){c.vx=0;c.vy=0;c.omega=0;} addLog('模擬達到時間上限，強制結束移動');}
      animationFrameId=null;
      const out=finishShot(match,shooter); animating=false; logResolution(shooter,out.resolutions,out.events);
      if(match.phase===PHASE.PLACEMENT) enterPlacement(); updateHud(); draw();
    }else animationFrameId=requestAnimationFrame(frame);
  }
  animationFrameId=requestAnimationFrame(frame);
}

function currentPlacement(){ return match?.pendingPlacements?.[0] ?? null; }
function findLegalRelocation(coin){
  for(let y=80;y<=C.FIELD_H-80;y+=80)for(let x=80;x<=C.FIELD_W-80;x+=80)if(canRelocate(match,coin,x,y))return{x,y};
  return{x:C.FIELD_W/2,y:C.FIELD_H/2};
}
function enterPlacement(){
  const pl=currentPlacement(); if(!pl){placementDraft=null;return;}
  if(pl.kind===SAFE_RESET){ pl.coin.x=pl.origin.x;pl.coin.y=pl.origin.y;placementDraft={stage:'face',valid:true}; }
  else { const p=findLegalRelocation(pl.coin);pl.coin.x=p.x;pl.coin.y=p.y;placementDraft={stage:'move',valid:true}; }
}
function setFacingFromPointer(coin,p){ coin.theta=Math.atan2(p.y-screenY(view,coin.y),p.x-screenX(view,coin.x)); }
function commitCurrentPlacement(){
  const pl=currentPlacement();if(!pl)return;
  applyPlacement(match,pl,{x:pl.coin.x,y:pl.coin.y,theta:pl.coin.theta});
  if(match.phase===PHASE.PLACEMENT)enterPlacement();else placementDraft=null;
  updateHud();draw();
}
function confirmPlacementStep(){
  const pl=currentPlacement();if(!pl)return;
  if(pl.kind===SAFE_RELOCATE&&placementDraft?.stage==='move'){
    if(!placementDraft.valid)return;
    placementDraft.stage='face';updatePlacementUi();draw();return;
  }
  commitCurrentPlacement();
}
function updatePlacementUi(){
  const pl=currentPlacement(); const active=match?.phase===PHASE.PLACEMENT&&pl;
  const moving=active&&pl.kind===SAFE_RELOCATE&&placementDraft?.stage==='move';
  placementBanner.classList.toggle('hidden',!active);confirmPlacement.classList.toggle('hidden',!moving);
  if(!active)return;
  if(moving){
    placementBanner.textContent=`P${match.turn+1}：拖曳 ${pl.coin.def.name} 到場內（與其他硬幣中心至少 86mm）`;
    confirmPlacement.textContent='確定位置';confirmPlacement.disabled=!placementDraft.valid;
  }else{placementBanner.textContent=`P${match.turn+1}：指向／拖向 ${pl.coin.def.name} 的リバースイッチ朝向，放手或按 Space 確定`;}
}
confirmPlacement.addEventListener('click',confirmPlacementStep);
document.addEventListener('keydown',ev=>{
  if(ev.code!=='Space'||ev.repeat||ev.target.closest?.('input,textarea,select,button,[contenteditable="true"]'))return;
  if(match?.phase!==PHASE.PLACEMENT)return;
  ev.preventDefault();confirmPlacementStep();
});

function buildDev(){
  const host=$('#devGrid');
  const fields=[
    ['Seed',()=>seed,v=>{seed=(Number(v)>>>0)||1;rng=makeRng(seed)}],
    ['FRICTION_K',()=>C.FRICTION_K,v=>C.FRICTION_K=Number(v)],
    ['OMEGA_FRICTION_K',()=>C.OMEGA_FRICTION_K,v=>C.OMEGA_FRICTION_K=Number(v)],
    ['RESTITUTION',()=>C.RESTITUTION,v=>C.RESTITUTION=Number(v)],
    ['SPIN_COUPLING',()=>C.SPIN_COUPLING,v=>C.SPIN_COUPLING=Number(v)],
    ['MAX_SHOT_SPEED',()=>C.MAX_SHOT_SPEED,v=>C.MAX_SHOT_SPEED=Number(v)],
    ['RELEASE_IMPULSE_MIN',()=>C.RELEASE_IMPULSE_MIN,v=>C.RELEASE_IMPULSE_MIN=Number(v)],
    ['SECTOR°',()=>C.SECTOR_HALF_ANGLE*180/Math.PI,v=>C.SECTOR_HALF_ANGLE=Number(v)*Math.PI/180],
    ['FLIP.base',()=>FLIP.base,v=>FLIP.base=Number(v)],
    ['FLIP.depthGain',()=>FLIP.depthGain,v=>FLIP.depthGain=Number(v)],
    ['FLIP.force.min',()=>FLIP.forceBand.min,v=>FLIP.forceBand.min=Number(v)],
    ['FLIP.force.ideal',()=>FLIP.forceBand.ideal,v=>FLIP.forceBand.ideal=Number(v)],
    ['FLIP.force.max',()=>FLIP.forceBand.max,v=>FLIP.forceBand.max=Number(v)],
    ['FLIP.forcePenalty',()=>FLIP.forcePenalty,v=>FLIP.forcePenalty=Number(v)]
  ];
  for(const [name,get,set] of fields){const l=document.createElement('label');l.textContent=name;const inp=document.createElement('input');inp.type='number';inp.step=name==='Seed'?'1':'0.01';inp.value=String(get());inp.addEventListener('change',()=>set(inp.value));host.append(l,inp);}
}
buildDev();
$('#newSeed').addEventListener('click',()=>{seed=(Math.random()*2**32)>>>0;rng=makeRng(seed);addLog(`Seed → ${seed}`);});
$('#restart').addEventListener('click',()=>resetSetupFlow());
$('#quickRestart').addEventListener('click',()=>resetSetupFlow());

updateHud(); resize();
