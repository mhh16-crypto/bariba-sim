import test from 'node:test';
import assert from 'node:assert/strict';

import { beginPointerDrag, movePointerDrag, pointerDelta } from '../ui/pointer.js';

test('a drag only follows the pointer that started it', () => {
  const drag = beginPointerDrag('aim', 7, { x: 40, y: 50 });

  assert.equal(movePointerDrag(drag, 8, { x: 140, y: 150 }), false);
  assert.deepEqual({ x: drag.x, y: drag.y }, { x: 40, y: 50 });
  assert.equal(movePointerDrag(drag, 7, { x: 90, y: 110 }), true);
  assert.deepEqual({ x: drag.x, y: drag.y }, { x: 90, y: 110 });
});

test('shot delta uses the last tracked position when release occurs elsewhere', () => {
  const drag = beginPointerDrag('aim', 3, { x: 100, y: 100 });
  movePointerDrag(drag, 3, { x: 160, y: 180 });

  assert.deepEqual(pointerDelta(drag, { x: 100, y: 100 }, 8), {
    dx: 60,
    dy: 80,
    distance: 100,
  });
});

test('a drag below the shot threshold remains a cancelled aim', () => {
  const drag = beginPointerDrag('aim', 3, { x: 100, y: 100 });
  movePointerDrag(drag, 3, { x: 104, y: 106 });

  assert.equal(pointerDelta(drag, { x: 100, y: 100 }, 8), null);
});
