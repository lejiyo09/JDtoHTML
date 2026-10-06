// Chromebook / ChromeOS friendliness for the SoH web page. Injected into <head> by make_site.py.
//  1. capability check (WebGL2, WebAssembly) with a readable message instead of a dead page
//  2. low-spec profile (4 GB or less RAM, ChromeOS): lower internal resolution, no MSAA.
//     Override with ?q=high or ?q=low. An explicit ?dev= list always wins.
//  3. Esc on ChromeOS leaves fullscreen: Tab also opens the SoH menu, and in fullscreen the
//     Keyboard Lock API hands Esc to the game (hold Esc to leave fullscreen)
//  4. fullscreen button (F11 / the Chromebook fullscreen key work too)
//  5. mouse look (experimental): mouse -> virtual gamepad right stick
//  6. Korean help panel (controls, saving, performance, troubleshooting)
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


  // ---- Mouse look (experimental, off by default): the mouse drives a virtual gamepad's right stick.
  // Needs a camera that listens to the right stick (turn on Free Look in the game menu).
  var ML = { on: false, pad: null, dx: 0, dy: 0, rx: 0, ry: 0, sens: 6, invY: false, cap: 30, clicks: true, onChange: null };
  try {
    var _sv = JSON.parse(localStorage.getItem('cr-mouselook') || '{}');
    if (_sv.sens >= 1 && _sv.sens <= 20) ML.sens = _sv.sens;
    ML.invY = !!_sv.invY;
    if (_sv.cap >= 10 && _sv.cap <= 100) ML.cap = _sv.cap;
    if (_sv.clicks === false) ML.clicks = false;
  } catch (e) {}
  ML.save = function () { try { localStorage.setItem('cr-mouselook', JSON.stringify({ sens: ML.sens, invY: ML.invY, cap: ML.cap, clicks: ML.clicks })); } catch (e) {} };
  window._crMouseLook = ML;
  (function () {
    var orig = navigator.getGamepads ? navigator.getGamepads.bind(navigator) : function () { return []; };
    function mkButtons() {
      var b = [];
      for (var i = 0; i < 17; i++) b.push({ pressed: false, touched: false, value: 0 });
      return b;
    }
    function makePad(index) {
      return { id: 'Mouse Look (STANDARD GAMEPAD Vendor: 0000 Product: 0000)', index: index, connected: true,
               mapping: 'standard', axes: [0, 0, 0, 0], buttons: mkButtons(), timestamp: 0,
               hapticActuators: [], vibrationActuator: null };
    }
    navigator.getGamepads = function () {
      var real = Array.prototype.slice.call(orig() || []);
      if (!ML.on) return real;
      var slot = -1;
      for (var i = 0; i < real.length; i++) if (!real[i]) { slot = i; break; }
      if (slot < 0) slot = real.length;
      if (!ML.pad || ML.pad.index !== slot) ML.pad = makePad(slot);
      real[slot] = ML.pad;
      return real;
    };
    function padEvent(type, pad) {      // GamepadEvent rejects a synthetic pad; a plain Event carrying .gamepad is what handlers read
      var ev;
      try { ev = new GamepadEvent(type, { gamepad: pad }); } catch (e) { ev = new Event(type); ev.gamepad = pad; }
      window.dispatchEvent(ev);
    }
    function clamp(v) { return Math.max(-1, Math.min(1, v)); }
    function tick() {
      if (ML.on && ML.pad) {
        // the stick follows how far the mouse moved this frame, then eases back to centre
        ML.rx = clamp(ML.rx * 0.4 + ML.dx * (ML.sens / 100) * 0.6);
        ML.ry = clamp(ML.ry * 0.4 + ML.dy * (ML.sens / 100) * 0.6 * (ML.invY ? -1 : 1));
        ML.dx = 0; ML.dy = 0;
        // axis lock: a mostly-horizontal (or vertical) move should not leak into the other axis
        // (a stray upward component reads as C-up: first-person view / Navi)
        var ax = Math.abs(ML.rx), ay = Math.abs(ML.ry);
        if (ax > 3 * ay) ML.ry = 0; else if (ax > 2 * ay) ML.ry *= 0.3;
        else if (ay > 3 * ax) ML.rx = 0; else if (ay > 2 * ax) ML.rx *= 0.3;
        var k = ML.cap / 100;      // keeps the virtual stick below the level the game reads as a C button
        ML.pad.axes = [0, 0, Math.abs(ML.rx) < 0.02 ? 0 : ML.rx * k, Math.abs(ML.ry) < 0.02 ? 0 : ML.ry * k];
        ML.pad.timestamp = performance.now();
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
    document.addEventListener('mousemove', function (e) {
      if (!ML.on || document.pointerLockElement == null) return;
      ML.dx += e.movementX || 0; ML.dy += e.movementY || 0;
    }, true);
    ML.set = function (on) {
      if (on === ML.on) return;
      ML.on = on;
      if (on) {
        ML.pad = null; navigator.getGamepads();
        var pad = ML.pad;
        try { if (pad) padEvent('gamepadconnected', pad); } catch (e) {}
      } else {
        var old = ML.pad; ML.pad = null; ML.rx = ML.ry = ML.dx = ML.dy = 0;
        try { if (old) { old.connected = false; padEvent('gamepaddisconnected', old); } } catch (e) {}
        if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
      }
      if (ML.onChange) ML.onChange();
    };
    // while mouse look is on and the mouse is captured: left click = C key (B button), right click = Z key
    var MB = { 0: { key: 'c', code: 'KeyC', keyCode: 67 }, 2: { key: 'z', code: 'KeyZ', keyCode: 90 } }, mbHeld = {};
    function mbKey(type, a) {
      var ev = new KeyboardEvent(type, { key: a.key, code: a.code, keyCode: a.keyCode, which: a.keyCode, bubbles: true, cancelable: true });
      (document.activeElement || document.body).dispatchEvent(ev);
    }
    document.addEventListener('mousedown', function (e) {
      var a = MB[e.button];
      if (!ML.on || !ML.clicks || !a || !document.pointerLockElement) return;
      e.preventDefault(); e.stopPropagation();
      if (mbHeld[e.button]) return;
      mbHeld[e.button] = true; mbKey('keydown', a);
    }, true);
    document.addEventListener('mouseup', function (e) {
      var a = MB[e.button];
      if (!a || !mbHeld[e.button]) return;
      e.preventDefault(); e.stopPropagation();
      mbHeld[e.button] = false; mbKey('keyup', a);
    }, true);
    document.addEventListener('contextmenu', function (e) { if (ML.on) e.preventDefault(); }, true);
    // the click that captures the mouse is not a game input
    // while on, a click on the game captures the mouse (Esc releases it)
    document.addEventListener('mousedown', function (e) {
      if (!ML.on || document.pointerLockElement) return;
      var t = e.target;
      if (!t || t.tagName !== 'CANVAS') return;
      try { var r = t.requestPointerLock && t.requestPointerLock(); if (r && r.catch) r.catch(function () {}); } catch (x) {}
    }, true);
    // While the mouse is captured, hide raw mouse/pointer events from the rest of the page. The game's touch
    // buttons and menus read them, and a captured pointer sits still over the screen, so moving it could
    // press on-screen buttons. (Registered after the handlers above, which still run.)
    ['mousemove', 'pointermove', 'pointerdown', 'pointerup', 'mousedown', 'mouseup', 'click', 'dblclick', 'auxclick', 'wheel'].forEach(function (t) {
      document.addEventListener(t, function (e) {
        if (ML.on && document.pointerLockElement) e.stopImmediatePropagation();
      }, true);
    });

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

      '<h3>마우스 시점 (실험 기능)</h3>' +
      '<p>아래쪽 <b>마우스 시점</b> 버튼을 켜고 게임 화면을 클릭하면 마우스가 고정되고, 마우스를 움직이는 대로 오른쪽 스틱(카메라) 입력이 들어갑니다. ' +
      '마우스가 고정된 동안 <b>왼쪽 클릭 = C 키</b>(B 버튼), <b>오른쪽 클릭 = Z 키</b>로 동작합니다. ' +
      '클릭 매핑은 마우스 설정에서 끌 수 있습니다. 마우스가 고정된 동안에는 마우스 움직임이 화면의 터치 버튼이나 메뉴로 전달되지 않습니다. ' +
      '시점을 돌릴 때 Navi가 반응하는 등 C 버튼이 눌리면 마우스 설정의 <b>출력 상한</b>을 낮추세요. ' +
      '<b>Esc</b>로 마우스를 풀 수 있습니다. <b>마우스 설정</b> 버튼에서 감도(1~20)와 상하 반전을 바꿀 수 있고 이 브라우저에 저장됩니다. 게임 설정 메뉴(<b>Tab</b>)에서 <b>자유 시점(Free Look)</b>을 켜야 카메라가 움직입니다. ' +
      '게임패드를 쓰는 경우 이 기능은 꺼 두세요.</p>' +

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

    function helpShow(on) { panel.style.display = on ? 'flex' : 'none'; if (!on) { try { window.focus(); } catch (e) {} } }
    var helpBtn = document.createElement('button');
    helpBtn.textContent = '❓ 도움말';
    helpBtn.style.cssText = fsBtn.style.cssText;
    helpBtn.addEventListener('click', function () { helpShow(true); });
    bar.insertBefore(helpBtn, fsBtn);

    // ---- mouse-look toggle (bottom bar)
    var mlBtn = document.createElement('button');
    mlBtn.style.cssText = fsBtn.style.cssText;
    function mlLabel() { mlBtn.textContent = '🖱 마우스 시점: ' + (window._crMouseLook.on ? '켜짐' : '꺼짐'); mlBtn.style.borderColor = window._crMouseLook.on ? '#fc6' : '#556'; }
    mlBtn.title = '마우스로 카메라(오른쪽 스틱) 조작. 켠 뒤 게임 화면을 클릭하면 마우스가 고정됩니다 (Esc로 해제).';
    window._crMouseLook.onChange = mlLabel;
    mlBtn.addEventListener('click', function () { window._crMouseLook.set(!window._crMouseLook.on); mlBtn.blur(); });
    mlLabel();
    bar.insertBefore(mlBtn, fsBtn);
    var ML = window._crMouseLook;

    // ---- mouse settings popover (sensitivity, invert Y)
    var setBtn = document.createElement('button');
    setBtn.textContent = '⚙ 마우스 설정';
    setBtn.style.cssText = fsBtn.style.cssText;
    var pop = document.createElement('div');
    pop.style.cssText = 'position:fixed;bottom:44px;left:50%;transform:translateX(-50%);z-index:103;display:none;' +
      'width:280px;max-width:92vw;box-sizing:border-box;padding:12px 14px;border:1px solid #556;border-radius:10px;' +
      'background:rgba(20,20,30,.96);color:#dde;font:14px/1.5 sans-serif';
    pop.innerHTML = '<div style="font-weight:bold;margin-bottom:6px">마우스 시점 설정</div>' +
      '<label style="display:block">감도: <b id="cr-sens-v"></b> <span style="color:#9ab">(1 느림 ~ 20 빠름)</span>' +
      '<input id="cr-sens" type="range" min="1" max="20" step="1" style="width:100%"></label>' +
      '<label style="display:block;margin-top:8px">출력 상한: <b id="cr-cap-v"></b>% <span style="color:#9ab">(낮출수록 C 버튼 오작동이 줄고 카메라는 느려짐)</span>' +
      '<input id="cr-cap" type="range" min="10" max="100" step="5" style="width:100%"></label>' +
      '<label style="display:block;margin-top:8px"><input id="cr-invy" type="checkbox"> 상하 반전 (마우스를 위로 올리면 아래를 봄)</label>' +
      '<label style="display:block;margin-top:8px"><input id="cr-clicks" type="checkbox"> 클릭 매핑 사용 (왼쪽 = C, 오른쪽 = Z)</label>' +
      '<div style="margin-top:10px;text-align:right"><button id="cr-set-reset" style="padding:4px 10px;margin-right:6px;border:1px solid #778;border-radius:6px;background:#2a2a3c;color:#eef;cursor:pointer">초기화</button>' +
      '<button id="cr-set-close" style="padding:4px 14px;border:1px solid #778;border-radius:6px;background:#2a2a3c;color:#eef;cursor:pointer">닫기</button></div>';
    document.body.appendChild(pop);
    var sensIn = pop.querySelector('#cr-sens'), sensV = pop.querySelector('#cr-sens-v'), invIn = pop.querySelector('#cr-invy');
    var capIn = pop.querySelector('#cr-cap'), capV = pop.querySelector('#cr-cap-v');
    var clkIn = pop.querySelector('#cr-clicks');
    clkIn.addEventListener('change', function () { ML.clicks = clkIn.checked; ML.save(); });
    function popSync() { sensIn.value = ML.sens; sensV.textContent = ML.sens; invIn.checked = ML.invY; capIn.value = ML.cap; capV.textContent = ML.cap; clkIn.checked = ML.clicks; }
    capIn.addEventListener('input', function () { ML.cap = +capIn.value; capV.textContent = ML.cap; ML.save(); });
    sensIn.addEventListener('input', function () { ML.sens = +sensIn.value; sensV.textContent = ML.sens; ML.save(); });
    invIn.addEventListener('change', function () { ML.invY = invIn.checked; ML.save(); });
    pop.querySelector('#cr-set-reset').addEventListener('click', function () { ML.sens = 6; ML.invY = false; ML.cap = 30; ML.clicks = true; ML.save(); popSync(); });
    function popShow(on) { pop.style.display = on ? 'block' : 'none'; if (on) popSync(); }
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
