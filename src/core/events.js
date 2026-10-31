// Sim -> presentation event queue. The sim only pushes; render/juice/audio drain once per frame.
(function (PB) {
  'use strict';
  function create() { return { list: [], total: 0 }; }
  function emit(bus, type, data) {
    data = data || {};
    data.type = type;
    bus.list.push(data);
    bus.total++;
    return data;
  }
  function drain(bus, fn) {
    var l = bus.list;
    bus.list = [];
    for (var i = 0; i < l.length; i++) fn(l[i]);
    return l.length;
  }
  PB.Events = { create: create, emit: emit, drain: drain };
})(globalThis.PB = globalThis.PB || {});
