// Chromebook / ChromeOS friendliness for the SoH web page. Injected into <head> by make_site.py.
//  1. capability check (WebGL2, WebAssembly) with a readable message instead of a dead page
//  2. low-spec profile (4 GB or less RAM, ChromeOS): lower internal resolution, no MSAA.
//     Override with ?q=high or ?q=low. An explicit ?dev= list always wins.
//  3. Esc on ChromeOS leaves fullscreen: Tab also opens the SoH menu, and in fullscreen the
//     Keyboard Lock API hands Esc to the game (hold Esc to leave fullscreen)
//  4. fullscreen button (F11 / the Chromebook fullscreen key work too)
//  5. mouse look: turns on the engine's own Free Look + mouse controls at boot; click mapping
//  6. offline: registers cr-sw.js, which keeps loaded files for offline use
//  7. Korean help panel (controls, saving, performance, troubleshooting)
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
    var extra = 'gSettings.MSAAValue:1,gAdvancedResolution.Enabled:1,gAdvancedResolution.VerticalResolutionToggle:1,gAdvancedResolution.VerticalPixelCount:480';
    window._devCvars = (window._devCvars ? window._devCvars + ',' : '') + extra;
  }


  // ---- Mouse look. The engine has its own (Settings > Controls > Camera Controls: "Free Look" + "Enable Mouse Controls"):
  // mouse movement is added straight to the free camera, and the automatic camera is switched off as soon as the
  // mouse moves. So no virtual gamepad is used (a virtual right stick was read as C buttons). This only turns those
  // settings on at boot. While the mouse is captured: left click = C key (B button), right click = Z key.
  var ML = { on: true, clicks: true };
  try {
    var _sv = JSON.parse(localStorage.getItem('cr-mouselook') || '{}');
    if (_sv.on === false) ML.on = false;
    if (_sv.clicks === false) ML.clicks = false;
  } catch (e) {}
  if (qs.get('ml') === '0') ML.on = false;
  if (qs.get('ml') === '1') ML.on = true;
  ML.save = function () { try { localStorage.setItem('cr-mouselook', JSON.stringify({ on: ML.on, clicks: ML.clicks })); } catch (e) {} };
  window._crMouseLook = ML;
  if (ML.on && !qs.get('dev')) {
    window._devCvars = (window._devCvars ? window._devCvars + ',' : '') +
      'gSettings.FreeLook.Enabled:1,gSettings.EnableMouse:1,gSettings.AutoCaptureMouse:1';
  }
  (function () {
    var MB = { 0: { key: 'c', code: 'KeyC', keyCode: 67 }, 2: { key: 'z', code: 'KeyZ', keyCode: 90 } }, mbHeld = {};
    function mbKey(type, a) {
      var ev = new KeyboardEvent(type, { key: a.key, code: a.code, keyCode: a.keyCode, which: a.keyCode, bubbles: true, cancelable: true });
      (document.activeElement || document.body).dispatchEvent(ev);
    }
    document.addEventListener('mousedown', function (e) {
      var a = MB[e.button];
      if (!ML.on || !ML.clicks || !a || !document.pointerLockElement || mbHeld[e.button]) return;
      mbHeld[e.button] = true; mbKey('keydown', a);
    }, true);
    document.addEventListener('mouseup', function (e) {
      var a = MB[e.button];
      if (!a || !mbHeld[e.button]) return;
      mbHeld[e.button] = false; mbKey('keyup', a);
    }, true);
    document.addEventListener('contextmenu', function (e) { if (ML.on && document.pointerLockElement) e.preventDefault(); }, true);
  })();

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

  // offline support (cr-sw.js must be served from the site root; a missing file is ignored)
  try {
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
      navigator.serviceWorker.register('cr-sw.js').then(function () { return navigator.serviceWorker.ready; }).then(function () {
        // save this page too (it was loaded before the worker controlled it)
        if (navigator.serviceWorker.controller) fetch(location.href.split('#')[0]).catch(function () {});
      }).catch(function () {});
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function () {});
    }
  } catch (e) {}

  ready(function () {
    if (typeof WebAssembly !== 'object' || !webgl2ok()) {
      problem('<h2>이 브라우저에서는 게임을 실행할 수 없습니다</h2>' +
        '게임에는 <b>WebAssembly</b>와 <b>WebGL 2</b>가 필요합니다.<br><br>' +
        '<b>크롬북에서 해결하는 방법</b><br>1. ChromeOS와 Chrome을 최신 버전으로 업데이트합니다.<br>' +
        '2. 설정 &gt; 시스템에서 "사용 가능한 경우 그래픽 가속 사용"을 켭니다.<br>' +
        '3. 주소창에 <b>chrome://gpu</b>를 입력해 WebGL2가 "Hardware accelerated"인지 확인합니다.');
      return;
    }

    // --- fullscreen + Esc handling
    var fsBtn = document.createElement('button');
    fsBtn.textContent = '\u26F6 전체화면';
    fsBtn.title = '전체화면 (전체화면에서는 Esc를 길게 눌러 나갑니다)';
    fsBtn.style.cssText = 'padding:5px 10px;border:1px solid #556;' +
      'border-radius:6px;background:rgba(20,20,30,.75);color:#cde;font:13px sans-serif;cursor:pointer';
    fsBtn.addEventListener('click', function () {
      var el = document.documentElement;
      if (document.fullscreenElement) { document.exitFullscreen(); return; }
      var p = el.requestFullscreen && el.requestFullscreen();
      if (p && p.catch) p.catch(function () {});
    });
    // bottom centre: the game's own touch buttons (L, START, ESC, stick, A/B...) use the corners and the top edge
    var bar = document.createElement('div');
    bar.style.cssText = 'position:fixed;bottom:4px;left:50%;transform:translateX(-50%);z-index:102;display:flex;gap:8px;opacity:.75';
    bar.appendChild(fsBtn);
    document.body.appendChild(bar);

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

    // Extra keys that act as other keys (the game's default map is WASD + X/C/Z, which reads oddly:
    // the key labelled "A" is "stick left"). Enter/J = A button (X), K/Backspace = B button (C), Tab = menu (Esc).
    var ALIAS = {
      Tab:       { key: 'Escape', code: 'Escape', keyCode: 27 },
      Enter:     { key: 'x', code: 'KeyX', keyCode: 88 },
      KeyJ:      { key: 'x', code: 'KeyX', keyCode: 88 },
      KeyK:      { key: 'c', code: 'KeyC', keyCode: 67 },
      Backspace: { key: 'c', code: 'KeyC', keyCode: 67 }
    };
    var synth = false, held = {};
    function aliasEvent(type, a) {
      var ev = new KeyboardEvent(type, { key: a.key, code: a.code, keyCode: a.keyCode, which: a.keyCode, bubbles: true, cancelable: true });
      synth = true;
      try { (document.activeElement || document.body).dispatchEvent(ev); } finally { synth = false; }
    }
    function aliasFor(e) {
      var a = ALIAS[e.code];
      if (!a || synth || e.ctrlKey || e.altKey || e.metaKey) return null;
      var t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return null;   // typing a name: leave the keys alone
      return a;
    }
    window.addEventListener('keydown', function (e) {
      var a = aliasFor(e);
      if (!a) return;
      e.preventDefault(); e.stopPropagation();
      if (e.repeat || held[e.code]) return;
      held[e.code] = true;
      aliasEvent('keydown', a);
    }, true);
    window.addEventListener('keyup', function (e) {
      var a = ALIAS[e.code];
      if (!a || synth || !held[e.code]) return;
      e.preventDefault(); e.stopPropagation();
      held[e.code] = false;
      aliasEvent('keyup', a);
    }, true);

    // ---- 한국어 도움말 (아래쪽 "도움말" 버튼)
    var HELP = '' +
      '<h2 style="margin:0 0 4px">젤다의 전설: 시간의 오카리나 (웹 버전)</h2>' +
      '<p style="margin:0 0 12px;color:#9ab">ROM 없이 브라우저에서 바로 실행됩니다. 설치할 것이 없습니다.</p>' +

      '<h3>1. 게임 시작하기</h3>' +
      '<ol><li>처음 접속하면 게임 파일을 내려받느라 <b>1~2분</b> 걸릴 수 있습니다. 하얀/검은 화면이 나와도 기다려 주세요.</li>' +
      '<li>닌텐도 64 로고 → 타이틀 화면이 나옵니다. 로고가 오래 걸려도 정상입니다.</li>' +
      '<li><b>Space</b>(시작 버튼)를 누르고 <b>File 1</b>을 고른 뒤 이름을 입력하면 시작합니다.</li>' +
      '<li>소리가 안 나면 화면을 한 번 클릭하거나 아무 키나 누르세요. 브라우저가 소리를 막고 있다가 풀립니다.</li></ol>' +

      '<h3>2. 조작법 (키보드)</h3>' +
      '<table style="border-collapse:collapse;width:100%">' +
      '<tr><td><b>W A S D</b></td><td>이동 (아날로그 스틱)</td></tr>' +
      '<tr><td><b>X</b> 또는 <b>Enter</b>, <b>J</b></td><td>A 버튼 (확인, 말 걸기, 구르기)</td></tr>' +
      '<tr><td><b>C</b> 또는 <b>K</b>, <b>Backspace</b></td><td>B 버튼 (칼 휘두르기, 취소)</td></tr>' +
      '<tr><td colspan="2" style="color:#fc6">※ 키보드의 <b>A</b> 키는 게임의 A 버튼이 아니라 "왼쪽 이동"입니다. 확인은 <b>Enter</b> 또는 <b>X</b>를 쓰세요.</td></tr>' +
      '<tr><td><b>Z</b></td><td>Z 버튼 (적 조준 고정, 방패)</td></tr>' +
      '<tr><td><b>Space</b></td><td>Start (일시정지, 인벤토리)</td></tr>' +
      '<tr><td><b>방향키 ← ↑ → ↓</b></td><td>C 버튼 (아이템 사용)</td></tr>' +
      '<tr><td><b>T F G H</b></td><td>십자키 (위 / 왼쪽 / 아래 / 오른쪽)</td></tr>' +
      '<tr><td><b>Tab</b></td><td>게임 설정 메뉴 (크롬북은 Esc가 전체화면 해제에 쓰여서 Tab을 추가했습니다)</td></tr>' +
      '</table>' +
      '<p style="margin:6px 0 0">USB/블루투스 <b>게임패드</b>도 연결만 하면 자동으로 인식됩니다. 버튼을 한 번 눌러 보세요.</p>' +

      '<h3>마우스 시점</h3>' +
      '<p>게임에 <b>내장된 마우스 조작</b>을 씁니다. 화면 아래 <b>마우스 시점</b>이 켜져 있으면 시작할 때 자유 시점(Free Look)과 마우스 컨트롤이 자동으로 켜집니다. ' +
      '마우스를 움직이면 <b>자동 카메라가 꺼지고 마우스로만</b> 시점이 움직입니다. ' +
      '마우스가 고정된 동안 <b>왼쪽 클릭 = C 키</b>(B 버튼), <b>오른쪽 클릭 = Z 키</b>입니다(마우스 설정에서 끌 수 있음).</p>' +
      '<ul><li>마우스가 안 잡히면 화면을 한 번 클릭하거나 <b>F2</b>를 누르세요. 메뉴(Tab)를 열면 마우스가 풀리고, 닫으면 다시 잡힙니다.</li>' +
      '<li>속도와 반전은 <b>Tab → Settings → Controls → Camera Controls</b>의 Third-Person Sensitivity, Invert Camera 항목에서 바꿉니다.</li>' +
      '<li>게임이 카메라를 고정하는 장소(일부 방, 상점 등)와 Z 조준 중에는 자유 시점이 동작하지 않습니다. 장면을 다시 불러와야 켜지는 경우도 있습니다.</li>' +
      '<li>마우스 시점 버튼을 끄거나 켜면 페이지가 새로고침됩니다.</li></ul>' +

      '<h3>오프라인 사용</h3>' +
      '<p>한 번 접속해서 게임이 뜬 뒤에는 게임 파일이 이 브라우저에 저장되어, <b>와이파이가 없어도</b> 같은 주소로 다시 열 수 있습니다. ' +
      '처음 접속은 인터넷이 필요합니다. 저장 상태: <b id="cr-off-status">확인 중...</b></p>' +
      '<p style="color:#9ab;font-size:13px">브라우저 데이터 삭제나 시크릿 모드에서는 저장이 사라집니다. 인터넷이 있을 때는 항상 최신 파일을 받습니다.</p>' +

      '<h3>3. 저장</h3>' +
      '<p>게임 안의 저장(올빼미 상, 메뉴의 저장)은 <b>이 브라우저 안</b>에 기록됩니다. ' +
      '<b>시크릿 모드</b>를 쓰거나 "사이트 데이터/쿠키 삭제"를 하면 저장이 사라지고, 다른 기기와 공유되지 않습니다. ' +
      '같은 크롬북, 같은 주소에서 같은 프로필로 열어야 이어서 할 수 있습니다.</p>' +

      '<h3>4. 화면이 느리거나 끊길 때</h3>' +
      '<ul><li>램 4GB 이하 기기는 <b>저사양 모드</b>(해상도 낮춤, 계단 보정 끔)가 자동으로 켜집니다. 수동으로 바꾸려면 주소 끝에 ' +
      '<code>?q=low</code>(저사양) 또는 <code>?q=high</code>(고화질)를 붙이세요.</li>' +
      '<li>다른 탭과 앱을 닫고, 충전기를 연결하세요. 배터리 절약 모드가 켜져 있으면 느려집니다.</li>' +
      '<li>아래쪽 <b>전체화면</b> 버튼을 쓰면 조금 더 부드럽습니다. 전체화면에서 나올 때는 <b>Esc를 길게</b> 누르세요.</li></ul>' +

      '<h3>5. 문제 해결</h3>' +
      '<ul><li><b>화면이 계속 검거나 멈춤:</b> 2~3분 기다린 뒤 <b>F5</b>(새로고침 키)를 눌러 보세요.</li>' +
      '<li><b>"이 브라우저에서는 실행할 수 없습니다" 메시지:</b> 설정 &gt; 시스템에서 그래픽 가속을 켜고, <b>chrome://gpu</b>에서 WebGL2를 확인하세요.</li>' +
      '<li><b>키가 안 먹음:</b> 게임 화면을 한 번 클릭해서 포커스를 주세요.</li>' +
      '<li><b>접속이 처음에만 느림:</b> 무료 서버가 잠들어 있다가 깨어나는 중입니다. 30초~1분이면 됩니다.</li></ul>' +

      '<p style="margin:14px 0 0;color:#9ab;font-size:13px">이 게임은 팬이 만든 비공식 프로젝트이며 닌텐도와 관련이 없습니다. ' +
      '모든 텍스처, 글꼴, 소리는 새로 생성되었고 ROM 데이터는 들어 있지 않습니다.</p>';

    var panel = document.createElement('div');
    panel.style.cssText = 'position:fixed;inset:0;z-index:1001;background:rgba(0,0,0,.82);display:none;' +
      'align-items:center;justify-content:center;padding:12px;box-sizing:border-box';
    panel.innerHTML = '<div style="max-width:640px;max-height:100%;overflow:auto;background:#14141c;color:#dde;' +
      'border:1px solid #556;border-radius:10px;padding:18px 20px;font:15px/1.6 sans-serif;box-sizing:border-box">' +
      HELP + '<div style="text-align:center;margin-top:14px"><button id="cr-help-close" style="padding:8px 28px;' +
      'border:1px solid #778;border-radius:6px;background:#2a2a3c;color:#eef;font:15px sans-serif;cursor:pointer">닫기</button></div></div>';
    panel.querySelectorAll('h3').forEach(function (h) { h.style.cssText = 'margin:16px 0 4px;color:#fc6;font-size:16px'; });
    panel.querySelectorAll('td').forEach(function (td) { td.style.cssText = 'padding:3px 8px 3px 0;vertical-align:top;color:#dde'; });
    panel.querySelectorAll('code').forEach(function (c) { c.style.cssText = 'background:#2a2a3c;padding:1px 5px;border-radius:4px'; });
    document.body.appendChild(panel);

    function offlineStatus() {
      var el = document.getElementById('cr-off-status');
      if (!el) return;
      if (!window.caches) { el.textContent = '이 브라우저는 지원하지 않음'; return; }
      caches.open('cr-offline-v1').then(function (c) { return c.keys(); }).then(function (keys) {
        var u = keys.map(function (k) { return k.url; }).join('\n');
        var need = [['soh.wasm', /soh\.wasm/], ['soh.js', /soh\.js/], ['soh.o2r', /soh\.o2r/], ['oot.o2r', /oot\.o2r/]];
        var miss = need.filter(function (n) { return !n[1].test(u); }).map(function (n) { return n[0]; });
        el.textContent = miss.length ? '아직 준비 안 됨 (없는 파일: ' + miss.join(', ') + ') - 게임이 뜰 때까지 접속해 두세요' : '준비됨 \u2705';
        el.style.color = miss.length ? '#fc6' : '#7d7';
      }).catch(function () { el.textContent = '확인 실패'; });
    }
    function helpShow(on) { if (on) offlineStatus(); panel.style.display = on ? 'flex' : 'none'; if (!on) { try { window.focus(); } catch (e) {} } }
    var helpBtn = document.createElement('button');
    helpBtn.textContent = '❓ 도움말';
    helpBtn.style.cssText = fsBtn.style.cssText;
    helpBtn.addEventListener('click', function () { helpShow(true); });
    bar.insertBefore(helpBtn, fsBtn);

    // ---- mouse-look toggle (bottom bar). The engine reads its settings at boot, so a change reloads the page.
    var ML = window._crMouseLook;
    var mlBtn = document.createElement('button');
    mlBtn.style.cssText = fsBtn.style.cssText;
    mlBtn.textContent = '🖱 마우스 시점: ' + (ML.on ? '켜짐' : '꺼짐');
    mlBtn.style.borderColor = ML.on ? '#fc6' : '#556';
    mlBtn.title = '마우스로 시점 이동 (게임 내장 기능). 바꾸면 페이지를 새로고침합니다.';
    mlBtn.addEventListener('click', function () {
      var next = !ML.on;
      if (!confirm('마우스 시점을 ' + (next ? '켜' : '끄') + '려면 페이지를 새로고침해야 합니다.\n저장하지 않은 게임 진행은 사라집니다. 계속할까요?')) { mlBtn.blur(); return; }
      ML.on = next; ML.save();
      var u = new URL(location.href); u.searchParams.delete('ml'); if (u.href !== location.href) location.replace(u.href); else location.reload();
    });
    bar.insertBefore(mlBtn, fsBtn);

    // ---- mouse settings popover
    var setBtn = document.createElement('button');
    setBtn.textContent = '⚙ 마우스 설정';
    setBtn.style.cssText = fsBtn.style.cssText;
    var pop = document.createElement('div');
    pop.style.cssText = 'position:fixed;bottom:44px;left:50%;transform:translateX(-50%);z-index:103;display:none;' +
      'width:320px;max-width:92vw;box-sizing:border-box;padding:12px 14px;border:1px solid #556;border-radius:10px;' +
      'background:rgba(20,20,30,.96);color:#dde;font:14px/1.5 sans-serif';
    pop.innerHTML = '<div style="font-weight:bold;margin-bottom:6px">마우스 설정</div>' +
      '<label style="display:block"><input id="cr-clicks" type="checkbox"> 클릭 매핑 사용 (왼쪽 클릭 = C, 오른쪽 클릭 = Z)</label>' +
      '<p style="margin:10px 0 0;color:#9ab;font-size:13px">시점 이동 속도(감도)와 좌우/상하 반전은 게임 안에서 바꿉니다:<br>' +
      '<b style="color:#dde">Tab</b> → Settings → Controls → Camera Controls<br>' +
      '(Third-Person Horizontal/Vertical Sensitivity, Invert Camera X/Y Axis)<br>' +
      '마우스가 안 잡히면 화면을 클릭하거나 <b style="color:#dde">F2</b>를 누르세요.</p>' +
      '<div style="margin-top:10px;text-align:right"><button id="cr-set-close" style="padding:4px 14px;border:1px solid #778;border-radius:6px;background:#2a2a3c;color:#eef;cursor:pointer">닫기</button></div>';
    document.body.appendChild(pop);
    var clkIn = pop.querySelector('#cr-clicks');
    clkIn.addEventListener('change', function () { ML.clicks = clkIn.checked; ML.save(); });
    function popShow(on) { pop.style.display = on ? 'block' : 'none'; if (on) clkIn.checked = ML.clicks; }
    pop.querySelector('#cr-set-close').addEventListener('click', function () { popShow(false); });
    setBtn.addEventListener('click', function () { popShow(pop.style.display === 'none'); setBtn.blur(); });
    bar.insertBefore(setBtn, fsBtn);
    panel.addEventListener('click', function (e) { if (e.target === panel || e.target.id === 'cr-help-close') helpShow(false); });
    window.addEventListener('keydown', function (e) {
      if (panel.style.display !== 'none') { e.stopPropagation(); if (e.code === 'Escape' || e.code === 'Tab') { e.preventDefault(); helpShow(false); } }
    }, true);
    window._crHelp = helpShow;

    // 처음 방문: 도움말 안내 말풍선 (7초 뒤 사라짐, 한 번만)
    var seen = false;
    try { seen = localStorage.getItem('cr-help-seen') === '1'; } catch (e) {}
    if (!seen) {
      var tip = document.createElement('div');
      tip.textContent = '처음이신가요? 아래쪽 ❓ 도움말에서 조작법을 확인하세요.';
      tip.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:102;max-width:300px;text-align:center;padding:8px 12px;border-radius:8px;' +
        'background:#fc6;color:#222;font:14px/1.4 sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.5)';
      document.body.appendChild(tip);
      setTimeout(function () { tip.remove(); }, 7000);
      try { localStorage.setItem('cr-help-seen', '1'); } catch (e) {}
    }

    // 하단 안내줄 (게임 시작 전 로딩 화면에서만 보임)
    var info = document.getElementById('cr-info');
    if (info && !info.dataset.cb) {
      info.dataset.cb = '1';
      info.insertAdjacentHTML('afterbegin',
        '로딩 중입니다. 처음에는 1~2분 걸릴 수 있어요. 조작법은 아래쪽 <b>도움말</b> 버튼 &middot; 메뉴는 <b>Tab</b>' +
        (lowSpec ? ' &middot; 저사양 모드 켜짐 (고화질: 주소 끝에 <code>?q=high</code>)' : '') + '<br>');
    }
  });
})();
