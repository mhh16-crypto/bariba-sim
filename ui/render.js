import { C } from '../engine/constants.js';
import { other } from '../engine/coins.js';

export const px = (view, mm) => mm * view.scale;
export const screenX = (view, mm) => view.ox + mm * view.scale;
export const screenY = (view, mm) => view.oy + mm * view.scale;
export const worldPoint = (view, x, y) => ({ x: (x - view.ox) / view.scale, y: (y - view.oy) / view.scale });

export function drawField(ctx, view) {
  const x = screenX(view, 0), y = screenY(view, 0);
  const w = px(view, C.FIELD_W), h = px(view, C.FIELD_H);
  ctx.save();
  ctx.fillStyle = '#11110f';
  ctx.fillRect(x, y, w, h);

  ctx.fillStyle = 'rgba(239,81,71,.11)'; ctx.fillRect(x, y, w, h * .24);
  ctx.fillStyle = 'rgba(59,142,247,.11)'; ctx.fillRect(x, y + h * .76, w, h * .24);
  ctx.strokeStyle = 'rgba(255,255,255,.035)'; ctx.lineWidth = 1;
  for (let i = 1; i < 12; i++) {
    const yy = y + h * i / 12;
    ctx.beginPath();ctx.moveTo(x,yy);ctx.lineTo(x+w,yy);ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(245,200,76,.32)';ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y + h / 2);ctx.lineTo(x + w, y + h / 2);ctx.stroke();
  ctx.beginPath();ctx.arc(x+w/2,y+h/2,Math.min(w,h)*.12,0,Math.PI*2);ctx.stroke();
  ctx.strokeStyle = '#d7d1c5';ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.strokeStyle = '#ef5147';ctx.lineWidth = 4;
  ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.stroke();
  ctx.strokeStyle = '#3b8ef7';
  ctx.beginPath();ctx.moveTo(x,y+h);ctx.lineTo(x+w,y+h);ctx.stroke();

  if (w > 220) {
    ctx.fillStyle='rgba(255,255,255,.16)';ctx.textAlign='center';ctx.textBaseline='middle';
    ctx.font=`900 ${Math.max(9,Math.min(16,w*.03))}px system-ui,sans-serif`;
    ctx.fillText('P1 DEPLOY',x+w/2,y+h*.12);ctx.fillText('P2 DEPLOY',x+w/2,y+h*.88);
    ctx.fillStyle='rgba(245,200,76,.15)';ctx.font=`950 ${Math.max(16,Math.min(34,w*.07))}px system-ui,sans-serif`;
    ctx.fillText('BARIBA',x+w/2,y+h/2);
  }
  ctx.strokeStyle='rgba(245,200,76,.45)';ctx.lineWidth=2;
  const mark=Math.min(w,h)*.035;
  for(const [cx,cy,sx,sy] of [[x,y,1,1],[x+w,y,-1,1],[x,y+h,1,-1],[x+w,y+h,-1,-1]]){
    ctx.beginPath();ctx.moveTo(cx+sx*mark*2,cy);ctx.lineTo(cx,cy);ctx.lineTo(cx,cy+sy*mark*2);ctx.stroke();
  }
  ctx.restore();
}

export function drawCoin(ctx, view, coin, { dim = false, selected = false } = {}) {
  if (!coin.alive) return;
  const r = px(view, C.COIN_RADIUS);
  const cx = screenX(view, coin.x), cy = screenY(view, coin.y);
  const white = coin.ringUp === 'order';
  const released = coin.core === 'released';
  const flipped = coin.ringUp !== coin.side;
  const faceSide = coin.core === 'released' ? other(coin.side) : coin.side;
  const face = coin.def.faces[faceSide];

  ctx.save();
  ctx.globalAlpha = dim ? .35 : 1;
  ctx.translate(cx, cy);
  ctx.fillStyle='rgba(0,0,0,.5)';ctx.beginPath();ctx.ellipse(r*.12,r*.18,r*1.08,r*.94,0,0,Math.PI*2);ctx.fill();
  if (selected || released) { ctx.shadowColor = released ? '#f5c84c' : (coin.owner===0?'#ef5147':'#3b8ef7'); ctx.shadowBlur = released ? 26 : 16; }

  if(released){
    ctx.strokeStyle='#f5c84c';ctx.lineWidth=Math.max(2,r*.12);ctx.setLineDash([Math.max(3,r*.25),Math.max(2,r*.16)]);
    ctx.beginPath();ctx.arc(0,0,r*1.16,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }

  ctx.save();
  ctx.rotate(coin.theta);
  ctx.fillStyle = '#f0c33c';
  ctx.fillRect(r * .88, -r * .18, r * .34, r * .36);
  ctx.restore();

  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = white ? '#e8ebef' : '#252a31'; ctx.fill();
  ctx.strokeStyle = released ? '#f5c84c' : selected ? (coin.owner===0?'#ef5147':'#3b8ef7') : (white ? '#9da5ae' : '#080a0d');
  ctx.lineWidth = released || selected ? 3 : 1.5; ctx.stroke();

  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + coin.theta;
    ctx.strokeStyle = white ? '#aeb5bd' : '#444b55'; ctx.lineWidth = Math.max(1, r * .055);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * .78, Math.sin(a) * r * .78);
    ctx.lineTo(Math.cos(a) * r * .95, Math.sin(a) * r * .95);
    ctx.stroke();
  }

  ctx.beginPath(); ctx.arc(0, 0, r * .66, 0, Math.PI * 2);
  ctx.fillStyle = faceSide === 'order' ? '#b93731' : '#275d9c'; ctx.fill();
  ctx.strokeStyle = released ? '#f5c84c' : '#111820';
  ctx.lineWidth = released ? 3 : 1.2; ctx.stroke();

  ctx.beginPath();ctx.arc(0,-r*.2,r*.14,0,Math.PI*2);
  ctx.fillStyle=released?'#f5c84c':'#11110f';ctx.fill();
  if(released){
    ctx.strokeStyle='#fff4c2';ctx.lineWidth=Math.max(1,r*.055);
    for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.beginPath();ctx.moveTo(Math.cos(a)*r*.2,-r*.2+Math.sin(a)*r*.2);ctx.lineTo(Math.cos(a)*r*.3,-r*.2+Math.sin(a)*r*.3);ctx.stroke();}
  }
  if(flipped){
    ctx.strokeStyle='#fff';ctx.lineWidth=Math.max(1.5,r*.07);ctx.setLineDash([Math.max(2,r*.16),Math.max(2,r*.12)]);
    ctx.beginPath();ctx.arc(0,0,r*.82,0,Math.PI*2);ctx.stroke();ctx.setLineDash([]);
  }

  if (r >= 11) {
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 ${Math.max(7, r * .38)}px system-ui,sans-serif`;
    ctx.fillText(String(face.ox), 0, r * .14);
    ctx.font = `700 ${Math.max(6, r * .2)}px system-ui,sans-serif`;
    ctx.fillText(coin.def.rarity, -r * .38, -r * .38);
    if (coin.def.faces.order.ox !== coin.def.faces.xtreme.ox) {
      ctx.fillStyle = '#f4cf48'; ctx.fillText('M', r * .38, -r * .38);
    }
  }

  ctx.restore();
}

export function drawAim(ctx, view, coin, drag) {
  if (!drag) return;
  const cx = screenX(view, coin.x), cy = screenY(view, coin.y);
  const dx = drag.x - cx, dy = drag.y - cy;
  ctx.save();
  ctx.strokeStyle = '#ffd86a'; ctx.fillStyle = '#ffd86a'; ctx.lineWidth = 3;
  ctx.setLineDash([8, 6]);
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx - dx, cy - dy); ctx.stroke();
  ctx.setLineDash([]);
  const power = Math.min(1, Math.hypot(dx, dy) / 180);
  ctx.fillRect(cx - 45, cy + 36, 90 * power, 5);
  ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.strokeRect(cx - 45, cy + 36, 90, 5);
  ctx.restore();
}

export function drawRelocateExclusions(ctx, view, match, moving) {
  ctx.save();
  ctx.fillStyle = 'rgba(232,72,60,.15)';
  ctx.strokeStyle = 'rgba(232,72,60,.55)';
  for (const c of match.world.coins) {
    if (!c.alive || c === moving) continue;
    ctx.beginPath();
    ctx.arc(screenX(view, c.x), screenY(view, c.y), px(view, 4 * C.COIN_RADIUS), 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
  }
  ctx.restore();
}

export function drawFacingGuide(ctx, view, coin) {
  const cx = screenX(view, coin.x), cy = screenY(view, coin.y), len = px(view, 70);
  ctx.save();
  ctx.strokeStyle = '#ffd86a'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(cx, cy, px(view, 45), 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(coin.theta) * len, cy + Math.sin(coin.theta) * len); ctx.stroke();
  ctx.restore();
}
