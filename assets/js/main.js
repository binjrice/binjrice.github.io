// Binj site behaviour: 3D pack (5 kg carton / 2 kg can), size switch, lid
// toggle, navigation, reveals, print.
// Loaded as an ES module; stage.js (classic script) defines <three-d-stage>.

const root = document.documentElement;
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const isPosterMode = root.classList.contains('is-poster') || /[?&]poster\b/.test(location.search);
const params = new URLSearchParams(location.search);

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// rAF does not fire in hidden tabs, so never wait on it alone.
const nextFrame = () =>
  Promise.race([new Promise((resolve) => requestAnimationFrame(() => resolve())), wait(100)]);

// ----------------------------------------------------------- scroll reveals
function initReveal() {
  root.classList.add('reveal-ready');
  const targets = $$('[data-reveal]');

  for (const el of targets) {
    if (el.dataset.reveal === 'group') {
      [...el.children].forEach((child, i) => child.style.setProperty('--i', i));
    }
  }

  const showAll = () => targets.forEach((el) => el.classList.add('is-in'));
  if (reducedMotion.matches || isPosterMode || !('IntersectionObserver' in window)) {
    showAll();
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-in');
          observer.unobserve(entry.target);
        }
      }
    },
    { rootMargin: '0px 0px -6% 0px', threshold: 0.06 }
  );
  targets.forEach((el) => observer.observe(el));

  // Printing (or a jump to the end of the page) must never catch content hidden.
  window.addEventListener('beforeprint', showAll);
}

// ------------------------------------------------------------- navigation
function initMenu() {
  const header = $('.site-header');
  const toggle = $('.menu-toggle');
  const nav = $('#site-nav');
  if (!header || !toggle || !nav) return;

  const desktop = window.matchMedia('(min-width: 68rem)');

  const setOpen = (open, { restoreFocus = false } = {}) => {
    header.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (!open && restoreFocus) toggle.focus();
  };

  toggle.addEventListener('click', () => {
    setOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header.classList.contains('is-open')) {
      setOpen(false, { restoreFocus: true });
    }
  });

  document.addEventListener('click', (event) => {
    if (header.classList.contains('is-open') && !header.contains(event.target)) setOpen(false);
  });

  desktop.addEventListener('change', () => setOpen(false));

  // Closed navigation must not be reachable by keyboard.
  const syncInert = () => {
    const collapsed = !desktop.matches && toggle.getAttribute('aria-expanded') !== 'true';
    nav.toggleAttribute('inert', collapsed);
  };
  new MutationObserver(syncInert).observe(toggle, { attributes: true, attributeFilter: ['aria-expanded'] });
  desktop.addEventListener('change', syncInert);
  syncInert();
}

/** Mark the navigation link of the section currently in view. */
function initActiveSection() {
  if (!('IntersectionObserver' in window)) return;
  const links = new Map(
    $$('.site-nav__list a[href^="#"]').map((a) => [a.getAttribute('href').slice(1), a])
  );
  // Sections currently crossing the reading band; the hero (not in the
  // navigation) and the gaps between sections leave the set empty, which
  // clears the marker instead of leaving the previous section highlighted.
  const inView = new Set();
  const sync = () => {
    let current = null;
    links.forEach((_, id) => {
      if (inView.has(id)) current = id;
    });
    links.forEach((link, id) => {
      if (id === current) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    });
  };
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) inView.add(entry.target.id);
        else inView.delete(entry.target.id);
      }
      sync();
    },
    { rootMargin: '-40% 0px -55% 0px' }
  );
  links.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
}

function initPrint() {
  $$('[data-print]').forEach((button) => button.addEventListener('click', () => window.print()));
  initPrintPoster();
}

// ---------------------------------------------------------------- 3D stage
// Two packs share the stage: the 5 kg carton (the default) and the 2 kg can.
// A model is built the first time its size is shown and kept after that, so
// switching back is instant and each lid keeps the state it was left in.
const SIZES = ['5kg', '2kg'];
const DEFAULT_SIZE = SIZES[0];
// A module that failed to fetch stays failed for its URL, so a retry asks for a
// new one (the query is ignored by the server).
const PRODUCTS = {
  '5kg': async (THREE, options, retry) =>
    (await import(`./binj-box.js${retry ? `?retry=${retry}` : ''}`)).buildBinjBox(THREE, options),
  '2kg': async (THREE, options, retry) =>
    (await import(`./binj-can.js${retry ? `?retry=${retry}` : ''}`)).buildBinjCan(THREE, options),
};

const stage = $('three-d-stage');
const stageBox = $('.stage');
const lidButton = $('#lid-toggle');
const zoomInButton = $('#zoom-in');
const zoomOutButton = $('#zoom-out');
const sizeGroup = $('.stage__size');
const sizeOptions = $$('.stage__size-option');

const wantedSize = (params.get('size') || '').toLowerCase();
let size = SIZES.includes(wantedSize) ? wantedSize : DEFAULT_SIZE; // the selected pack
const built = new Map(); // size -> product { model, setOpen, toggle, isOpen }
const building = new Map(); // size -> promise of a product, while it loads
const attempts = new Map(); // size -> how many builds have failed
let current = null; // the product on stage: { size, product }
let stageFailed = false; // WebGL could not start

let resolveMounted;
const mounted = new Promise((resolve) => (resolveMounted = resolve));

const selectedOption = () => sizeOptions.find((option) => option.dataset.value === size);

function setStageState(state) {
  if (stageBox) stageBox.dataset.state = state;
  if (lidButton) lidButton.disabled = state !== 'ready';
  syncZoom();
}

// Whether an image exists; each file is probed once, so a missing poster never
// shows a broken image.
const imageProbes = new Map();
function canLoad(src) {
  if (!imageProbes.has(src)) {
    imageProbes.set(
      src,
      new Promise((resolve) => {
        const probe = new Image();
        probe.onload = () => resolve(true);
        probe.onerror = () => resolve(false);
        probe.src = src;
      })
    );
  }
  return imageProbes.get(src);
}

// The still image of the selected pack, if there is one. Used when the 3D view
// cannot be shown.
async function showFallback() {
  setStageState('error');
  const panel = $('.stage__fallback', stageBox);
  const img = $('.stage__poster', stageBox);
  const option = selectedOption();
  if (!panel || !img || !option) return;
  img.hidden = true;
  delete panel.dataset.image;
  const src = option.dataset.poster;
  if (!src || !(await canLoad(src))) return;
  // The selection may have moved on while the file was probed.
  if (option !== selectedOption() || stageBox.dataset.state !== 'error') return;
  img.alt = option.dataset.posterAlt || '';
  img.src = src;
  img.hidden = false;
  panel.dataset.image = 'on';
}

// The print sheet opens with a still of the carton. It is only fetched when it
// exists, and the sheet lists both packs whichever one is selected.
async function initPrintPoster() {
  const printPoster = $('.print-head__poster');
  const option = sizeOptions.find((item) => item.dataset.value === DEFAULT_SIZE);
  const src = option && option.dataset.poster;
  if (!printPoster || !src || !(await canLoad(src))) return;
  printPoster.src = src;
  root.classList.add('has-poster');
}

function syncLid(open) {
  const label = $('.btn__label', lidButton);
  lidButton.dataset.open = String(open);
  label.textContent = open ? lidButton.dataset.labelClose : lidButton.dataset.labelOpen;
}

// + / - buttons. They follow the stage's zoom level and step aside at the ends;
// focus moves to the other button when the one being pressed is disabled.
// Both rest while no model is on stage.
function syncZoom() {
  if (!zoomInButton || !zoomOutButton || !stage) return;
  const ready = stageBox.dataset.state === 'ready';
  const level = stage.zoomLevel;
  const focused = document.activeElement;
  zoomOutButton.disabled = !ready || level <= 0;
  zoomInButton.disabled = !ready || level >= 1;
  if (focused === zoomInButton && zoomInButton.disabled) zoomOutButton.focus();
  if (focused === zoomOutButton && zoomOutButton.disabled) zoomInButton.focus();
}

function wireStageControls() {
  lidButton.addEventListener('click', () => current && current.product.toggle());
  zoomInButton.addEventListener('click', () => stage.zoomIn());
  zoomOutButton.addEventListener('click', () => stage.zoomOut());
  stage.addEventListener('zoomchange', syncZoom);
}

/** Build (or fetch) the product for one size. A failed build can be retried. */
function buildProduct(which) {
  if (!building.has(which)) {
    const promise = (async () => {
      const [{ THREE }] = await Promise.all([stage.ready, document.fonts.ready]);
      const product = await PRODUCTS[which](
        THREE,
        {
          fontsReady: document.fonts.ready,
          onChange: (open) => {
            if (current && current.size === which) syncLid(open);
          },
        },
        attempts.get(which)
      );
      built.set(which, product);
      return product;
    })();
    building.set(which, promise);
    promise.catch(() => {
      building.delete(which);
      attempts.set(which, (attempts.get(which) || 0) + 1);
    });
  }
  return building.get(which);
}

/** Put the selected pack on stage. Resolves with its product, or null when it
 *  could not be shown (or the selection moved on while it loaded). */
async function showProduct() {
  if (stageFailed) {
    showFallback();
    return null;
  }
  const which = size;
  let product = built.get(which);
  if (!product) {
    // The first time a size is shown: the loader covers the wait.
    setStageState('loading');
    try {
      product = await buildProduct(which);
    } catch (error) {
      console.warn(`Binj ${which} 3D model unavailable, showing the still image:`, error);
      if (which === size) showFallback();
      return null;
    }
    if (which !== size) return null;
  }
  if (!current || current.product !== product) {
    current = { size: which, product };
    stage.setObject(product.model);
    window.__binjBox = product;
  }
  syncLid(product.isOpen());
  setStageState('ready');
  return product;
}

// -------------------------------------------------------------- pack size
/** Reflect the selected size in the page: copy, control, stage label, links. */
function applySize() {
  root.dataset.pack = size;
  for (const option of sizeOptions) {
    const checked = option.dataset.value === size;
    option.setAttribute('aria-checked', String(checked));
    option.tabIndex = checked ? 0 : -1;
  }
  const option = selectedOption();
  if (stage && option && option.dataset.stageLabel) {
    stage.setAttribute('aria-label', option.dataset.stageLabel);
  }
  // The other language opens on the same pack.
  const query = size === DEFAULT_SIZE ? '' : `?size=${size}`;
  for (const link of $$('.lang-link')) {
    link.dataset.href = link.dataset.href || link.getAttribute('href');
    link.setAttribute('href', link.dataset.href + query);
  }
}

/** Keep the address bar on the selected size without adding history entries. */
function syncUrl() {
  if (isPosterMode) return;
  try {
    const url = new URL(location.href);
    if (size === DEFAULT_SIZE) url.searchParams.delete('size');
    else url.searchParams.set('size', size);
    history.replaceState(history.state, '', url);
  } catch (error) {
    // Some sandboxes refuse replaceState; the choice simply is not in the URL.
  }
}

function selectSize(next) {
  if (!SIZES.includes(next) || next === size) return;
  size = next;
  applySize();
  syncUrl();
  showProduct();
}

// Radio group: arrows move the selection, Tab enters on the checked option.
function initSizeSwitch() {
  applySize();
  if (!sizeGroup) return;
  const rtl = root.dir === 'rtl';
  const steps = {
    ArrowDown: 1,
    ArrowUp: -1,
    ArrowRight: rtl ? -1 : 1,
    ArrowLeft: rtl ? 1 : -1,
  };

  sizeGroup.addEventListener('click', (event) => {
    const option = event.target.closest('.stage__size-option');
    if (option) selectSize(option.dataset.value);
  });

  sizeGroup.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.altKey || event.metaKey) return;
    const from = sizeOptions.indexOf(event.target.closest('.stage__size-option'));
    let to = -1;
    if (event.key in steps) to = (from + steps[event.key] + sizeOptions.length) % sizeOptions.length;
    else if (event.key === 'Home') to = 0;
    else if (event.key === 'End') to = sizeOptions.length - 1;
    if (from < 0 || to < 0) return;
    event.preventDefault();
    sizeOptions[to].focus();
    selectSize(sizeOptions[to].dataset.value);
  });
}

async function initStage() {
  if (!stage) return;
  if (isPosterMode) stage.removeAttribute('autorotate');

  wireStageControls();
  stage.addEventListener('stage-error', () => {
    stageFailed = true;
    showFallback();
  });

  try {
    await Promise.all([stage.ready, document.fonts.ready]);
  } catch (error) {
    console.warn('Binj 3D viewer unavailable, showing the still image:', error);
    stageFailed = true;
    showFallback();
    resolveMounted(null);
    return;
  }

  const product = await showProduct();
  if (product && isPosterMode) {
    if (params.has('open')) {
      product.setOpen(true);
      await wait(2200);
    }
    stage.resetView();
  }
  resolveMounted(product);
}

// Poster mode: stills for the imagery step. Usage from a headless browser:
//   await window.__binjPoster(1400, 1400, 'image/webp', 0.9)  ->  data URL
// Add &open to the URL to render the lid open, and &size=2kg for the can (the
// carton otherwise). The pack is always framed from the default three-quarter
// view.
window.__binjPoster = async (width = 1400, height = 1400, type = 'image/png', quality = 0.92) => {
  const product = await mounted;
  if (!product) throw new Error('3D viewer is not available');
  await nextFrame();
  stage.resetView();
  return stage.renderToDataURL(width, height, type, quality);
};

// ------------------------------------------------------------------- start
initReveal();
if (!isPosterMode) {
  initMenu();
  initActiveSection();
  initPrint();
}
initSizeSwitch();
initStage();
