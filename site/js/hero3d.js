// The hero's cell, lit: one extruded slab with the cell's octagonal silhouette, three raised busbars, a sun
// whose angle follows the scroll, and a slight tilt toward the pointer. motion.js imports this after first
// paint, only on the front page, and keeps the SVG slab underneath until the first frame has rendered.
// three.js 0.170.0, vendored. Renders on demand: a frame only when something changed and the slot is on screen.
import * as THREE from "../vendor/three.module.min.js";

const W = 1.2, H = 0.84, D = 0.06;          // the slab, in scene units
const TILT = -1.05;                          // its resting lean (60°), top edge away: the viewer sees the face obliquely and the slab's thickness
const POINTER_TILT = 4 * Math.PI / 180;      // at most 4° toward the pointer

// the finger and busbar pattern, drawn once
function cellTexture() {
  const c = document.createElement("canvas");
  c.width = 512; c.height = 360;
  const g = c.getContext("2d");
  g.fillStyle = "#15224a"; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "rgba(255,255,255,0.09)"; g.lineWidth = 1.5;
  for (let y = 12; y < c.height; y += 12) { g.beginPath(); g.moveTo(6, y); g.lineTo(c.width - 6, y); g.stroke(); }
  g.fillStyle = "rgba(255,255,255,0.42)";
  [0.25, 0.5, 0.75].forEach((f) => g.fillRect(c.width * f - 3, 4, 6, c.height - 8));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // ExtrudeGeometry maps the face's uv straight from shape coordinates (−W/2..W/2): bring that to 0..1
  t.repeat.set(1 / W, 1 / H); t.offset.set(0.5, 0.5);
  return t;
}

function slabShape(w, h, c) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + c, -h / 2); s.lineTo(w / 2 - c, -h / 2); s.lineTo(w / 2, -h / 2 + c); s.lineTo(w / 2, h / 2 - c);
  s.lineTo(w / 2 - c, h / 2); s.lineTo(-w / 2 + c, h / 2); s.lineTo(-w / 2, h / 2 - c); s.lineTo(-w / 2, -h / 2 + c);
  s.closePath();
  return s;
}

export function mount(slot, opts = {}) {
  const touch = !!opts.touch;
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.setAttribute("aria-hidden", "true");

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 4 / 3, 0.1, 20);
  camera.position.set(0, 1.25, 2.05);
  camera.lookAt(0, 0, 0);

  const texture = cellTexture();
  const faceMat = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.42, metalness: 0.1 });
  const sideMat = new THREE.MeshStandardMaterial({ color: 0x0e1838, roughness: 0.7, metalness: 0.05 });
  const busMat = new THREE.MeshStandardMaterial({ color: 0xc6ccd6, roughness: 0.28, metalness: 0.55 });
  const slabGeo = new THREE.ExtrudeGeometry(slabShape(W, H, 0.11), { depth: D, bevelEnabled: false });
  const busGeo = new THREE.BoxGeometry(0.02, H - 0.05, 0.014);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(slabGeo, [faceMat, sideMat]));
  [-0.3, 0, 0.3].forEach((x) => { const bar = new THREE.Mesh(busGeo, busMat); bar.position.set(x, 0, D + 0.007); group.add(bar); });
  group.rotation.x = TILT;
  scene.add(group);

  scene.add(new THREE.AmbientLight(0xffffff, 0.5));
  const sun = new THREE.DirectionalLight(0xfff3d6, 3.4);   // the sun: its angle follows the scroll
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xdfe7f5, 0.5);  // soft sky from the front so the shadow side keeps its colour
  fill.position.set(0, 1.5, 3);
  scene.add(fill);

  // state
  let visible = true, dirty = true, raf = 0, lastFrame = 0, disposed = false;
  let pointerX = 0, pointerY = 0, tiltX = 0, tiltY = 0;
  const setSun = (k) => { const th = (-60 + 120 * Math.max(0, Math.min(1, k))) * Math.PI / 180; sun.position.set(3 * Math.sin(th), 2.4, 1.2); dirty = true; };
  setSun(0);

  function size() {
    const r = slot.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    dirty = true;
  }
  function frame(now) {
    raf = 0;
    if (disposed || !visible) return;
    if (touch && now - lastFrame < 33) { raf = requestAnimationFrame(frame); return; }
    // ease the tilt toward the pointer; keep going while it still moves
    const tx = pointerY * POINTER_TILT, ty = pointerX * POINTER_TILT;
    const dx = tx - tiltX, dy = ty - tiltY;
    let easing = false;
    if (Math.abs(dx) > 0.0004 || Math.abs(dy) > 0.0004) { tiltX += dx * 0.12; tiltY += dy * 0.12; easing = true; }
    else { tiltX = tx; tiltY = ty; }
    group.rotation.x = TILT + tiltX; group.rotation.y = tiltY;
    if (dirty || easing) { renderer.render(scene, camera); lastFrame = now; dirty = false; }
    if (easing) raf = requestAnimationFrame(frame);
  }
  const wake = () => { if (!raf && visible && !disposed) raf = requestAnimationFrame(frame); };

  const onPointer = (e) => {
    const r = slot.getBoundingClientRect();
    if (!r.width) return;
    pointerX = Math.max(-1, Math.min(1, ((e.clientX - (r.left + r.width / 2)) / r.width) * 2));
    pointerY = Math.max(-1, Math.min(1, ((e.clientY - (r.top + r.height / 2)) / r.height) * 2));
    wake();
  };
  const onLeave = () => { pointerX = 0; pointerY = 0; wake(); };
  if (!touch) { document.addEventListener("pointermove", onPointer, { passive: true }); document.addEventListener("pointerleave", onLeave); }
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => { size(); wake(); }) : null;
  if (ro) ro.observe(slot);

  slot.appendChild(canvas);
  size();
  renderer.render(scene, camera);
  dirty = false;

  return {
    setProgress(k) { setSun(k); wake(); },
    setPointer(nx, ny) { pointerX = nx; pointerY = ny; wake(); },
    setVisible(v) { visible = !!v; if (visible) { dirty = true; wake(); } },
    dispose() {
      disposed = true;
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      document.removeEventListener("pointermove", onPointer);
      document.removeEventListener("pointerleave", onLeave);
      slabGeo.dispose(); busGeo.dispose(); faceMat.dispose(); sideMat.dispose(); busMat.dispose(); texture.dispose();
      renderer.dispose();
      try { renderer.forceContextLoss(); } catch (_) { /* already lost */ }
      canvas.remove();
    },
  };
}
