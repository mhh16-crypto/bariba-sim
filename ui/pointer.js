export function beginPointerDrag(mode, pointerId, point, extra = {}) {
  return {
    mode,
    pointerId,
    x: point.x,
    y: point.y,
    startX: point.x,
    startY: point.y,
    ...extra,
  };
}

export function movePointerDrag(drag, pointerId, point) {
  if (!drag || drag.pointerId !== pointerId) return false;
  drag.x = point.x;
  drag.y = point.y;
  return true;
}

export function pointerDelta(drag, origin, minDistance = 0) {
  const dx = drag.x - origin.x;
  const dy = drag.y - origin.y;
  const distance = Math.hypot(dx, dy);
  return distance < minDistance ? null : { dx, dy, distance };
}
