// The sculpted sprite baker: renders the 3D rigs (rigs.js) with a WebGL2 signed-distance raymarcher into the same
// kind of sprite sheets sprites.js makes (16 run frames, about 3x supersampled), plus terrain props, canopy crowns and
// the zone ground. One shader serves every creature and prop: the rig's primitives arrive as uniforms, so it compiles
// once (in the background, where the browser allows). Creatures bake a frame at a time between game frames, best
// first (the druid and the base pack, then the current zone); each finished sheet replaces the flat one in the atlas.
// Without WebGL2 (or under node) nothing here runs and the flat drawings stay. Presentation only: never reads the sim.
(function (PB) {
  'use strict';
  var FRAMES = 16, PITCH = 0.5, YAW = 0.3, MAXRES = 3, MAXCELL = 400, CROWN_PITCH = 1.3;
  var SLOW_MS = 250; // one frame slower than this means a GPU too weak to bake on: stop, keep what is done
  var GL = null, failed = false, Q = [], cur = null, atlasRef = null, frameMs = 0, done = {}, waiters = [];

  // ---------- the raymarch shader ----------
  var VS = '#version 300 es\nin vec2 a; void main(){ gl_Position = vec4(a, 0.0, 1.0); }';
  function fragSrc(maxp) {
    return [
      '#version 300 es',
      'precision highp float; precision highp int;',
      '#define MAXP ' + maxp,
      'uniform vec4 P[MAXP*5];',
      'uniform int uN; uniform int uNT; uniform int uSteps;',
      'uniform vec2 uOrg; uniform float uScale; uniform float uPx; uniform float uFur; uniform float uPitch; uniform float uYaw;',
      'uniform vec3 uBC; uniform float uBR; uniform vec3 uCap; uniform float uCapAmt; uniform float uCapLeaf; uniform float uSeed; uniform vec3 uAura;',
      'out vec4 oC;',
      'float gMat, gRough; vec3 gCol; vec2 gFlow;',
      'float hash(vec3 p){ p = fract(p*0.3183099 + vec3(0.71,0.113,0.419)); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }',
      'float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);',
      '  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),',
      '             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }',
      'vec3 qrot(vec4 q, vec3 v){ return v + 2.0*cross(q.xyz, cross(q.xyz, v) + q.w*v); }',
      'float sdEll(vec3 p, vec3 r){ float k0 = length(p/r), k1 = length(p/(r*r)); return k0*(k0-1.0)/max(k1, 1e-6); }',
      'float sdRC(vec3 p, vec3 a, vec3 b, float r1, float r2){',
      '  vec3 ba = b-a; float l2 = max(dot(ba,ba), 1e-8), rr = r1-r2, a2 = l2-rr*rr, il2 = 1.0/l2;',
      '  vec3 pa = p-a; float y = dot(pa,ba), z = y-l2; vec3 xv = pa*l2-ba*y; float x2 = dot(xv,xv), y2 = y*y*l2, z2 = z*z*l2;',
      '  float k = sign(rr)*rr*rr*x2;',
      '  if (sign(z)*a2*z2 > k) return sqrt(x2+z2)*il2-r2;',
      '  if (sign(y)*a2*y2 < k) return sqrt(x2+y2)*il2-r1;',
      '  return (sqrt(x2*a2*il2)+y*rr)*il2-r1; }',
      'float sdHex(vec3 p, float r, float h){ const vec3 k = vec3(-0.8660254, 0.5, 0.57735); p = abs(p.xzy);',
      '  p.xy -= 2.0*min(dot(k.xy, p.xy), 0.0)*k.xy; vec2 d = vec2(length(p.xy - vec2(clamp(p.x, -k.z*r, k.z*r), r))*sign(p.y - r), p.z - h);',
      '  return min(max(d.x, d.y), 0.0) + length(max(d, 0.0)); }',
      'float sdBox(vec3 p, vec3 b, float r){ vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }',
      'float sdTor(vec3 p, float R, float r){ vec2 q = vec2(length(p.xz) - R, p.y); return length(q) - r; }',
      'vec3 toCre(vec3 p){ float c = cos(uYaw), s = sin(uYaw); return vec3(p.x*c+p.z*s, p.y, -p.x*s+p.z*c); }',
      'vec3 toWorld(vec3 q){ float c = cos(uYaw), s = sin(uYaw); return vec3(q.x*c-q.z*s, q.y, q.x*s+q.z*c); }',
      'float clump(vec3 q){ return noise(q*uPx*0.22)*0.6 + noise(q*uPx*0.42)*0.4; }',
      'float strandA(vec3 q, vec2 f, float a, float b){ vec2 pf = vec2(-f.y, f.x); return noise(vec3(dot(q.xy, f)*b, dot(q.xy, pf)*a, q.z*a)); }',
      'float rockN(vec3 q){ return noise(q*3.0)*0.45 + noise(q*7.0)*0.3 + noise(q*uPx*0.12)*0.25; }',
      // The scene: shapes blended in order (colour, material, roughness and coat direction blend with them), then
      // paints (colour pass only), then the material's surface detail.
      'float map(vec3 p, bool want){',
      '  vec3 q = toCre(p); float d = 1e5, rough = 0.0, mat = 0.0; vec2 fl = vec2(-1.0, 0.0); vec3 col = vec3(0.3);',
      '  for (int i = 0; i < uN; i++) {',
      '    int o = i*5; vec4 A = P[o], B = P[o+1], C = P[o+2], D = P[o+3], Q = P[o+4];',
      '    int kind = int(A.w + 0.5), typ = kind - (kind/8)*8; vec3 lp = qrot(Q, q - A.xyz); float di;',
      '    if (typ == 0) di = sdEll(lp, B.xyz); else if (typ == 1) di = sdRC(q, A.xyz, B.xyz, C.x, C.y);',
      '    else if (typ == 2) di = sdHex(lp, B.x, B.y) - B.z; else if (typ == 3) di = sdBox(lp, B.xyz, C.x); else di = sdTor(lp, C.x, C.y);',
      '    float k = B.w, mt = floor(C.z);',
      '    if (kind < 8) { float h = clamp(0.5 + 0.5*(di - d)/k, 0.0, 1.0); d = mix(di, d, h) - k*h*(1.0-h);',
      '      rough = mix(fract(C.z)*4.0, rough, h); fl = mix(vec2(D.w, C.w), fl, h); if (h < 0.5) mat = mt; if (want) col = mix(D.rgb, col, h); }',
      '    else { float h = clamp(0.5 - 0.5*(d + di)/k, 0.0, 1.0); d = mix(d, -di, h) + k*h*(1.0-h); if (h > 0.5) mat = mt; if (want) col = mix(col, D.rgb, h); } }',
      '  if (want) for (int j = uN; j < uNT; j++) {',
      '    int o = j*5; vec4 A = P[o], B = P[o+1], C = P[o+2], D = P[o+3], Q = P[o+4];',
      '    int typ = int(A.w + 0.5); typ -= (typ/8)*8;',
      '    float di = typ == 0 ? sdEll(qrot(Q, q - A.xyz), B.xyz) : sdRC(q, A.xyz, B.xyz, C.x, C.y);',
      '    float w = (1.0 - smoothstep(-B.w, B.w, di))*C.w; col = mix(col, D.rgb, w); if (C.z >= 0.0 && w > 0.5) mat = C.z; }',
      '  if (d < 0.12) { int m = int(mat + 0.5); float disp = 0.0;',
      '    if (m == 0 || m == 9 || m == 13) { float fz = m == 9 ? 0.5 : 1.0;',
      '      disp = (clump(q) - 0.35)*(uFur*fz + 0.03*rough) + (strandA(q, fl, uPx*0.33, uPx*0.03)*0.012 + strandA(q, fl, uPx*0.5, uPx*0.05)*0.006)*fz;',
      '      if (m == 13) disp += (noise(q*vec3(5.0, 11.0, 5.0)) - 0.45)*0.05*rough; }',
      '    else if (m == 7) disp = (rockN(q) - 0.45)*0.13*rough;',
      '    else if (m == 5) disp = strandA(q, fl, uPx*0.15, uPx*0.02)*0.03*rough;',
      '    else if (m == 6) disp = (noise(q*uPx*0.1)*0.7 + noise(q*uPx*0.28)*0.3 - 0.4)*0.06*rough;',
      '    else if (m == 4) disp = (noise(vec3(q.x*6.0, q.y*1.6, q.z*6.0)) - 0.5)*0.035*rough + noise(q*uPx*0.4)*0.004;',
      '    else if (m == 1 || m == 10) disp = (noise(q*uPx*0.25) - 0.5)*0.008*(1.0 + rough);',
      '    else if (m == 3) disp = noise(q*uPx*0.3)*0.003;',
      '    d -= disp; }',
      '  if (want) { gCol = col; gMat = mat; gRough = rough; gFlow = normalize(fl + vec2(1e-5, 0.0)); }',
      '  return d; }',
      'vec3 aces(vec3 x){ return clamp(x*(2.51*x+0.03)/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }',
      'vec4 render(vec2 s){',
      '  float cp = cos(uPitch), sp = sin(uPitch); vec3 fw = vec3(0.0, -sp, -cp), up = vec3(0.0, cp, -sp);',
      '  vec3 ro = vec3(s.x, 0.0, 0.0) + up*s.y, rd = fw;',
      '  vec3 oc = ro - uBC; float b = dot(oc, rd), c = dot(oc, oc) - uBR*uBR, disc = b*b - c;',
      '  if (disc < 0.0) return vec4(0.0);',
      '  float t = -b - sqrt(disc), tmax = -b + sqrt(disc), id = -1.0, EPS = 0.08/uPx, HIT = 0.04/uPx;',
      '  vec3 L = normalize(vec3(-0.6,0.65,0.45)), Lr = normalize(vec3(0.75,0.3,-0.6));',
      // Loops are bounded by uniforms so no compiler unrolls them. One loop, one map() call site: the march, the 4 normal taps, the 5 occlusion taps and the shadow ray.
      '  int mode = 0, k = 0; vec3 p = vec3(0.0), n = vec3(0.0, 1.0, 0.0), nacc = vec3(0.0); float occ = 0.0, osc = 1.0, sh = 1.0, ts = 0.04;',
      '  for (int i = 0; i < uSteps; i++) {',
      '    vec3 pos, e = vec3(0.0); float hh = 0.0;',
      '    if (mode == 0) pos = ro + rd*t;',
      '    else if (mode == 1) { e = 0.5773*(2.0*vec3(float(((k+3)/2)-2*((k+3)/4)), float((k/2)-2*(k/4)), float(k-2*(k/2)))-1.0); pos = p + e*EPS; }',
      '    else if (mode == 2) { hh = 0.02 + 0.07*float(k); pos = p + n*hh; }',
      '    else pos = p + n*0.012 + L*ts;',
      '    float m = map(pos, false);',
      '    if (mode == 0) { if (m < HIT) { id = 1.0; p = pos; mode = 1; } else { t += m*0.75; if (t > tmax || i > 145) break; } }',
      '    else if (mode == 1) { nacc += e*m; k++; if (k == 4) { n = normalize(nacc); mode = 2; k = 0; } }',
      '    else if (mode == 2) { occ += (hh - m)*osc; osc *= 0.72; k++; if (k == 5) { mode = 3; k = 0; } }',
      '    else { sh = min(sh, 7.0*m/ts); ts += clamp(m, 0.02, 0.18); k++; if (sh < 0.003 || ts > 4.5) break; } }',
      '  if (id < 0.0) return vec4(0.0);',
      '  map(p, true);',
      '  occ = clamp(1.0 - 2.0*occ, 0.0, 1.0); sh = clamp(sh, 0.0, 1.0);',
      '  vec3 V = -rd, q = toCre(p), nq = toCre(n), alb = gCol; int m = int(gMat + 0.5);',
      '  bool furry = m == 0 || m == 9;',
      '  if (furry || m == 13) {',
      '    alb *= 0.86 + 0.28*noise(q*6.0); alb *= mix(0.7, 1.08, clamp(clump(q)*1.25 - 0.1, 0.0, 1.0));',
      '    float sn0 = strandA(q, gFlow, uPx*0.33, uPx*0.03); alb *= 0.5 + 0.7*sn0*sn0; alb *= 0.82 + 0.3*strandA(q, gFlow, uPx*0.5, uPx*0.05);',
      // brush strokes along the coat in sheet pixels (what the mockup painted in 2D, done here for free)
      '    vec3 Tw = toWorld(vec3(gFlow, 0.0)); vec2 sf = normalize(vec2(Tw.x, dot(Tw, up)) + vec2(1e-5, 0.0));',
      '    vec2 px = gl_FragCoord.xy*0.5 + uSeed*13.0; float u = dot(px, sf), v = dot(px, vec2(-sf.y, sf.x));',
      '    float st = noise(vec3(u*0.21, v*1.05, uSeed)), st2 = noise(vec3(u*0.33 + 17.0, v*1.5, uSeed + 5.0));',
      '    alb *= mix(1.0, mix(0.72, 1.3, smoothstep(0.25, 0.75, st)), 0.5)*mix(1.0, 0.82 + 0.36*st2, 0.35); }',
      '  else if (m == 7) { alb *= 0.65 + 0.7*rockN(q); alb *= 0.85 + 0.3*noise(q*uPx*0.3);',
      '    alb = mix(alb, uCap*(0.75 + 0.5*noise(q*uPx*0.2)), smoothstep(0.45, 0.78, nq.y + (noise(q*5.0) - 0.5)*0.5)*uCapAmt); }',
      '  else if (m == 5) { alb *= 0.5 + 0.75*strandA(q, gFlow, uPx*0.15, uPx*0.02); alb *= 0.85 + 0.3*noise(q*3.0); }',
      '  else if (m == 6) { alb *= 0.6 + 0.75*noise(q*uPx*0.3); alb *= 0.8 + 0.4*noise(q*uPx*0.1);',
      '    alb = mix(alb, uCap, smoothstep(0.5, 0.8, nq.y + (noise(q*uPx*0.15) - 0.5)*0.6)*uCapAmt*uCapLeaf); }',
      '  else if (m == 4) { alb *= 0.85 + 0.3*noise(q*uPx*0.6); alb *= 0.88 + 0.24*noise(vec3(q.x*8.0, q.y*2.0, q.z*8.0)); }',
      '  else if (m == 3 || m == 1 || m == 10) alb *= 0.88 + 0.24*noise(q*uPx*0.25);',
      '  float ndl = dot(n, L), wrap = (furry || m == 4 || m == 6 || m == 13) ? 0.35 : (m == 10 || m == 11 ? 0.25 : 0.0);',
      '  float dif = mix(clamp(ndl, 0.0, 1.0), clamp((ndl + 0.4)/1.4, 0.0, 1.0), wrap);',
      '  vec3 col = alb*(vec3(1.0,0.9,0.78)*1.7*dif*sh*(0.35+0.65*occ) + vec3(0.38,0.5,0.75)*0.26*(0.35+0.65*n.y)*occ*occ + vec3(0.3,0.22,0.15)*0.14*(0.5-0.5*n.y)*occ);',
      '  float fres = pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 3.0);',
      '  col += vec3(0.55,0.7,1.0)*0.5*fres*clamp(dot(n, Lr) + 0.35, 0.0, 1.0)*occ*(furry ? 1.0 : 0.3);',
      '  vec3 Hh = normalize(L + V); float nh = max(dot(n, Hh), 0.0);',
      '  if (m == 1) col += vec3(1.0)*pow(nh, 30.0)*0.5*sh;',
      '  else if (m == 2) col += vec3(1.0)*pow(nh, 90.0)*2.2*sh;',
      '  else if (m == 3) col += vec3(1.0)*pow(nh, 24.0)*0.25*sh;',
      '  else if (m == 10) col += vec3(1.0)*pow(nh, 60.0)*1.0*sh + alb*0.18*(1.0 - fres);',
      '  else if (m == 11) col += vec3(0.9,0.97,1.0)*(pow(nh, 80.0)*1.4*sh + fres*0.45) + alb*0.3;',
      '  else if (m == 12) col += alb*pow(nh, 40.0)*3.0*sh + alb*0.12;',
      '  else if (m == 7) col += vec3(1.0)*pow(nh, 12.0)*0.05*sh;',
      '  else if (m == 6) col += alb*vec3(0.6,0.9,0.3)*0.25*clamp(-ndl, 0.0, 1.0)*occ;',
      '  if (furry) { vec3 T = toWorld(vec3(gFlow, 0.0)); float th = dot(T, Hh), kk = sqrt(max(0.0, 1.0 - th*th)), sn = strandA(q, gFlow, uPx*0.33, uPx*0.03);',
      '    col += alb*vec3(1.0,0.9,0.8)*pow(kk, 30.0)*0.15*sh*sn + vec3(1.0,0.96,0.9)*pow(kk, 160.0)*0.05*sh*(m == 9 ? 2.0 : 1.0); }',
      '  if (furry || m == 13) col += uAura*fres*occ*clamp(n.y + 0.6, 0.0, 1.0);',
      '  if (m == 8) col = alb*1.25 + vec3(0.12)*(1.0 - fres);',
      '  else if (m == 14) { float f = noise(q*uPx*0.15 + vec3(0.0, -uSeed*3.0, 0.0)); col = alb*(0.5 + 0.55*f)*(0.55 + 0.8*(1.0 - fres)); }',
      '  else if (m == 13) col = col*0.65 + alb*0.42 + vec3(0.6,0.8,1.0)*0.5*fres;',
      '  else if (m == 15) col = alb*0.3 + col*0.12;',
      '  col = pow(aces(col*0.82), vec3(1.0/2.2)); col = mix(col, col*col*(3.0-2.0*col), 0.45);',
      '  return vec4(col, 1.0); }',
      'void main(){ oC = render((gl_FragCoord.xy - uOrg)/uScale); }'
    ].join('\n');
  }

  // ---------- the ground shader: a lit height field per biome (stones, cobbles, cracks, moss, snow, water) ----------
  var GROUND_FS = [
    '#version 300 es',
    'precision highp float;',
    'uniform vec2 uOff; uniform vec2 uTile; uniform float uSeed; uniform int uZone;',
    'uniform vec3 uLow; uniform vec3 uMid; uniform vec3 uHigh; uniform vec3 uPatch; uniform vec3 uRock; uniform vec3 uRock2; uniform vec3 uCap; uniform vec3 uGlow;',
    'uniform float uCut; uniform float uRelief;',
    'out vec4 oC;',
    'vec2 h2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p + uSeed)*43758.5453); }',
    'float h1(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed*0.37)*43758.5453); }',
    'float vn(vec2 x){ vec2 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);',
    '  return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }',
    'float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += vn(p)*a; p = p*2.03 + 17.1; a *= 0.5; } return s/0.97; }',
    // cellular noise: x = distance to the nearest feature, y = to the second, z = the cell's random id
    'vec3 cell(vec2 p, float jit){ vec2 i = floor(p), f = fract(p); float d1 = 8.0, d2 = 8.0, id = 0.0;',
    '  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) { vec2 g = vec2(x, y), o = h2(i + g)*jit, r = g + o - f; float d = dot(r, r);',
    '    if (d < d1) { d2 = d1; d1 = d; id = h1(i + g + 3.1); } else if (d < d2) d2 = d; }',
    '  return vec3(sqrt(d1), sqrt(d2), id); }',
    // height (world px units) and material weights: m.x stone, m.y patch, m.z water, m.w glow
    'float H(vec2 w, out vec4 m, out vec3 alb){',
    '  float macro = fbm(w/150.0), pch = fbm(w/320.0 + 40.0), fine = vn(w/3.0)*0.5 + vn(w/7.0)*0.5;',
    '  vec3 base = macro < 0.5 ? mix(uLow, uMid, clamp((macro - 0.25)/0.25, 0.0, 1.0)) : mix(uMid, uHigh, clamp((macro - 0.5)/0.25, 0.0, 1.0));',
    '  float pm = clamp((pch - uCut)/0.07 + 0.5, 0.0, 1.0)*(0.55 + 0.45*macro);',
    '  float h = macro*14.0*uRelief + fine*1.4;',
    '  vec3 c1 = cell(w/26.0, 0.9), c2 = cell(w/9.0, 0.9);',
    '  float rare = vn(w/90.0 + 5.0), big = smoothstep(0.55, 0.05, c1.x)*step(c1.z, 0.03 + 0.14*rare*rare), peb = smoothstep(0.5, 0.0, c2.x)*step(c2.z, 0.04 + 0.12*rare);',
    '  float stone = 0.0; vec3 st = mix(uRock, uRock2, 0.35 + 0.4*h1(floor(w/26.0)));',
    '  if (uZone == 3) { vec3 fl = cell(w/46.0, 0.4); float road = smoothstep(0.5, 0.64, fbm(w/260.0 + 9.0));',
    '    float slab = smoothstep(0.03, 0.12, fl.y - fl.x)*road*step(0.12, fl.z)*(0.75 + 0.25*vn(w/6.0));',
    '    h += slab*(2.0 + fl.z*2.5); stone = max(stone, slab); st = mix(st, mix(uRock, uRock2, 0.15 + fl.z*0.6), slab); }',
    '  h += big*5.0 + peb*1.6; stone = max(stone, max(big, peb*0.85));',
    '  float water = 0.0, glow = 0.0;',
    '  if (uZone == 0) { water = smoothstep(0.3, 0.27, macro)*(1.0 - big); h = mix(h, 0.3*14.0, water); }',
    '  if (uZone == 1) { vec3 cr = cell(w/34.0, 0.8); float edge = smoothstep(0.08, 0.0, cr.y - cr.x); h -= edge*3.0*(1.0 - big);',
    '    glow = edge*smoothstep(0.55, 0.75, fbm(w/200.0 + 70.0))*(1.0 - big); }',
    '  if (uZone == 2) { water = smoothstep(0.32, 0.27, macro)*0.85; h = mix(h, 0.32*14.0, water*0.9); }',
    '  if (uZone == 4) { vec3 cr = cell(w/40.0, 0.9); float vein = smoothstep(0.035, 0.0, cr.y - cr.x)*smoothstep(0.66, 0.82, fbm(w/170.0 + 30.0))*step(0.3, cr.z);',
    '    h -= smoothstep(0.08, 0.0, cr.y - cr.x)*1.5;',
    '    h -= vein*2.0; glow = vein; }',
    '  alb = mix(base, uPatch*(0.8 + 0.4*fine), pm);',
    '  if (uZone == 0 || uZone == 3 || uZone == 4) { float bl = vn(vec2(w.x/1.4, w.y/6.0)), bl2 = vn(vec2(w.x/2.1 + 31.0, w.y/9.0));',
    '    float grass = smoothstep(0.35, 0.75, fbm(w/60.0 + 11.0))*(1.0 - water); alb *= mix(1.0, 0.6 + 0.9*bl*bl2, grass*0.8); h += grass*bl*1.2; }',
    '  alb = mix(alb, st*(0.75 + 0.5*fine), stone);',
    '  alb *= 0.8 + 0.4*vn(w/2.2);',
    '  m = vec4(stone, pm, water, glow);',
    '  return h; }',
    'void main(){',
    '  vec2 w = uOff + vec2(gl_FragCoord.x, uTile.y - gl_FragCoord.y);',
    '  vec4 m, m1, m2; vec3 alb, a1, a2;',
    '  float h = H(w, m, alb), hx = H(w + vec2(1.0, 0.0), m1, a1), hy = H(w + vec2(0.0, 1.0), m2, a2);',
    '  vec3 n = normalize(vec3(h - hx, h - hy, 1.2));',
    '  vec3 L = normalize(vec3(-0.5, -0.45, 0.75));',
    '  float dif = clamp(dot(n, L), 0.0, 1.0), cav = clamp(0.6 + (h - (fbm(w/150.0)*14.0))*0.06, 0.35, 1.15);',
    '  vec3 col = alb*(vec3(1.0, 0.92, 0.82)*0.95*dif + vec3(0.4, 0.5, 0.7)*0.3*(0.6 + 0.4*n.z))*cav;',
    '  if (m.z > 0.0) { float rip = vn(vec2(w.x/16.0, w.y/5.0)), edge = smoothstep(0.0, 0.5, m.z);',
    '    vec3 wat = (uZone == 2 ? vec3(0.05, 0.08, 0.11) : vec3(0.012, 0.02, 0.02)) + vec3(0.1, 0.13, 0.18)*smoothstep(0.55, 0.95, rip)*0.35;',
    '    wat += vec3(0.16, 0.2, 0.26)*smoothstep(0.62, 0.9, fbm(w/50.0 + 3.0))*0.3 + vec3(0.04, 0.05, 0.03)*(1.0 - smoothstep(0.3, 0.9, m.z));',
    '    col = mix(col*0.6, wat, edge); }',
    '  col = mix(col, uGlow*1.4 + vec3(0.25, 0.15, 0.05), m.w*0.85);',
    '  col = pow(clamp(col, 0.0, 1.0), vec3(1.0/2.2));',
    '  oC = vec4(col, 1.0); }'
  ].join('\n');

  // ---------- context and programs ----------
  function hasGL() { return typeof WebGL2RenderingContext !== 'undefined' && typeof document !== 'undefined'; }
  function init() {
    if (GL || failed) return !!GL;
    if (!hasGL()) { failed = true; return false; }
    try {
      var c = document.createElement('canvas'); c.width = c.height = 4;
      var gl = c.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, alpha: true, failIfMajorPerformanceCaveat: true });
      if (!gl) { failed = true; return false; }
      // A software rasterizer would take seconds a frame: keep the flat art there.
      var dbg = gl.getExtension('WEBGL_debug_renderer_info'), who = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      if (/swiftshader|llvmpipe|software|basic render/i.test(who)) { var lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext(); c.width = c.height = 1; failed = true; return false; }
      var maxp = Math.max(24, Math.min(64, Math.floor((gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS) - 24) / 5)));
      var par = gl.getExtension('KHR_parallel_shader_compile');
      var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      GL = { c: c, gl: gl, par: par, maxp: maxp, data: new Float32Array(maxp * PB.Rigs.STRIDE), sdf: prog(gl, fragSrc(maxp)), ground: prog(gl, GROUND_FS), ready: false };
      c.addEventListener('webglcontextlost', function (e) { e.preventDefault(); failed = true; GL = null; });
      return true;
    } catch (e) { fail(e); return false; }
  }
  function fail(e) { failed = true; GL = null; if (typeof console !== 'undefined') console.warn('Sculpted sprites off:', e && e.message ? e.message : e); }
  function prog(gl, fs) {
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
    var p = gl.createProgram(), v = sh(gl.VERTEX_SHADER, VS), f = sh(gl.FRAGMENT_SHADER, fs);
    gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
    return { p: p, v: v, f: f, u: null };
  }
  // True once both programs are linked. With KHR_parallel_shader_compile this never blocks; without it, the first call
  // waits for the compile (a fraction of a second).
  function ready() {
    if (!GL) return false;
    if (GL.ready) return true;
    var gl = GL.gl;
    if (GL.par && (!gl.getProgramParameter(GL.sdf.p, GL.par.COMPLETION_STATUS_KHR) || !gl.getProgramParameter(GL.ground.p, GL.par.COMPLETION_STATUS_KHR))) return false;
    try {
      [GL.sdf, GL.ground].forEach(function (pr) {
        if (!gl.getProgramParameter(pr.p, gl.LINK_STATUS)) throw new Error((gl.getShaderInfoLog(pr.f) || '') + (gl.getProgramInfoLog(pr.p) || ''));
        pr.u = {}; var n = gl.getProgramParameter(pr.p, gl.ACTIVE_UNIFORMS);
        for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(pr.p, i), name = info.name.replace(/\[0\]$/, ''); pr.u[name] = gl.getUniformLocation(pr.p, name); }
        pr.a = gl.getAttribLocation(pr.p, 'a');
      });
    } catch (e) { fail(e); return false; }
    GL.ready = true;
    return true;
  }
  function use(pr, w, h) {
    var gl = GL.gl;
    if (GL.c.width !== w || GL.c.height !== h) { GL.c.width = w; GL.c.height = h; }
    gl.viewport(0, 0, w, h); gl.useProgram(pr.p);
    gl.enableVertexAttribArray(pr.a); gl.vertexAttribPointer(pr.a, 2, gl.FLOAT, false, 0, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    return gl;
  }

  // ---------- projection: where a rig point lands on the frame (screen units, y up) ----------
  function proj(p, pitch, yaw) {
    var c = Math.cos(yaw), s = Math.sin(yaw), wx = p[0] * c - p[2] * s, wy = p[1], wz = p[0] * s + p[2] * c;
    return [wx, wy * Math.cos(pitch) - wz * Math.sin(pitch)];
  }
  // A packed rig's bounding sphere in world space (the box corners, turned by yaw), padded for displacement.
  function bound(pk, yaw) {
    var c = [(pk.lo[0] + pk.hi[0]) / 2, (pk.lo[1] + pk.hi[1]) / 2, (pk.lo[2] + pk.hi[2]) / 2], cy = Math.cos(yaw), sy = Math.sin(yaw);
    var dx = pk.hi[0] - pk.lo[0], dy = pk.hi[1] - pk.lo[1], dz = pk.hi[2] - pk.lo[2];
    return { c: [c[0] * cy - c[2] * sy, c[1], c[0] * sy + c[2] * cy], r: Math.sqrt(dx * dx + dy * dy + dz * dz) / 2 + 0.15 };
  }

  // Renders a rig into the GL canvas (w x h pixels). o: org [px, py] (bottom-up pixel of the screen origin), scale
  // (pixels per body unit), px (sheet pixels per body unit, which scales the fur and grain), pitch, yaw, cap, seed.
  function renderRig(b, o) {
    var pr = GL.sdf, gl = use(pr, o.w, o.h), pk = PB.Rigs.pack(b, GL.maxp, GL.data), bd = bound(pk, o.yaw), u = pr.u;
    gl.uniform4fv(u.P, GL.data); gl.uniform1i(u.uN, pk.n); gl.uniform1i(u.uNT, pk.nt); gl.uniform1i(u.uSteps, 190);
    gl.uniform2f(u.uOrg, o.org[0], o.org[1]); gl.uniform1f(u.uScale, o.scale); gl.uniform1f(u.uPx, o.px); gl.uniform1f(u.uFur, 0.014);
    gl.uniform1f(u.uPitch, o.pitch); gl.uniform1f(u.uYaw, o.yaw); gl.uniform3fv(u.uBC, bd.c); gl.uniform1f(u.uBR, bd.r);
    gl.uniform3fv(u.uCap, b.cap || [0, 0, 0]); gl.uniform1f(u.uCapAmt, b.capAmt || 0); gl.uniform1f(u.uCapLeaf, b.capLeaf ? 1 : 0);
    gl.uniform1f(u.uSeed, o.seed || 0); gl.uniform3fv(u.uAura, o.aura || [0, 0, 0]);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return pk;
  }

  function mk(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  function readable(c) { c.getContext('2d', { willReadFrequently: true }); return c; }
  function rgba(hex, a) { var n = parseInt(hex.slice(1), 16); return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  function glowAt(g, x, y, r, hex, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(hex, a)); gr.addColorStop(0.4, rgba(hex, a * 0.4)); gr.addColorStop(1, rgba(hex, 0));
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // Hairs flicked out past the silhouette, in the colour at their root, laid on the sheet after the outline (so they
  // carry no black rim). flow: back and down on the body, down the legs.
  function edgeHairs(sg, D, S, ox, unit, seed) {
    var st = seed >>> 0 || 1;
    function rnd() { st ^= st << 13; st ^= st >>> 17; st ^= st << 5; return (st >>> 0) / 4294967296; }
    function at(x, y) { return x < 0 || y < 0 || x >= S || y >= S ? 0 : D[(y * S + x) * 4 + 3]; }
    function flow(y) { var by = (y - S / 2) / unit, lg = Math.max(0, Math.min(1, (by - 0.2) / 0.3)); return (Math.PI - 0.45) * (1 - lg) + Math.PI / 2 * lg; }
    var w = Math.max(0.6, unit / 36);
    sg.lineCap = 'round';
    for (var y = 1; y < S - 1; y++) for (var x = 1; x < S - 1; x++) {
      if (at(x, y) < 160) continue;
      var gx = at(x + 1, y) - at(x - 1, y), gy = at(x, y + 1) - at(x, y - 1);
      if (gx * gx + gy * gy < 3600 || rnd() > 0.4) continue;
      var o = (y * S + x) * 4, lum = D[o] + D[o + 1] + D[o + 2];
      if (lum < 75) continue;
      var out = Math.atan2(-gy, -gx), f = flow(y), da = Math.atan2(Math.sin(f - out), Math.cos(f - out)), ang = out + Math.max(-0.9, Math.min(0.9, da)) * 0.7 + (rnd() - 0.5) * 0.4;
      var len = unit / 11 * (0.4 + 0.9 * rnd()), k = 0.85 + 0.2 * rnd();
      sg.strokeStyle = 'rgba(' + Math.min(255, D[o] * k | 0) + ',' + Math.min(255, D[o + 1] * k | 0) + ',' + Math.min(255, D[o + 2] * k | 0) + ',0.55)';
      sg.lineWidth = w; sg.beginPath(); sg.moveTo(ox + x, y); sg.lineTo(ox + x + Math.cos(ang) * len, y + Math.sin(ang) * len); sg.stroke();
    }
  }

  // ---------- creature sheets ----------
  var AURA = { bear: [0.06, 0.11, 0.14], greatbear: [0.06, 0.11, 0.14], eldersbear: [0.12, 0.1, 0.04], wraithwolf: [0.08, 0.12, 0.16] };
  function begin(type) {
    var Sp = PB.Sprites, fam = Sp.familyOf(type) || (type === 'druid' ? 'druid' : 'blob'), r = Sp.radiusOf(type), span = Sp.spanOf(type);
    var size = Math.max(24, Math.ceil(r * span)) + (Math.ceil(r * span) % 2), res = Math.min(MAXRES, MAXCELL / size), S = Math.round(size * res);
    var probe = PB.Rigs.creature(type, 0, fam, Sp.PALETTE[type] || Sp.PALETTE[fam] || Sp.PALETTE.rotling, Sp.eyeOf(type), Sp.extraOf(type));
    if (probe.s.length + probe.p.length > GL.maxp) return null; // too many shapes for this GPU's uniforms: keep the flat sheet
    var sheet = mk(S * FRAMES, S);
    return { type: type, fam: fam, r: r, size: size, cell: S, res: S / size, span: size / (2 * r), sheet: sheet, sg: sheet.getContext('2d'), body: readable(mk(S, S)), sil: mk(S, S), f: 0,
             pal: Sp.PALETTE[type] || Sp.PALETTE[fam] || Sp.PALETTE.rotling, eye: Sp.eyeOf(type), extra: Sp.extraOf(type) };
  }
  // One frame: render at twice the cell, filter down, then outline, edge hairs and glows into the sheet.
  function frame(J) {
    var f = J.f, S = J.cell, S2 = S * 2, unit = S / (2 * J.span), ox = f * S;
    var b = PB.Rigs.creature(J.type, f / FRAMES, J.fam, J.pal, J.eye, J.extra);
    renderRig(b, { w: S2, h: S2, org: [S, S], scale: S2 / (2 * J.span), px: unit, pitch: PITCH, yaw: YAW, seed: f * 0.37 + J.r, aura: AURA[J.type] });
    var bg = J.body.getContext('2d');
    bg.setTransform(1, 0, 0, 1, 0, 0); bg.globalCompositeOperation = 'source-over'; bg.globalAlpha = 1; bg.clearRect(0, 0, S, S);
    bg.imageSmoothingEnabled = true; bg.imageSmoothingQuality = 'high'; bg.drawImage(GL.c, 0, 0, S2, S2, 0, 0, S, S);
    var sg = J.sg, pt = function (p) { var s = proj(p, PITCH, YAW); return [ox + S / 2 + s[0] * unit, S / 2 - s[1] * unit]; };
    if (b.luminous) { sg.globalCompositeOperation = 'lighter'; b.glows.forEach(function (gw) { var q = pt(gw.p); glowAt(sg, q[0], q[1], gw.r * unit, gw.c, gw.a * 0.6); }); sg.globalCompositeOperation = 'source-over'; }
    else { // the dark outline: the silhouette, darkened, stamped one world pixel around the body
      var lg = J.sil.getContext('2d');
      lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, S, S); lg.drawImage(J.body, 0, 0);
      lg.globalCompositeOperation = 'source-in'; lg.fillStyle = 'rgba(8,6,10,0.85)'; lg.fillRect(0, 0, S, S); lg.globalCompositeOperation = 'source-over';
      var d = J.res; sg.globalAlpha = b.alpha;
      sg.drawImage(J.sil, ox + d, 0); sg.drawImage(J.sil, ox - d, 0); sg.drawImage(J.sil, ox, d); sg.drawImage(J.sil, ox, -d);
    }
    sg.globalAlpha = b.alpha; sg.drawImage(J.body, ox, 0); sg.globalAlpha = 1;
    if (b.hairs) edgeHairs(sg, bg.getImageData(0, 0, S, S).data, S, ox, unit, 977 * (f + 3) + J.r * 13);
    if (!b.luminous && b.glows.length) {
      sg.globalCompositeOperation = 'lighter';
      b.glows.forEach(function (gw) { var q = pt(gw.p); glowAt(sg, q[0], q[1], gw.r * unit, gw.c, gw.a); });
      sg.globalCompositeOperation = 'source-over';
    }
    J.f++;
  }
  // The finished sheet in the atlas's shape. White (hit flash) and essence tints are made on first use.
  var ESS = { rot: '#8fae3a', ember: '#ff7a2a', frost: '#9fd8ff', storm: '#f5e46a', stone: '#a89a88' };
  function finish(J) {
    var sp = { sheet: J.sheet, size: J.size, cell: J.cell, res: J.res, r: J.r, frames: FRAMES, sculpted: true }, white = null, tints = {}, made = {};
    Object.defineProperty(sp, 'white', { enumerable: true, get: function () {
      if (!white) { white = mk(J.sheet.width, J.cell); var g = white.getContext('2d'); g.drawImage(J.sheet, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = '#ffffff'; g.fillRect(0, 0, white.width, white.height); }
      return white;
    } });
    Object.keys(ESS).forEach(function (e) {
      Object.defineProperty(tints, e, { enumerable: true, get: function () {
        if (!made[e]) { var c = mk(J.sheet.width, J.cell), g = c.getContext('2d'); g.drawImage(J.sheet, 0, 0); g.globalCompositeOperation = 'source-atop'; g.globalAlpha = 0.38; g.fillStyle = ESS[e]; g.fillRect(0, 0, c.width, c.height); made[e] = c; }
        return made[e];
      } });
    });
    sp.tints = tints;
    done[J.type] = sp;
    if (atlasRef) atlasRef.bodies[J.type] = sp;
    waiters.forEach(function (fn) { fn(J.type, sp); });
  }

  // Queue: the given types in order (later duplicates are dropped). The atlas's entries are replaced as sheets finish.
  function start(atlas, types) {
    if (!init()) return false;
    atlasRef = atlas;
    var seen = {};
    Q = types.filter(function (t) { if (seen[t] || done[t]) return false; seen[t] = true; return true; });
    return true;
  }
  // Bakes frames until budgetMs is spent. light: only a frame known to be cheap (in the field, so a fight keeps its
  // frame rate; heavy sheets wait for the next menu).
  function tick(budgetMs, light) {
    if (!GL || (!Q.length && !cur) || !ready()) return 0;
    var t0 = performance.now(), n = 0;
    try {
      while (Q.length || cur) {
        if (!cur && !(cur = begin(Q.shift()))) continue;
        if (light && (!frameMs || frameMs > budgetMs || cur.cell > 200)) break;
        var f0 = performance.now();
        frame(cur); n++;
        var ms = performance.now() - f0;
        if (ms > SLOW_MS) throw new Error('a frame took ' + Math.round(ms) + ' ms');
        frameMs = frameMs ? frameMs * 0.8 + ms * 0.2 : ms;
        if (cur.f >= FRAMES) { finish(cur); cur = null; }
        if (performance.now() - t0 >= budgetMs) break;
      }
    } catch (e) { fail(e); cur = null; Q = []; }
    return n;
  }
  // Bakes one type right now (tests and the debug page).
  function bakeNow(type) {
    if (!init() || !ready()) return null;
    var J = begin(type);
    if (!J) return null;
    while (J.f < FRAMES) frame(J);
    finish(J);
    return done[type];
  }

  // ---------- terrain ----------
  // A prop standing on obstacle o: the sculpt rendered at res x, with its anchor (the obstacle centre) in world px.
  function propSprite(kind, o, B, rnd) {
    if (!GL || !ready()) return null;
    var b = PB.Rigs.prop(kind, rnd, B), r = o.r, res = 2, pk = PB.Rigs.pack(b, GL.maxp, GL.data), yaw = 0;
    var corners = [], lo = pk.lo, hi = pk.hi;
    for (var i = 0; i < 8; i++) corners.push(proj([i & 1 ? hi[0] : lo[0], i & 2 ? hi[1] : lo[1], i & 4 ? hi[2] : lo[2]], PITCH, yaw));
    var x0 = Math.min.apply(null, corners.map(function (c) { return c[0]; })) - 0.15, x1 = Math.max.apply(null, corners.map(function (c) { return c[0]; })) + 0.15;
    var y0 = Math.min.apply(null, corners.map(function (c) { return c[1]; })) - 0.15, y1 = Math.max.apply(null, corners.map(function (c) { return c[1]; })) + 0.15;
    var w = Math.ceil((x1 - x0) * r * res), h = Math.ceil((y1 - y0) * r * res);
    renderRig(b, { w: w, h: h, org: [-x0 * r * res, -y0 * r * res], scale: r * res, px: r * res / 2, pitch: PITCH, yaw: yaw, seed: rnd() * 10 });
    var c = mk(w, h), g = c.getContext('2d');
    g.save(); g.globalAlpha = 0.45; g.fillStyle = '#000'; g.beginPath(); g.ellipse(-x0 * r * res + r * res * 0.15, h + y0 * r * res + r * res * 0.12, r * res * 1.1, r * res * 0.5, 0, 0, Math.PI * 2); g.fill(); g.restore();
    g.drawImage(GL.c, 0, 0);
    return { canvas: c, res: res, ax: -x0 * r, ay: y1 * r, tall: (b.ext ? b.ext.up : 1) > 1.5, glowCol: b.glowCol };
  }
  function crownSprite(rad, B, rnd, kind) {
    if (!GL || !ready()) return null;
    var res = 1.5, size = Math.ceil(rad * 2.4 * res), b = PB.Rigs.crown(kind, rnd, B);
    renderRig(b, { w: size, h: size, org: [size / 2, size / 2], scale: rad * res, px: rad * res / 3, pitch: CROWN_PITCH, yaw: rnd() * 6.28, seed: rnd() * 10 });
    var c = mk(size, size); c.getContext('2d').drawImage(GL.c, 0, 0);
    return { canvas: c, res: res };
  }
  // The zone ground into g (W x H world px), 512 px tiles at a time.
  function ground(g, zoneIdx, B, seed, W, H) {
    if (!GL || !ready()) return false;
    var pr = GL.ground, u, lin = function (hex, k) { return PB.Rigs.lin(hex, k); };
    for (var y = 0; y < H; y += 512) for (var x = 0; x < W; x += 512) {
      var tw = Math.min(512, W - x), th = Math.min(512, H - y), gl = use(pr, tw, th);
      u = pr.u;
      gl.uniform2f(u.uOff, x, y); gl.uniform2f(u.uTile, tw, th); gl.uniform1f(u.uSeed, (seed % 1000) * 0.731); gl.uniform1i(u.uZone, zoneIdx);
      gl.uniform3fv(u.uLow, lin(B.low, 1.15)); gl.uniform3fv(u.uMid, lin(B.mid, 1.15)); gl.uniform3fv(u.uHigh, lin(B.high, 1.15)); gl.uniform3fv(u.uPatch, lin(B.patch));
      gl.uniform3fv(u.uRock, lin(B.rock[0])); gl.uniform3fv(u.uRock2, lin(B.rock[1])); gl.uniform3fv(u.uCap, lin(B.cap)); gl.uniform3fv(u.uGlow, lin(B.glow));
      gl.uniform1f(u.uCut, B.cut); gl.uniform1f(u.uRelief, B.relief);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      g.drawImage(GL.c, 0, 0, tw, th, x, y, tw, th);
    }
    return true;
  }

  PB.Sculpt = { init: init, ready: ready, start: start, tick: tick, bakeNow: bakeNow, propSprite: propSprite, crownSprite: crownSprite, ground: ground,
    onBake: function (fn) { waiters.push(fn); }, pending: function () { return Q.length + (cur ? 1 : 0); }, baked: function (t) { return done[t] || null; },
    available: function () { return !!GL; }, FRAMES: FRAMES, PITCH: PITCH, YAW: YAW, proj: proj, frameMs: function () { return frameMs; } };
})(globalThis.PB = globalThis.PB || {});
