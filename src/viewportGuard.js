// Keeps the bottom nav on the real bottom of the screen in the iPhone Home
// Screen app.
//
// The bug: after the keyboard closes, iOS can leave the page's layout height
// at the shorter "keyboard open" value. Everything pinned with bottom: 0 then
// sits where the top of the keyboard was, mid-screen, until something forces
// a re-layout. Seen 2026-11-16 (Fuel) and 2026-11-18 (Train).
//
// Three layers, so one failing on a given iOS version does not bring it back:
//   1. While a text field has focus the nav is hidden (it would ride up over
//      the fields being filled in).
//   2. When the keyboard closes, scroll the page 1px and back. A real scroll is
//      what makes iOS restore the full layout height.
//   3. Safety net: whenever the visible screen bottom is lower than the layout
//      bottom, move the nav down by the difference (--nav-lift). In the
//      full-screen Home Screen app the visible bottom is the physical screen.

const TEXT_INPUT_SKIP = /^(checkbox|radio|button|submit|reset|range|color|file|image|hidden)$/i;

export function typesKeyboard(el) {
  if (!el || !el.tagName) return false;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return el.tagName === 'INPUT' && !TEXT_INPUT_SKIP.test(el.type || '');
}

// How far (px) the nav must move DOWN to reach the real bottom of the screen.
// Never negative: the nav is only ever moved toward the bottom edge, so a wrong
// reading can at worst leave it where CSS put it, never lift it higher.
//   layoutHeight: window.innerHeight (what bottom: 0 is measured from)
//   vv: window.visualViewport, or null
//   screenHeight: the physical screen height for the current orientation when
//     running full-screen (standalone), else null
//   typing: a text field has focus, so a shorter screen is expected
export function navLift({ layoutHeight, vv = null, screenHeight = null, typing = false }) {
  if (typing || !(layoutHeight > 0)) return 0;
  let visibleBottom = layoutHeight;
  if (vv && vv.height > 0) visibleBottom = Math.max(visibleBottom, (vv.offsetTop || 0) + vv.height);
  if (screenHeight > 0) visibleBottom = Math.max(visibleBottom, screenHeight);
  const gap = Math.round(visibleBottom - layoutHeight);
  // Ignore sub-pixel noise; cap at 60% of the screen so a bad reading can
  // never push the nav fully off-screen.
  if (gap <= 1) return 0;
  return Math.min(gap, Math.round(visibleBottom * 0.6));
}

function standaloneScreenHeight(win) {
  const standalone = win.navigator && (win.navigator.standalone === true
    || (win.matchMedia && win.matchMedia('(display-mode: standalone)').matches));
  if (!standalone || !win.screen) return null;
  const long = Math.max(win.screen.width, win.screen.height);
  const short = Math.min(win.screen.width, win.screen.height);
  return win.innerWidth > win.innerHeight * 1.2 ? short : long;
}

export function installViewportGuard(win = window, doc = document) {
  const root = doc.documentElement;
  let typing = false;
  let frame = 0; // 1 while an update is queued

  const apply = () => {
    frame = 0;
    const lift = navLift({
      layoutHeight: win.innerHeight,
      vv: win.visualViewport || null,
      screenHeight: standaloneScreenHeight(win),
      typing,
    });
    root.style.setProperty('--nav-lift', `${lift}px`);
  };
  const schedule = () => {
    if (frame) return;
    frame = 1; // mark before asking, so a frame that runs at once can clear it
    win.requestAnimationFrame(apply);
  };

  const relayout = () => {
    // Scroll 1px and back so iOS recomputes the layout height.
    const y = win.scrollY;
    const maxY = Math.max(0, doc.documentElement.scrollHeight - win.innerHeight);
    win.scrollTo(0, y < maxY ? y + 1 : Math.max(0, y - 1));
    win.requestAnimationFrame(() => { win.scrollTo(0, y); schedule(); });
  };

  doc.addEventListener('focusin', (event) => {
    if (!typesKeyboard(event.target)) return;
    typing = true;
    root.classList.add('kb-open');
    schedule();
  });
  doc.addEventListener('focusout', () => {
    win.setTimeout(() => {
      if (typesKeyboard(doc.activeElement)) return;
      typing = false;
      root.classList.remove('kb-open');
      relayout();
      // iOS finishes the keyboard animation after focusout; check again.
      win.setTimeout(schedule, 350);
    }, 120);
  });

  if (win.visualViewport) {
    win.visualViewport.addEventListener('resize', schedule);
    win.visualViewport.addEventListener('scroll', schedule);
  }
  win.addEventListener('resize', schedule);
  win.addEventListener('orientationchange', () => win.setTimeout(schedule, 300));
  win.addEventListener('pageshow', schedule);
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) { relayout(); } });
  apply();
}
