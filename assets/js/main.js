// Binj site behaviour: 3D carton, lid toggle, navigation, reveals, print.
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

  // The poster is only fetched when it exists, so a missing file never shows
  // a broken image. Once it loads it is also used at the top of the print sheet.
  const printPoster = $('.print-head__poster');
  const source = printPoster && printPoster.dataset.src;
  if (!source) return;
  const probe = new Image();
  probe.onload = () => {
    printPoster.src = source;
    root.classList.add('has-poster');
  };
  probe.src = source;
}

// ---------------------------------------------------------------- 3D stage
const stage = $('three-d-stage');
const stageBox = $('.stage');
const lidButton = $('#lid-toggle');
const zoomInButton = $('#zoom-in');
const zoomOutButton = $('#zoom-out');

let resolveMounted;
const mounted = new Promise((resolve) => (resolveMounted = resolve));

function setStageState(state) {
  if (stageBox) stageBox.dataset.state = state;
}

function showFallback() {
  setStageState('error');
  const img = $('.stage__poster', stageBox);
  if (!img || !img.dataset.src) return;
  img.onload = () => {
    img.hidden = false;
  };
  img.onerror = () => {
    img.hidden = true;
  };
  img.src = img.dataset.src;
}

function wireLidButton(box) {
  const label = $('.btn__label', lidButton);
  const sync = (open) => {
    lidButton.dataset.open = String(open);
    label.textContent = open ? lidButton.dataset.labelClose : lidButton.dataset.labelOpen;
  };
  lidButton.addEventListener('click', () => box.toggle());
  sync(box.isOpen());
  return sync;
}

// + / - buttons. They follow the stage's zoom level and step aside at the ends;
// focus moves to the other button when the one being pressed is disabled.
function wireZoomButtons() {
  if (!zoomInButton || !zoomOutButton) return;
  const sync = () => {
    const level = stage.zoomLevel;
    const active = document.activeElement;
    zoomOutButton.disabled = level <= 0;
    zoomInButton.disabled = level >= 1;
    if (active === zoomInButton && zoomInButton.disabled) zoomOutButton.focus();
    if (active === zoomOutButton && zoomOutButton.disabled) zoomInButton.focus();
  };
  zoomInButton.addEventListener('click', () => stage.zoomIn());
  zoomOutButton.addEventListener('click', () => stage.zoomOut());
  stage.addEventListener('zoomchange', sync);
  sync();
}

async function initStage() {
  if (!stage) return;
  if (isPosterMode) stage.removeAttribute('autorotate');

  stage.addEventListener('stage-error', () => showFallback());

  try {
    const [{ THREE }] = await Promise.all([stage.ready, document.fonts.ready]);
    const { buildBinjBox } = await import('./binj-box.js');

    let syncLid = () => {};
    const box = await buildBinjBox(THREE, {
      fontsReady: document.fonts.ready,
      onChange: (open) => syncLid(open),
    });
    stage.setObject(box.model);
    syncLid = wireLidButton(box);
    lidButton.disabled = false;
    wireZoomButtons();
    setStageState('ready');

    window.__binjBox = box;

    if (isPosterMode) {
      if (params.has('open')) {
        box.setOpen(true);
        await wait(2200);
      }
      stage.resetView();
    }
    resolveMounted(box);
  } catch (error) {
    console.warn('Binj 3D viewer unavailable, showing the still image:', error);
    showFallback();
    resolveMounted(null);
  }
}

// Poster mode: stills for the imagery step. Usage from a headless browser:
//   await window.__binjPoster(1400, 1400, 'image/webp', 0.9)  ->  data URL
// Add &open to the URL to render the lid open. The carton is always framed
// from the default three-quarter view.
window.__binjPoster = async (width = 1400, height = 1400, type = 'image/png', quality = 0.92) => {
  const box = await mounted;
  if (!box) throw new Error('3D viewer is not available');
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
initStage();
