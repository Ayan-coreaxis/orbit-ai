// Copies the browser libraries designed stores may use (three.js, GSAP, Lenis, model-viewer) into
// public/vendor, so a store never loads code from somebody else's server. Runs on postinstall.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const nm = (p) => path.join(root, "node_modules", p);
const out = (p) => path.join(root, "public", "vendor", p);
const copy = (from, to) => {
  if (!fs.existsSync(nm(from))) return console.warn(`[vendor] missing ${from}`);
  fs.mkdirSync(path.dirname(out(to)), { recursive: true });
  fs.cpSync(nm(from), out(to), { recursive: true });
};

copy("three/build/three.module.js", "three/three.module.js");
copy("three/build/three.core.js", "three/three.core.js");
for (const d of ["controls", "loaders/GLTFLoader.js", "loaders/DRACOLoader.js", "loaders/HDRLoader.js", "utils", "environments", "postprocessing", "shaders", "geometries", "math", "libs/meshopt_decoder.module.js", "libs/draco/gltf"])
  copy(`three/examples/jsm/${d}`, `three/addons/${d}`);
for (const f of ["gsap", "ScrollTrigger", "SplitText", "Flip", "Observer", "Draggable", "InertiaPlugin", "CustomEase", "MotionPathPlugin", "DrawSVGPlugin", "MorphSVGPlugin", "ScrambleTextPlugin"])
  copy(`gsap/dist/${f}.min.js`, `gsap/${f}.min.js`);
copy("lenis/dist/lenis.min.js", "lenis/lenis.min.js");
copy("@google/model-viewer/dist/model-viewer.min.js", "model-viewer/model-viewer.min.js");
