// Input queue between the browser and the sim. DOM-free so the contract is testable.
// Edge presses and RMB gestures stay queued until a sim tick that actually advances consumes them,
// so a press during hit-stop or between render frames runs exactly once.
(function (PB) {
  'use strict';
  function create() { return { pending: [], gestures: [], held: {}, move: { x: 0, y: 0 }, aim: { x: 0, y: 0 } }; }
  function press(q, action) { q.pending.push(action); }
  function gesture(q, g) { q.gestures.push(g); } // {kind:'click'|'drag', x, y, points?}
  function setHeld(q, action, down) { if (down) q.held[action] = true; else delete q.held[action]; }
  // Builds the InputFrame for the next tick without consuming anything.
  function peek(q) {
    var g = q.gestures[0] || null;
    return {
      move: { x: q.move.x, y: q.move.y }, aim: { x: q.aim.x, y: q.aim.y },
      pressed: q.pending.slice(), held: Object.keys(q.held).sort(),
      click: g && g.kind === 'click' ? { x: g.x, y: g.y } : null,
      drag: g && g.kind === 'drag' ? { points: g.points } : null,
      _n: q.pending.length, _g: g ? 1 : 0
    };
  }
  // Called only when World.step returned true for this frame. One RMB gesture per tick.
  function consume(q, frame) { q.pending.splice(0, frame._n); q.gestures.splice(0, frame._g); }
  PB.InputQueue = { create: create, press: press, gesture: gesture, setHeld: setHeld, peek: peek, consume: consume };
})(globalThis.PB = globalThis.PB || {});
