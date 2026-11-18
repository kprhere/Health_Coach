import test from 'node:test';
import assert from 'node:assert/strict';
import { navLift, typesKeyboard, installViewportGuard } from '../src/viewportGuard.js';

// iPhone 15 Pro: 852 px tall. With the keyboard open iOS shrinks the layout
// to about 516 px; the bug leaves it there after the keyboard closes.
const SCREEN = 852;
const STUCK = 516;

test('layout stuck at keyboard height: nav is moved down to the real screen bottom', () => {
  assert.equal(navLift({ layoutHeight: STUCK, screenHeight: SCREEN }), SCREEN - STUCK);
  assert.equal(navLift({ layoutHeight: STUCK, vv: { height: SCREEN, offsetTop: 0 } }), SCREEN - STUCK);
});

test('normal layout: nav stays where CSS puts it', () => {
  assert.equal(navLift({ layoutHeight: SCREEN, screenHeight: SCREEN, vv: { height: SCREEN, offsetTop: 0 } }), 0);
  assert.equal(navLift({ layoutHeight: SCREEN }), 0);
  assert.equal(navLift({ layoutHeight: SCREEN + 0.6, screenHeight: SCREEN }), 0);
});

test('while typing the shorter screen is expected and the nav is not moved', () => {
  assert.equal(navLift({ layoutHeight: STUCK, screenHeight: SCREEN, typing: true }), 0);
});

test('the nav is never lifted up, and never pushed fully off-screen', () => {
  assert.equal(navLift({ layoutHeight: SCREEN, vv: { height: 400, offsetTop: 0 } }), 0);
  assert.ok(navLift({ layoutHeight: 50, screenHeight: SCREEN }) <= Math.round(SCREEN * 0.6));
  assert.equal(navLift({ layoutHeight: 0, screenHeight: SCREEN }), 0);
});

test('only fields that open the keyboard count as typing', () => {
  assert.equal(typesKeyboard({ tagName: 'INPUT', type: 'text' }), true);
  assert.equal(typesKeyboard({ tagName: 'INPUT', type: '' }), true);
  assert.equal(typesKeyboard({ tagName: 'TEXTAREA' }), true);
  assert.equal(typesKeyboard({ tagName: 'INPUT', type: 'checkbox' }), false);
  assert.equal(typesKeyboard({ tagName: 'BUTTON' }), false);
  assert.equal(typesKeyboard(null), false);
});

// A fake iPhone Home Screen window, to run the real install code end to end.
function fakeIphone() {
  const listeners = {};
  const vvListeners = {};
  const docListeners = {};
  const style = new Map();
  const classes = new Set();
  const scrolls = [];
  const timers = [];
  const win = {
    innerHeight: SCREEN, innerWidth: 393, scrollY: 400,
    screen: { width: 393, height: SCREEN },
    navigator: { standalone: true },
    matchMedia: () => ({ matches: true }),
    visualViewport: { height: SCREEN, offsetTop: 0, addEventListener: (t, f) => { (vvListeners[t] ||= []).push(f); } },
    addEventListener: (t, f) => { (listeners[t] ||= []).push(f); },
    requestAnimationFrame: (f) => { f(); return 1; },
    setTimeout: (f) => { timers.push(f); return timers.length; },
    scrollTo: (x, y) => { scrolls.push([x, y]); },
  };
  const doc = {
    hidden: false, activeElement: null,
    documentElement: {
      scrollHeight: 3000,
      style: { setProperty: (k, v) => style.set(k, v) },
      classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) },
    },
    addEventListener: (t, f) => { (docListeners[t] ||= []).push(f); },
  };
  const fire = (bag, t, e = {}) => (bag[t] || []).forEach((f) => f(e));
  const runTimers = () => { while (timers.length) timers.shift()(); };
  return { win, doc, style, classes, scrolls, fire, runTimers, listeners, vvListeners, docListeners };
}

test('end to end: type a set, close the keyboard while iOS keeps the short layout, nav returns to the bottom', () => {
  const p = fakeIphone();
  installViewportGuard(p.win, p.doc);
  assert.equal(p.style.get('--nav-lift'), '0px');

  // Tap the reps box: keyboard opens, layout shrinks, nav hidden and not moved.
  const reps = { tagName: 'INPUT', type: 'text' };
  p.doc.activeElement = reps;
  p.fire(p.docListeners, 'focusin', { target: reps });
  p.win.innerHeight = STUCK;
  p.win.visualViewport.height = STUCK;
  p.fire(p.vvListeners, 'resize');
  assert.ok(p.classes.has('kb-open'));
  assert.equal(p.style.get('--nav-lift'), '0px');

  // Tap Done: keyboard closes, the screen is full again, but iOS leaves the
  // layout height stuck at the keyboard value (the bug in the screenshot).
  p.doc.activeElement = null;
  p.win.visualViewport.height = SCREEN;
  p.fire(p.docListeners, 'focusout');
  p.runTimers();
  assert.ok(!p.classes.has('kb-open'), 'nav visible again');
  assert.ok(p.scrolls.length >= 2, 'nudged a re-layout with a real scroll');
  assert.deepEqual(p.scrolls.at(-1), [0, 400], 'and put the scroll position back');
  assert.equal(p.style.get('--nav-lift'), `${SCREEN - STUCK}px`, 'nav moved down to the real bottom');

  // Once iOS restores the layout height, the correction goes back to 0.
  p.win.innerHeight = SCREEN;
  p.fire(p.vvListeners, 'resize');
  assert.equal(p.style.get('--nav-lift'), '0px');
});

test('returning to the app re-checks the layout', () => {
  const p = fakeIphone();
  installViewportGuard(p.win, p.doc);
  p.win.innerHeight = STUCK;
  p.fire(p.docListeners, 'visibilitychange');
  assert.equal(p.style.get('--nav-lift'), `${SCREEN - STUCK}px`);
});
