/**
 * <three-d-stage> - lightweight three.js product viewer.
 *
 * Adapted from the design-tool starter component: the download/export toolbar
 * and its exporter imports were removed, sizing is left to CSS, and the
 * component reports WebGL problems so the page can show a poster fallback.
 *
 * three.js is resolved through the page's import map, which must be declared
 * before any module runs:
 *
 *   <script type="importmap">
 *   { "imports": {
 *       "three": "./assets/vendor/three/three.module.min.js",
 *       "three/addons/controls/OrbitControls.js": "./assets/vendor/three/OrbitControls.js"
 *   } }
 *   </script>
 *
 * This file is a classic script (an IIFE that registers the element). It loads
 * three.js with dynamic import(), which honours the import map.
 *
 * Usage:
 *   <three-d-stage background="#ece7de" autorotate></three-d-stage>
 *   <script src="assets/js/stage.js"></script>
 *   <script type="module">
 *     const stage = document.querySelector('three-d-stage');
 *     const { THREE } = await stage.ready;   // rejects if WebGL is unavailable
 *     stage.setObject(model);
 *   </script>
 *
 * Attributes:
 *   background  - CSS color behind the scene (default #f0eee6)
 *   transparent - no background fill; the page shows through the canvas
 *   autorotate  - slow turntable until the user interacts. Disabled when the
 *                 user prefers reduced motion.
 *   zoom        - a plain mouse wheel zooms too (off by default so the wheel
 *                 keeps scrolling the page). Two-finger pinch, trackpad pinch
 *                 (ctrl + wheel), double-click / double-tap and the zoomIn() /
 *                 zoomOut() methods always work.
 *   no-zoom     - ignore every zoom gesture (the methods still work)
 *   pan         - allow right-drag / two-finger pan (off by default)
 *
 * Sizing: the host is display:block; width:100%; height:100%. Give it (or its
 * parent) a height with CSS.
 *
 * API:
 *   stage.ready                    Promise<{ THREE }>; rejects when WebGL or
 *                                  three.js is unavailable
 *   stage.setObject(object3d)      show and frame an object (y-up, in metres)
 *   stage.resetView()              re-frame the camera on the current object
 *                                  (default angle, zoom level 0)
 *   stage.zoomIn() / zoomOut()     animated step along the zoom range
 *   stage.setZoom(level)           animate to level 0..1 (0 = default framing,
 *                                  1 = close enough to read the label text)
 *   stage.zoomLevel                current target level, 0..1
 *   stage.renderToDataURL(w, h, type = 'image/png', quality = 0.92)
 *                                  render one frame at w x h, return a data URL
 *   'stage-ready' event            fired when ready resolves
 *   'stage-error' event            fired with detail: { error } on failure
 *   'zoomchange' event             fired when the zoom level changes, with
 *                                  detail: { level, atMin, atMax }
 *   [data-state]                   "loading" | "ready" | "error" on the host
 */
(() => {
  const DEFAULT_BG = '#f0eee6';

  // Zoom. Level 0 is the default framing and also the furthest out; level 1
  // stops short of the surface by the distance at which the stage shows about
  // ZOOM_VIEW metres of the carton across its narrower side (the label text is
  // readable).
  const ZOOM_STEP = 0.25;
  const ZOOM_VIEW = 0.09;
  const DOUBLE_TAP_ZOOM = 0.7;
  // From this level up the view is centred on the double-tapped point.
  const ZOOM_FOCUS_AT = 0.5;
  const DOUBLE_TAP_MS = 400;
  const clamp01 = (x) => Math.min(1, Math.max(0, x));

  const stylesheet = `
    :host {
      position: relative;
      display: block;
      width: 100%;
      height: 100%;
      background: var(--stage-bg, ${DEFAULT_BG});
      overflow: hidden;
    }
    :host([transparent]) { background: transparent; }
    canvas {
      position: absolute;
      inset: 0;
      display: block;
      width: 100%;
      height: 100%;
      outline: none;
    }
  `;

  /** Cheap WebGL probe so we can fail before downloading three.js. */
  function hasWebGL() {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (!gl) return false;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
      return true;
    } catch (e) {
      return false;
    }
  }

  class ThreeDStage extends HTMLElement {
    constructor() {
      super();
      const root = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = stylesheet;
      root.appendChild(style);
      /** Resolves with { THREE } once the scene is live. */
      this.ready = new Promise((resolve, reject) => {
        this._readyResolve = resolve;
        this._readyReject = reject;
      });
      // Consumers handle rejection through await or 'stage-error'; this keeps
      // the browser from logging an unhandled rejection when they do not.
      this.ready.catch(() => {});
    }

    connectedCallback() {
      if (this._booted) {
        // Re-attached after a removal - resume what disconnected stopped.
        if (this._renderer) this._start();
        return;
      }
      this._booted = true;
      this.setAttribute('data-state', 'loading');
      this._boot().catch((err) => this._fail(err));
    }

    disconnectedCallback() {
      this._stop();
    }

    _fail(err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setAttribute('data-state', 'error');
      this._readyReject(error);
      this.dispatchEvent(
        new CustomEvent('stage-error', { detail: { error }, bubbles: true, composed: true })
      );
    }

    async _boot() {
      if (!hasWebGL()) throw new Error('WebGL is not available');

      const bg = this.getAttribute('background');
      if (bg) this.style.setProperty('--stage-bg', bg);
      this._transparent = this.hasAttribute('transparent');

      const [THREE, controlsMod] = await Promise.all([
        import('three'),
        import('three/addons/controls/OrbitControls.js'),
      ]);
      this._THREE = THREE;

      // preserveDrawingBuffer keeps the last frame readable after compositing
      // (toDataURL / drawImage).
      const renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
      });
      renderer.setClearColor(0x000000, 0);
      this._maxPixelRatio = 2;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this._maxPixelRatio));
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      this._renderer = renderer;
      this.shadowRoot.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      this._scene = scene;

      const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 500);
      camera.position.set(3, 2.2, 4);
      this._camera = camera;

      const controls = new controlsMod.OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      // Zoom is handled in _bindZoom: OrbitControls' own zoom would swallow
      // every wheel event and so trap page scrolling.
      controls.enableZoom = false;
      controls.enablePan = this.hasAttribute('pan');
      this._controls = controls;
      // OrbitControls sets touch-action:none, which would trap page scrolling
      // on touch devices. Let vertical swipes scroll the page; horizontal
      // drags still rotate the model. A two-finger pinch is not part of pan-y,
      // so the browser leaves it to the page script instead of zooming the page.
      renderer.domElement.style.touchAction = 'pan-y';

      // Zoom state: the level eases from _zoomNow to _zoomGoal each frame.
      // _focus is the point the view centres on once zoomed in (the object
      // centre unless the user double-tapped a spot); _focusApplied is how far
      // the orbit target has been slid towards it so far.
      this._zoomGoal = 0;
      this._zoomNow = 0;
      this._exit = 0.05;
      this._focus = new THREE.Vector3();
      this._focusApplied = new THREE.Vector3();
      this._ray = new THREE.Ray();
      this._raycaster = new THREE.Raycaster();

      // Neutral studio: soft sky/ground wash, a key light and a dim fill from
      // behind so silhouettes never go black.
      scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d2c4, 1.0));
      const key = new THREE.DirectionalLight(0xffffff, 2.2);
      key.position.set(4, 7, 5);
      scene.add(key);
      // The ground shadow comes from its own light, almost straight overhead
      // and with no brightness, so it is a compact contact shadow under the
      // carton instead of the long slanted one the key light would throw. A
      // small, low-resolution map plus a blur radius keeps its edge soft.
      const contact = new THREE.DirectionalLight(0xffffff, 0);
      contact.position.set(1.2, 8, 1.6);
      contact.castShadow = true;
      contact.shadow.mapSize.set(512, 512);
      contact.shadow.radius = 4;
      contact.shadow.bias = -0.0004;
      this._contact = contact;
      scene.add(contact);
      const fill = new THREE.DirectionalLight(0xfff4e6, 0.5);
      fill.position.set(-5, 3, -4);
      scene.add(fill);

      // The shadow lands on a unit disc that setObject() scales to the carton
      // footprint, and its alpha fades radially, so it can never spill past
      // the arch or end in a hard edge.
      const shadowMaterial = new THREE.ShadowMaterial({ opacity: 0.1 });
      shadowMaterial.onBeforeCompile = (shader) => {
        shader.vertexShader = shader.vertexShader
          .replace('#include <common>', `#include <common>
varying vec2 vDisc;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
vDisc = position.xy;`);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `#include <common>
varying vec2 vDisc;`)
          .replace(
            'gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );',
            `float fade = 1.0 - smoothstep( 0.2, 1.0, length( vDisc ) );
gl_FragColor = vec4( color, opacity * fade * ( 1.0 - getShadowMask() ) );`
          );
      };
      const ground = new THREE.Mesh(new THREE.CircleGeometry(1, 64), shadowMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      this._ground = ground;
      scene.add(ground);

      // Autorotate, unless the user prefers reduced motion.
      this._wantsAutorotate = this.hasAttribute('autorotate');
      this._userMoved = false;
      this._reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      const applyMotion = () => {
        controls.autoRotate =
          this._wantsAutorotate && !this._userMoved && !this._reducedMotion.matches;
      };
      controls.autoRotateSpeed = 1.2;
      this._applyMotion = applyMotion;
      controls.addEventListener('start', () => {
        this._userMoved = true;
        applyMotion();
      });
      this._reducedMotion.addEventListener('change', applyMotion);
      applyMotion();
      this._bindZoom(renderer.domElement);

      const fit = () => {
        const w = this.clientWidth || 1;
        const h = this.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        // Keep the object framed while the layout changes (e.g. rotating a
        // phone), unless the user has already chosen their own view. The zoom
        // range follows the new size either way.
        if (this._object) {
          if (this._userMoved) this._measure();
          else this._frame(true);
        }
      };
      fit();
      this._fit = fit;
      this._ro = new ResizeObserver(fit);

      // Skip rendering while the stage is scrolled out of view.
      this._visible = true;
      this._io =
        typeof IntersectionObserver === 'function'
          ? new IntersectionObserver((entries) => {
              this._visible = entries[entries.length - 1].isIntersecting;
            })
          : null;

      this._loop = (time) => {
        if (!this._visible) return;
        this._updateZoom(time);
        controls.update();
        renderer.render(scene, camera);
      };

      // Detached while three.js was fetching? Stay idle - the
      // connectedCallback resume starts the loop and observers on reattach.
      if (this.isConnected) this._start();

      this.setAttribute('data-state', 'ready');
      this._readyResolve({ THREE });
      this.dispatchEvent(new CustomEvent('stage-ready', { bubbles: true, composed: true }));
    }

    _start() {
      this._renderer.setAnimationLoop(this._loop);
      this._ro.observe(this);
      if (this._io) this._io.observe(this);
    }

    _stop() {
      // The renderer itself is kept - a move within the document must not
      // rebuild the scene.
      if (this._renderer) this._renderer.setAnimationLoop(null);
      if (this._ro) this._ro.disconnect();
      if (this._io) this._io.disconnect();
    }

    /** Default framing distance and the closest stop for the current size.
     *  Fits against the narrower field of view (horizontal on portrait boxes).
     *  Portrait boxes (phones) get a tighter margin so the carton fills more
     *  of the stage. */
    _measure() {
      const camera = this._camera;
      const half = Math.tan((camera.fov * Math.PI) / 360) * Math.min(1, camera.aspect);
      const pad = camera.aspect < 1 ? 1.22 : 1.35;
      const dist = (this._bounds.radius / half) * pad;
      this._dist = dist;
      // Camera-to-surface distance at zoom level 1.
      this._minSurface = Math.min(dist, ZOOM_VIEW / 2 / half);
      camera.near = Math.max(dist / 100, 0.01);
      camera.far = dist * 100;
      camera.updateProjectionMatrix();
      return dist;
    }

    /** Position the camera so the object's bounding sphere fits the view.
     *  keepDirection retains the current viewing direction (used on resize). */
    _frame(keepDirection) {
      const THREE = this._THREE;
      const sphere = this._bounds;
      if (!sphere) return;
      const camera = this._camera;
      const controls = this._controls;

      const dist = this._measure();

      const dir = keepDirection
        ? camera.position.clone().sub(controls.target).normalize()
        : new THREE.Vector3(1, 0.55, 1.25).normalize();
      camera.position.copy(sphere.center).add(dir.multiplyScalar(dist));
      controls.target.copy(sphere.center);
      this._focusApplied.copy(sphere.center);
      controls.update();
    }

    /** Show (and own) the object. Replaces any previous object, enables
     *  shadows on every mesh, rests it on the ground plane, and frames
     *  the camera to its bounds. */
    setObject(object) {
      const THREE = this._THREE;
      if (!THREE) throw new Error('three-d-stage: not ready - await stage.ready first');
      if (this._object) this._scene.remove(this._object);
      this._object = object;
      object.traverse((o) => {
        if (o.isMesh) {
          o.castShadow = true;
          o.receiveShadow = true;
        }
      });
      const box = new THREE.Box3().setFromObject(object);
      if (!box.isEmpty()) {
        // Rest the object on the ground without moving its origin.
        this._ground.position.y = box.min.y;
        const size = box.getSize(new THREE.Vector3());
        const centre = box.getCenter(new THREE.Vector3());
        this._ground.position.x = centre.x;
        this._ground.position.z = centre.z;
        // Shadow disc: about 1.6 x the carton's footprint (half diagonal).
        this._ground.scale.setScalar((Math.hypot(size.x, size.z) / 2) * 1.6);
        this._box = box;
        this._bounds = box.getBoundingSphere(new THREE.Sphere());
        this._resetZoom();
        this._frame(false);
        const span = this._bounds.radius * 1.8;
        this._contact.shadow.camera.left = -span;
        this._contact.shadow.camera.right = span;
        this._contact.shadow.camera.top = span;
        this._contact.shadow.camera.bottom = -span;
        this._contact.shadow.camera.updateProjectionMatrix();
      }
      this._scene.add(object);
    }

    /** Re-frame the camera on the current object from the default angle, at
     *  zoom level 0. Immediate (the poster renderer relies on that). */
    resetView() {
      if (!this._object) return;
      this._resetZoom();
      this._frame(false);
    }

    /** Current zoom level, 0 (default framing) to 1 (closest). */
    get zoomLevel() {
      return this._zoomGoal || 0;
    }

    zoomIn() {
      this._zoomTo(this.zoomLevel + ZOOM_STEP);
    }

    zoomOut() {
      this._zoomTo(this.zoomLevel - ZOOM_STEP);
    }

    /** Animate to a zoom level (0..1). */
    setZoom(level) {
      this._zoomTo(level);
    }

    _resetZoom() {
      this._zoomNow = this._zoomGoal = 0;
      if (this._bounds) this._focus.copy(this._bounds.center);
      this._notifyZoom();
    }

    _notifyZoom() {
      if (this._zoomSent === this._zoomGoal) return;
      this._zoomSent = this._zoomGoal;
      const level = this._zoomGoal;
      this.dispatchEvent(
        new CustomEvent('zoomchange', {
          detail: { level, atMin: level <= 0, atMax: level >= 1 },
          bubbles: true,
          composed: true,
        })
      );
    }

    /** Set the target level. `focus` (a Vector3) is the point to centre on once
     *  zoomed in; `instant` skips the easing (used while fingers are on it). */
    _zoomTo(level, focus, instant) {
      if (!this._bounds) return;
      level = clamp01(level);
      // Zooming in from the default view starts from the object centre,
      // unless a point was given.
      if (focus) this._focus.copy(focus);
      else if (this._zoomGoal === 0) this._focus.copy(this._bounds.center);
      this._zoomGoal = level;
      if (instant || this._reducedMotion.matches) this._zoomNow = level;
      // The user has chosen a view: stop the turntable and keep the framing.
      this._userMoved = true;
      this._applyMotion();
      this._notifyZoom();
    }

    /** Ease the zoom level and place the camera for it. Runs every frame.
     *  The distance goes from the default framing (level 0) to _minSurface
     *  short of the carton's surface (level 1) on a log scale, so each step
     *  feels the same. The surface is found along the view ray, so the camera
     *  stays outside the carton however it is turned. */
    _updateZoom(time) {
      if (!this._bounds) return;
      const THREE = this._THREE;
      const dt = Math.min(0.1, Math.max(0, (time - (this._lastTime ?? time)) / 1000));
      this._lastTime = time;
      const diff = this._zoomGoal - this._zoomNow;
      if (diff) {
        this._zoomNow = Math.abs(diff) < 5e-4 ? this._zoomGoal : this._zoomNow + diff * (1 - Math.exp(-dt * 9));
      }
      const z = this._zoomNow;
      const camera = this._camera;
      const target = this._controls.target;

      // Slide the orbit target towards the focus point as the view zooms in
      // (and back to the centre as it zooms out), carrying the camera along.
      // Only the slide is applied, so a user pan is left alone.
      const goal = this._bounds.center.clone().lerp(this._focus, clamp01(z / ZOOM_FOCUS_AT));
      const shift = goal.sub(this._focusApplied);
      target.add(shift);
      camera.position.add(shift);
      this._focusApplied.add(shift);

      const dir = camera.position.clone().sub(target);
      if (dir.lengthSq() < 1e-12) return;
      dir.normalize();
      // Distance from the target to the carton's surface, looking back along dir.
      const reach = this._bounds.radius * 4 + target.distanceTo(this._bounds.center);
      this._ray.set(target.clone().addScaledVector(dir, reach), dir.clone().negate());
      const hit = this._ray.intersectBox(this._box, new THREE.Vector3());
      this._exit = hit ? Math.max(0, reach - hit.distanceTo(this._ray.origin)) : 0;
      const closest = Math.min(this._dist, this._minSurface + this._exit);
      camera.position.copy(target).addScaledVector(dir, Math.pow(this._dist, 1 - z) * Math.pow(closest, z));
    }

    /** Wheel, pinch and double-tap zoom. A plain wheel is left alone (the page
     *  scrolls) unless the `zoom` attribute is set. */
    _bindZoom(el) {
      const allowed = () => !this.hasAttribute('no-zoom');
      // Level change per unit of ln(scale) for a pinch (scale > 1 zooms in).
      const span = () => 1 / Math.log(this._dist / (this._minSurface + this._exit));

      // Ctrl + wheel, which is how browsers report a trackpad pinch: zoom and
      // keep the page itself from zooming. Only that is cancelled, so the
      // plain wheel still scrolls the page.
      el.addEventListener(
        'wheel',
        (e) => {
          if (!allowed() || !(e.ctrlKey || this.hasAttribute('zoom'))) return;
          e.preventDefault();
          const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 100 : 1);
          const cap = e.ctrlKey ? 25 : 100;
          this._zoomTo(this._zoomGoal - Math.max(-cap, Math.min(cap, dy)) * (e.ctrlKey ? 0.008 : 0.002));
        },
        { passive: false }
      );

      // Two-finger pinch (pointer events) and double-tap / double-click.
      const pointers = new Map();
      let pinch = null;
      let press = null;
      let lastTap = null;
      const spread = () => {
        const [a, b] = [...pointers.values()];
        return Math.hypot(a.x - b.x, a.y - b.y) || 1;
      };
      el.addEventListener('pointerdown', (e) => {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 2) {
          pinch = allowed() ? { from: spread(), level: this._zoomGoal } : null;
          press = lastTap = null;
        } else {
          press = pointers.size === 1 && e.button === 0 ? { x: e.clientX, y: e.clientY, time: e.timeStamp } : null;
        }
      });
      el.addEventListener('pointermove', (e) => {
        const p = pointers.get(e.pointerId);
        if (!p) return;
        p.x = e.clientX;
        p.y = e.clientY;
        if (pinch && pointers.size >= 2) {
          this._zoomTo(pinch.level + Math.log(spread() / pinch.from) * span(), null, true);
        }
      });
      const release = (e) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinch = null;
      };
      el.addEventListener('pointercancel', (e) => {
        release(e);
        press = null;
      });
      el.addEventListener('pointerup', (e) => {
        release(e);
        const tap = press;
        press = null;
        if (!tap || pointers.size || !allowed()) return;
        // A drag or a long press is not a tap.
        if (Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8 || e.timeStamp - tap.time > 400) {
          lastTap = null;
        } else if (
          lastTap &&
          e.timeStamp - lastTap.time < DOUBLE_TAP_MS &&
          Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30
        ) {
          lastTap = null;
          this._toggleZoom(e.clientX, e.clientY);
        } else {
          lastTap = { x: e.clientX, y: e.clientY, time: e.timeStamp };
        }
      });

      // A two-finger gesture must not scroll or zoom the page. touch-action
      // already withholds pinch; this also covers iOS, where it is not enough.
      const hold = (e) => {
        if (allowed() && e.touches.length >= 2 && e.cancelable) e.preventDefault();
      };
      el.addEventListener('touchstart', hold, { passive: false });
      el.addEventListener('touchmove', hold, { passive: false });

      // Safari reports a desktop trackpad pinch as gesture events instead.
      let gestureFrom = 0;
      el.addEventListener('gesturestart', (e) => {
        e.preventDefault();
        gestureFrom = this._zoomGoal;
      });
      el.addEventListener('gesturechange', (e) => {
        e.preventDefault();
        if (allowed() && !pinch) this._zoomTo(gestureFrom + Math.log(e.scale) * span(), null, true);
      });
    }

    /** Double-tap: back out if zoomed in, otherwise zoom in on the point that
     *  was tapped (or towards the centre when it missed the carton). */
    _toggleZoom(clientX, clientY) {
      if (this._zoomGoal > 0.05) {
        this._zoomTo(0);
        return;
      }
      let point = null;
      if (this._object) {
        const rect = this._renderer.domElement.getBoundingClientRect();
        const ndc = new this._THREE.Vector2(
          ((clientX - rect.left) / rect.width) * 2 - 1,
          -((clientY - rect.top) / rect.height) * 2 + 1
        );
        this._raycaster.setFromCamera(ndc, this._camera);
        const hit = this._raycaster.intersectObject(this._object, true)[0];
        if (hit) point = hit.point;
      }
      this._zoomTo(DOUBLE_TAP_ZOOM, point || this._bounds.center);
    }

    /**
     * Render one frame at width x height (CSS pixels, pixel ratio 1) and
     * return it as a data URL. The live view is restored afterwards. Opaque
     * output (any non-PNG type, or a stage without the `transparent`
     * attribute) is filled with the stage background color.
     */
    renderToDataURL(width, height, type = 'image/png', quality = 0.92) {
      if (!this._renderer || !this._object) {
        throw new Error('three-d-stage: not ready - await stage.ready and call setObject first');
      }
      const THREE = this._THREE;
      const renderer = this._renderer;
      const camera = this._camera;
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));

      const prevPos = camera.position.clone();
      const prevTarget = this._controls.target.clone();
      const prevApplied = this._focusApplied.clone();
      const prevAspect = camera.aspect;
      const prevNear = camera.near;
      const prevFar = camera.far;
      const prevRatio = renderer.getPixelRatio();

      const opaque = !this._transparent || type !== 'image/png';
      if (opaque) {
        const bg = this.getAttribute('background') || DEFAULT_BG;
        renderer.setClearColor(new THREE.Color(bg), 1);
      }

      let url;
      try {
        renderer.setPixelRatio(1);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        this._frame(true);
        this._controls.update();
        renderer.render(this._scene, camera);
        url = renderer.domElement.toDataURL(type, quality);
      } finally {
        renderer.setClearColor(0x000000, 0);
        renderer.setPixelRatio(prevRatio);
        camera.position.copy(prevPos);
        this._controls.target.copy(prevTarget);
        this._focusApplied.copy(prevApplied);
        camera.aspect = prevAspect;
        camera.near = prevNear;
        camera.far = prevFar;
        this._fit();
        this._controls.update();
        renderer.render(this._scene, camera);
      }
      return url;
    }
  }

  if (!customElements.get('three-d-stage')) customElements.define('three-d-stage', ThreeDStage);
})();
