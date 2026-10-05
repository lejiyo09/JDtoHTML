// Chromebook / ChromeOS friendliness for the SoH web page. Injected into <head> by make_site.py.
//  1. capability check (WebGL2, WebAssembly) with a readable message instead of a dead page
//  2. low-spec profile (4 GB or less RAM, ChromeOS): lower internal resolution, no MSAA.
//     Override with ?q=high or ?q=low. An explicit ?dev= list always wins.
//  3. Esc on ChromeOS leaves fullscreen: Tab also opens the SoH menu, and in fullscreen the
//     Keyboard Lock API hands Esc to the game (hold Esc to leave fullscreen)
//  4. fullscreen button (F11 / the Chromebook fullscreen key work too)
(function () {
  var qs = new URLSearchParams(location.search);
  var ua = navigator.userAgent || '';
  var isCros = /\bCrOS\b/.test(ua);
  var mem = navigator.deviceMemory || 8;           // Chrome caps this at 8
  var cores = navigator.hardwareConcurrency || 4;
  var q = qs.get('q');
  var lowSpec = q === 'low' || (q !== 'high' && (mem <= 4 || (isCros && cores <= 2)));
  window._crLowSpec = lowSpec;

  if (lowSpec && !qs.get('dev')) {
    var extra = 'gMSAAValue:1,gAdvancedResolution.Enabled:1,gAdvancedResolution.VerticalPixelCount:480';
    window._devCvars = (window._devCvars ? window._devCvars + ',' : '') + extra;
  }

  function webgl2ok() {
    try { return !!document.createElement('canvas').getContext('webgl2'); } catch (e) { return false; }
  }

  function problem(msg) {
    var d = document.createElement('div');
    d.style.cssText = 'position:fixed;inset:0;z-index:1000;background:#111;color:#eee;display:flex;' +
      'align-items:center;justify-content:center;text-align:center;padding:24px;font:16px/1.5 sans-serif';
    d.innerHTML = '<div style="max-width:560px">' + msg + '</div>';
    document.body.appendChild(d);
  }

  function ready(fn) {
    if (document.body) fn(); else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    if (typeof WebAssembly !== 'object' || !webgl2ok()) {
      problem('<h2>This browser can\'t run the game</h2>It needs WebAssembly and WebGL 2. ' +
        'On a Chromebook: update ChromeOS, then open <b>chrome://gpu</b> and check that WebGL2 is not disabled ' +
        '(turn on "Use graphics acceleration when available" in Settings &gt; System).');
      return;
    }

    // --- fullscreen + Esc handling
    var fsBtn = document.createElement('button');
    fsBtn.textContent = '⛶ Fullscreen';
    fsBtn.title = 'Fullscreen (Esc then opens the menu; hold Esc to leave)';
    fsBtn.style.cssText = 'position:fixed;top:8px;right:8px;z-index:102;padding:6px 10px;border:1px solid #556;' +
      'border-radius:6px;background:rgba(20,20,30,.75);color:#cde;font:13px sans-serif;cursor:pointer';
    fsBtn.addEventListener('click', function () {
      var el = document.documentElement;
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      var p = el.requestFullscreen && el.requestFullscreen();
      if (p && p.catch) p.catch(function () {});
    });
    document.body.appendChild(fsBtn);

    function lockKeys() {
      try {
        if (document.fullscreenElement) {
          if (navigator.keyboard && navigator.keyboard.lock) navigator.keyboard.lock(['Escape']).catch(function () {});
        } else if (navigator.keyboard && navigator.keyboard.unlock) {
          navigator.keyboard.unlock();
        }
      } catch (e) {}
      fsBtn.style.opacity = document.fullscreenElement ? '0.35' : '1';
    }
    document.addEventListener('fullscreenchange', lockKeys);

    // Tab -> Escape (SoH menu). ChromeOS keeps Esc for leaving fullscreen.
    var synth = false;
    window.addEventListener('keydown', function (e) {
      if (synth || e.code !== 'Tab' || e.ctrlKey || e.altKey || e.metaKey) return;
      var t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault(); e.stopPropagation();
      if (e.repeat) return;
      synth = true;
      var init = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
      var dn = new KeyboardEvent('keydown', init);
      var up = new KeyboardEvent('keyup', init);
      (document.activeElement || document.body).dispatchEvent(dn);
      setTimeout(function () { (document.activeElement || document.body).dispatchEvent(up); synth = false; }, 60);
    }, true);

    // the info bar: mention the Chromebook-friendly keys
    var info = document.getElementById('cr-info');
    if (info && !info.dataset.cb) {
      info.dataset.cb = '1';
      info.insertAdjacentHTML('afterbegin',
        'Chromebook: <b>Tab</b> = menu (Esc leaves fullscreen) &middot; fullscreen button top right' +
        (lowSpec ? ' &middot; low-spec mode on (add <code>?q=high</code> for full resolution)' : '') + '<br>');
    }
  });
})();
