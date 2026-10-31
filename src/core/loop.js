// Fixed-timestep accumulator. Pure: the browser feeds real elapsed time, tests feed fake time.
(function (PB) {
  'use strict';
  var DT = 1 / 60;

  function create(stepFn, opts) {
    opts = opts || {};
    return { acc: 0, dt: opts.dt || DT, maxSteps: opts.maxSteps || 5, stepFn: stepFn, steps: 0, dropped: 0 };
  }

  // Returns the number of sim steps run for this frame.
  function advance(loop, elapsedSec) {
    loop.acc += Math.min(Math.max(elapsedSec, 0), 0.25);
    var n = 0;
    while (loop.acc + 1e-9 >= loop.dt && n < loop.maxSteps) {
      loop.stepFn(loop.dt);
      loop.acc -= loop.dt;
      loop.steps++;
      n++;
    }
    if (loop.acc + 1e-9 >= loop.dt) { // spiral of death guard: drop the backlog
      loop.dropped += Math.floor(loop.acc / loop.dt);
      loop.acc = 0;
    }
    return n;
  }

  PB.DT = DT;
  PB.Loop = { create: create, advance: advance };
})(globalThis.PB = globalThis.PB || {});
