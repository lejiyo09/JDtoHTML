// Chromebook / ChromeOS friendliness for the SoH web page. Injected into <head> by make_site.py.
//  1. capability check (WebGL2, WebAssembly) with a readable message instead of a dead page
//  2. low-spec profile (4 GB or less RAM, ChromeOS): lower internal resolution, no MSAA.
//     Override with ?q=high or ?q=low. An explicit ?dev= list always wins.
//  3. Esc on ChromeOS leaves fullscreen: Tab also opens the SoH menu, and in fullscreen the
//     Keyboard Lock API hands Esc to the game (hold Esc to leave fullscreen)
//  4. fullscreen button (F11 / the Chromebook fullscreen key work too)
//  5. Korean help panel (controls, saving, performance, troubleshooting)
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

    // ---- 한국어 도움말 (오른쪽 위 "도움말" 버튼)
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
      '<tr><td><b>X</b></td><td>A 버튼 (확인, 말 걸기, 구르기)</td></tr>' +
      '<tr><td><b>C</b></td><td>B 버튼 (칼 휘두르기, 취소)</td></tr>' +
      '<tr><td><b>Z</b></td><td>Z 버튼 (적 조준 고정, 방패)</td></tr>' +
      '<tr><td><b>Space</b></td><td>Start (일시정지, 인벤토리)</td></tr>' +
      '<tr><td><b>방향키 ← ↑ → ↓</b></td><td>C 버튼 (아이템 사용)</td></tr>' +
      '<tr><td><b>T F G H</b></td><td>십자키 (위 / 왼쪽 / 아래 / 오른쪽)</td></tr>' +
      '<tr><td><b>Tab</b></td><td>게임 설정 메뉴 (크롬북은 Esc가 전체화면 해제에 쓰여서 Tab을 추가했습니다)</td></tr>' +
      '</table>' +
      '<p style="margin:6px 0 0">USB/블루투스 <b>게임패드</b>도 연결만 하면 자동으로 인식됩니다. 버튼을 한 번 눌러 보세요.</p>' +

      '<h3>3. 저장</h3>' +
      '<p>게임 안의 저장(올빼미 상, 메뉴의 저장)은 <b>이 브라우저 안</b>에 기록됩니다. ' +
      '<b>시크릿 모드</b>를 쓰거나 "사이트 데이터/쿠키 삭제"를 하면 저장이 사라지고, 다른 기기와 공유되지 않습니다. ' +
      '같은 크롬북, 같은 주소에서 같은 프로필로 열어야 이어서 할 수 있습니다.</p>' +

      '<h3>4. 화면이 느리거나 끊길 때</h3>' +
      '<ul><li>램 4GB 이하 기기는 <b>저사양 모드</b>(해상도 낮춤, 계단 보정 끔)가 자동으로 켜집니다. 수동으로 바꾸려면 주소 끝에 ' +
      '<code>?q=low</code>(저사양) 또는 <code>?q=high</code>(고화질)를 붙이세요.</li>' +
      '<li>다른 탭과 앱을 닫고, 충전기를 연결하세요. 배터리 절약 모드가 켜져 있으면 느려집니다.</li>' +
      '<li>오른쪽 위 <b>전체화면</b> 버튼을 쓰면 조금 더 부드럽습니다. 전체화면에서 나올 때는 <b>Esc를 길게</b> 누르세요.</li></ul>' +

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
    helpBtn.style.cssText = fsBtn.style.cssText.replace('right:8px', 'right:104px');
    helpBtn.addEventListener('click', function () { helpShow(true); });
    document.body.appendChild(helpBtn);
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
      tip.textContent = '처음이신가요? 오른쪽 위 ❓ 도움말에서 조작법을 확인하세요.';
      tip.style.cssText = 'position:fixed;top:48px;right:8px;z-index:102;max-width:260px;padding:8px 12px;border-radius:8px;' +
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
        '로딩 중입니다. 처음에는 1~2분 걸릴 수 있어요. 조작법은 오른쪽 위 <b>도움말</b> 버튼 &middot; 메뉴는 <b>Tab</b>' +
        (lowSpec ? ' &middot; 저사양 모드 켜짐 (고화질: 주소 끝에 <code>?q=high</code>)' : '') + '<br>');
    }
  });
})();
