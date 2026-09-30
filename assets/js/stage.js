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
 *   zoom        - allow wheel / pinch zoom (off by default so the wheel keeps
 *                 scrolling the page)
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
 *   stage.renderToDataURL(w, h, type = 'image/png', quality = 0.92)
 *                                  render one frame at w x h, return a data URL
 *   'stage-ready' event            fired when ready resolves
 *   'stage-error' event            fired with detail: { error } on failure
 *   [data-state]                   "loading" | "ready" | "error" on the host
 */
(() => {
  const DEFAULT_BG = '#f0eee6';

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
      controls.enableZoom = this.hasAttribute('zoom');
      controls.enablePan = this.hasAttribute('pan');
      this._controls = controls;
      // OrbitControls sets touch-action:none, which would trap page scrolling
      // on touch devices. Let vertical swipes scroll the page; horizontal
      // drags still rotate the model.
      renderer.domElement.style.touchAction = 'pan-y';

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
      controls.addEventListener('start', () => {
        this._userMoved = true;
        applyMotion();
      });
      this._reducedMotion.addEventListener('change', applyMotion);
      applyMotion();

      const fit = () => {
        const w = this.clientWidth || 1;
        const h = this.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        // Keep the object framed while the layout changes (e.g. rotating a
        // phone), unless the user has already chosen their own view.
        if (this._object && !this._userMoved) this._frame(true);
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

      this._loop = () => {
        if (!this._visible) return;
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

    /** Position the camera so the object's bounding sphere fits the view.
     *  keepDirection retains the current viewing direction (used on resize). */
    _frame(keepDirection) {
      const THREE = this._THREE;
      const sphere = this._bounds;
      if (!sphere) return;
      const camera = this._camera;
      const controls = this._controls;

      // Fit against the narrower field of view (horizontal on portrait boxes).
      // Portrait boxes (phones) get a tighter margin so the carton fills more
      // of the stage.
      const half = Math.tan((camera.fov * Math.PI) / 360) * Math.min(1, camera.aspect);
      const pad = camera.aspect < 1 ? 1.22 : 1.35;
      const dist = (sphere.radius / half) * pad;

      const dir = keepDirection
        ? camera.position.clone().sub(controls.target).normalize()
        : new THREE.Vector3(1, 0.55, 1.25).normalize();
      camera.position.copy(sphere.center).add(dir.multiplyScalar(dist));
      camera.near = Math.max(dist / 100, 0.01);
      camera.far = dist * 100;
      camera.updateProjectionMatrix();
      controls.target.copy(sphere.center);
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
        this._bounds = box.getBoundingSphere(new THREE.Sphere());
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

    /** Re-frame the camera on the current object from the default angle. */
    resetView() {
      if (this._object) this._frame(false);
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
