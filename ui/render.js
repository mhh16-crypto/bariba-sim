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
  const grad = ctx.createLinearGradient(x, y, x, y + h);
  grad.addColorStop(0, '#171a1f');
  grad.addColorStop(1, '#0d0f13');
  ctx.fillStyle = grad;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#e4483c';
  ctx.setLineDash([12, 8]);
  ctx.lineWidth = 2;
  ctx.strokeRect(x, y, w, h);
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,255,255,.07)';
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y); ctx.lineTo(x + w / 2, y + h);
  ctx.moveTo(x, y + h / 2); ctx.lineTo(x + w, y + h / 2);
  ctx.stroke();
  ctx.restore();
}

export function drawCoin(ctx, view, coin, { dim = false, selected = false } = {}) {
  if (!coin.alive) return;
  const r = px(view, C.COIN_RADIUS);
  const cx = screenX(view, coin.x), cy = screenY(view, coin.y);
  const white = coin.ringUp === 'order';
  const faceSide = coin.core === 'released' ? other(coin.side) : coin.side;
  const face = coin.def.faces[faceSide];

  ctx.save();
  ctx.globalAlpha = dim ? .35 : 1;
  ctx.translate(cx, cy);
  if (selected) { ctx.shadowColor = '#ffd86a'; ctx.shadowBlur = 18; }

  ctx.save();
  ctx.rotate(coin.theta);
  ctx.fillStyle = '#f0c33c';
  ctx.fillRect(r * .88, -r * .18, r * .34, r * .36);
  ctx.restore();

  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = white ? '#e8ebef' : '#252a31'; ctx.fill();
  ctx.strokeStyle = selected ? '#ffd86a' : (white ? '#9da5ae' : '#080a0d');
  ctx.lineWidth = selected ? 3 : 1.5; ctx.stroke();

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
  ctx.strokeStyle = coin.core === 'released' ? '#f0c33c' : '#111820';
  ctx.lineWidth = coin.core === 'released' ? 2.5 : 1.2; ctx.stroke();

  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.max(8, r * .25)}px system-ui,sans-serif`;
  ctx.fillText(face.label, 0, -r * .10);
  ctx.font = `900 ${Math.max(10, r * .38)}px system-ui,sans-serif`;
  ctx.fillText(String(face.ox), 0, r * .30);
  ctx.font = `700 ${Math.max(7, r * .20)}px system-ui,sans-serif`;
  ctx.fillText(coin.def.rarity, -r * .42, -r * .42);
  if (coin.def.faces.order.ox !== coin.def.faces.xtreme.ox) {
    ctx.fillStyle = '#f4cf48'; ctx.fillText('M', r * .42, -r * .42);
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
