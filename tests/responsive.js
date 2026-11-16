// Responsive check: renders every screen at phone, tablet and desktop widths and fails on
// horizontal scrolling or any element that sticks out past the screen edge.
// Usage: node tests/responsive.js [--shots DIR]   (screenshots optional)
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const WIDTHS = [320, 360, 390, 430, 768, 1024, 1440];
const shotsAt = process.argv.indexOf('--shots') > 0 ? process.argv[process.argv.indexOf('--shots') + 1] : null;
const VIEWS = [
  ['landing'], ['signup'], ['welcome'], ['why'], ['quiz'], ['tierresult', { tier: 'sower' }], ['archetype'],
  ['archetype-card', { view: 'archetype', season: null, band: null }],
  ['home', { view: 'app', tab: 'home' }], ['learn', { view: 'app', tab: 'learn' }], ['grow', { view: 'app', tab: 'grow' }],
  ['restore', { view: 'app', tab: 'restore' }], ['me', { view: 'app', tab: 'me' }], ['tools', { view: 'app', tab: 'tools' }],
  ['library', { view: 'app', tab: 'library' }], ['lesson', { view: 'lesson', lesson: [0, 0] }], ['lesson-deep', { view: 'lesson', lesson: [2, 3] }],
  ['case'], ['plans'], ['care'], ['security'], ['guide'], ['money'], ['paths'], ['story'], ['help'], ['actions'], ['share'],
  ['bless'], ['search'], ['involve'], ['credit'], ['giving'], ['admin'],
];

(async () => {
  const b = await chromium.launch();
  const failures = [];
  for (const w of WIDTHS) {
    const p = await b.newPage({ viewport: { width: w, height: 900 } });
    const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
    await p.goto('file://' + path.join(__dirname, '..', 'index.html'));
    await p.click('[data-act="demo-unlock"]');
    for (const [name, extra] of VIEWS) {
      const r = await p.evaluate(([name, extra]) => {
        const S = window.__hkw.S;
        Object.assign(S, { view: name, tier: S.tier || 'seed', name: 'Grace Hope', cheer: null, celebrate: null }, extra || {});
        if (name === 'archetype-card') { S.season = window.__hkw.S.season || 'starter'; S.band = 'Balanced'; }
        window.__hkw.render(); window.scrollTo(0, 0);
        const W = document.documentElement.clientWidth, bad = [];
        document.querySelectorAll('#root *').forEach(el => {
          const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return;
          if (el.closest('.hp')) return;  // screen-reader-only labels sit off screen on purpose
          // ignore content inside elements that scroll sideways on purpose
          for (let a = el.parentElement; a && a.id !== 'root'; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll' || o === 'hidden') return; }
          const rc = el.getBoundingClientRect();
          if (rc.width && (rc.right > W + 1 || rc.left < -1)) bad.push((el.className && String(el.className).slice(0, 30) || el.tagName) + ' ' + Math.round(rc.left) + '..' + Math.round(rc.right));
        });
        return { scroll: document.documentElement.scrollWidth - W, bad: bad.slice(0, 4), h1: (document.querySelector('h1,h2') || {}).textContent };
      }, [name, extra]);
      if (r.scroll > 0 || r.bad.length) failures.push(`${w}px ${name}: page scrolls sideways by ${r.scroll}px; ${r.bad.join(' | ')}`);
      if (shotsAt && [390, 1440].includes(w)) { fs.mkdirSync(shotsAt, { recursive: true }); await p.screenshot({ path: path.join(shotsAt, `${w}-${name}.png`), fullPage: false }); }
    }
    if (errs.length) failures.push(`${w}px script errors: ${errs.join('; ')}`);
    await p.close();
  }
  // Real-phone emulation (isMobile honors the viewport tag; without it phones render a 980px desktop page)
  const { devices } = require('playwright');
  for (const name of ['iPhone SE', 'iPhone 15', 'Pixel 7', 'iPad Mini']) {
    const ctx = await b.newContext({ ...devices[name] });
    const p = await ctx.newPage();
    await p.route(/fonts\.(googleapis|gstatic)/, r => r.abort());
    await p.goto('file://' + path.join(__dirname, '..', 'index.html'));
    const m = await p.evaluate(() => ({ w: innerWidth, sw: document.documentElement.scrollWidth, std: document.compatMode }));
    const want = devices[name].viewport.width;
    if (m.w !== want || m.sw > m.w) failures.push(`${name}: page is ${m.w}px wide (scroll ${m.sw}px), expected ${want}px`);
    if (m.std !== 'CSS1Compat') failures.push(`${name}: page renders in quirks mode`);
    await ctx.close();
  }
  await b.close();
  if (failures.length) { console.log(failures.join('\n')); console.log(`responsive: ${failures.length} problem(s)`); process.exitCode = 1; }
  else console.log(`responsive: ${VIEWS.length} screens x ${WIDTHS.length} widths, no sideways scrolling or overflow`);
})();
