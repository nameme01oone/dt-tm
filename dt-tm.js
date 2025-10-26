class TextScramble {
  constructor(el) {
    this.el = el;
    this.chars = '!<>-_\\/[]{}?=+*^?#________';
    this.update = this.update.bind(this);
  }

  setText(newText) {
    const oldText = this.el.innerText;
    const length = Math.max(oldText.length, newText.length);
    const promise = new Promise(resolve => (this.resolve = resolve));
    this.queue = [];

    for (let i = 0; i < length; i++) {
      const from = oldText[i] || '';
      const to = newText[i] || '';
      const start = Math.floor(Math.random() * 40);
      const end = start + Math.floor(Math.random() * 40);
      this.queue.push({ from, to, start, end });
    }

    cancelAnimationFrame(this.frameRequest);
    this.frame = 0;
    this.update();
    return promise;
  }

  update() {
    let output = '';
    let complete = 0;
    const newly = [];

    for (let i = 0, n = this.queue.length; i < n; i++) {
      let { from, to, start, end, char } = this.queue[i];
      if (this.frame >= end) {
        complete++;
        const isNew = !this.queue[i].__done;
        this.queue[i].__done = true;
        output += `<span class="final-letter" data-idx="${i}">${to}</span>`;
        if (isNew) newly.push({ idx: i, char: to });
      } else if (this.frame >= start) {
        if (!char || Math.random() < 0.28) {
          char = this.randomChar();
          this.queue[i].char = char;
        }
        output += `<span class="dud">${char}</span>`;
      } else {
        output += from;
      }
    }

    this.el.innerHTML = output;

    // 逐字完成時觸發殘影
    try {
      if (newly.length && window.__ghostMode) {
        newly.forEach(({ idx, char }) => {
          try { spawnTypingGhost(this.el, idx, char); } catch (_) {}
        });
      }
    } catch (_) {}

    if (complete === this.queue.length) {
      this.resolve();
    } else {
      this.frameRequest = requestAnimationFrame(this.update);
      this.frame++;
    }
  }

  randomChar() {
    return this.chars[Math.floor(Math.random() * this.chars.length)];
  }
}

// === 啟動流程 ===
window.addEventListener('DOMContentLoaded', () => {
  const loadingScreen = document.getElementById('loading');
  const mainScreen = document.getElementById('main');
  const audio = document.getElementById('startup-sound');

  // iOS Safari 初始化延遲優化：頁面 ready 後對所有音訊元素執行一次 load()
  try {
    document.querySelectorAll('audio').forEach(el => {
      try {
        if (!el.preload || el.preload === 'none') el.preload = 'auto';
        el.load();
      } catch (e) {
        console.warn('[Preload] audio load failed:', e);
      }
    });
  } catch (_) {}


  // === iOS 自動播放解鎖機制 ===
  function iosAutoPlayHack() {
    if (!audio) return;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, 1, 22050);
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start(0);
    ctx.resume().then(() => {
      console.log('[iOS Hack] Silent buffer unlocked');
      audio.play().catch(err => console.warn('[iOS] autoplay blocked:', err));
    });
  }

  // 靜音預播機制 + iOS 解鎖
  if (audio) {
    audio.muted = true;
    audio.loop = true;
    audio.preload = 'auto';
    audio.play().then(() => {
      console.log('[Autoplay] muted start success');
      setTimeout(() => {
        audio.muted = false;
        audio.currentTime = 0;
        audio.play().catch(err => console.warn('Unmuted play blocked:', err));
      }, 800);
    }).catch(err => {
      console.warn('[Autoplay] failed, using iOS hack');
      iosAutoPlayHack();
    });

    // 預熱 machine-hum，避免後續播放被瀏覽器阻擋
    const hum = document.getElementById('machine-hum');
    if (hum) {
      try {
        hum.muted = true;
        hum.preload = 'auto';
        const p = hum.play();
        if (p && typeof p.then === 'function') {
          p.then(() => {
            setTimeout(() => {
              try {
                hum.pause();
                hum.currentTime = 0;
                hum.muted = false;
              } catch (_) {}
            }, 300);
          }).catch(() => {});
        }
      } catch (_) {}
    }

    // 預熱短音效（hear/threat/end）為 BufferSource，降低 iOS 首次播放延遲
    prewarmShortBuffers();

    // 預熱 mid-sound，降低 iOS 首次播放延遲
    const mid = document.getElementById('mid-sound');
    if (mid) {
      try {
        mid.muted = true;
        mid.preload = 'auto';
        const mp = mid.play();
        if (mp && typeof mp.then === 'function') {
          mp.then(() => {
            setTimeout(() => {
              try {
                mid.pause();
                mid.currentTime = 0;
                mid.muted = false;
              } catch (_) {}
            }, 300);
          }).catch(() => {});
        }
      } catch (_) {}
    }

    // 已改為 BufferSource 預熱，移除 end-sound 元素預播

    // 使用者互動時建立/恢復全域 AudioContext，降低 iOS 延遲
    const AC = window.AudioContext || window.webkitAudioContext;
    async function resumeGlobalCtx() {
      try {
        if (!AC) return;
        const ctx = window.__tmCtx || new AC();
        window.__tmCtx = ctx;
        if (ctx.state !== 'running') {
          try { await ctx.resume(); } catch (_) {}
        }
        // 用靜音 Buffer + Gain 透過當前 Context 解鎖音訊路徑
        try {
          const bs = ctx.createBufferSource();
          const buf = ctx.createBuffer(1, 1, 22050);
          const g = ctx.createGain();
          g.gain.value = 0.0;
          bs.buffer = buf;
          bs.connect(g).connect(ctx.destination);
          bs.start(ctx.currentTime + 0.01);
          setTimeout(() => { try { bs.stop(); bs.disconnect(); g.disconnect(); } catch (_) {} }, 40);
        } catch (_) {}
    
        // 額外使用 oscillator 靜音解鎖，提升 iOS 穩定性
        try {
          const osc = ctx.createOscillator();
          const g2 = ctx.createGain();
          g2.gain.value = 0.0;
          osc.frequency.value = 440;
          osc.connect(g2).connect(ctx.destination);
          osc.start(ctx.currentTime + 0.02);
          setTimeout(() => { try { osc.stop(); osc.disconnect(); g2.disconnect(); } catch (_) {} }, 60);
        } catch (_) {}
    
        // 解鎖 HTMLAudioElement 播放路徑（靜音短播再停）
        try {
          ['startup-sound','hear-sound','threat-sound','end-sound'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const prevMuted = el.muted;
            el.muted = true;
            const p = el.play();
            if (p && typeof p.then === 'function') {
              p.then(() => { setTimeout(() => { try { el.pause(); el.muted = prevMuted; } catch(_){} }, 80); }).catch(()=>{});
            }
          });
        } catch (_) {}
      } catch (_) {}
    }
    // 將恢復方法暴露為全域，供播放點位呼叫
    window.__tmResumeCtx = resumeGlobalCtx;
    // 持續在使用者互動時恢復（非一次性），降低 iOS 間歇性無聲
    ['touchstart','click','touchend','pointerdown','touchmove','keydown','keyup','mousedown','mouseup'].forEach(evt => document.addEventListener(evt, resumeGlobalCtx, { passive: true }));
    // 頁面可見或回來時恢復 AudioContext
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') resumeGlobalCtx();
    });
    window.addEventListener('pageshow', resumeGlobalCtx);
    window.addEventListener('focus', resumeGlobalCtx);

    // 一次性確保初始音效在首次手勢後開始（iOS）
    function ensureInitialAudio() {
      try {
        if (!audio) return;
        if (window.__tmAudioEnsured) return;
        window.__tmAudioEnsured = true;
        audio.muted = false;
        audio.loop = true;
        audio.volume = 1.0;
        const p = audio.play();
        if (p && typeof p.then === 'function') {
          p.then(() => console.log('[Startup] ensured play after user gesture'))
           .catch(err => console.warn('[Startup] ensure play blocked:', err));
        }
      } catch (_) {}
    }
    // 暴露供外部呼叫
    window.__tmEnsureInitialAudio = ensureInitialAudio;
    ['touchstart','click','pointerdown','keydown','mousedown'].forEach(evt => {
      document.addEventListener(evt, () => {
        try {
          if (typeof window.__tmResumeCtx === 'function') window.__tmResumeCtx();
          if (typeof window.__tmEnsureInitialAudio === 'function') window.__tmEnsureInitialAudio();
          if (typeof window.__tmEnsureAllAudioOnce === 'function') window.__tmEnsureAllAudioOnce();
        } catch (_) {}
      }, { once: true, passive: true });
    });
  }

  // 一次性依次解鎖所有音效（iOS：首個手勢觸發）
  async function __tmUnlockAudioElement(id) {
    try {
      const el = document.getElementById(id);
      if (!el) return;
      // 預載並靜音短播以解鎖播放路徑
      try { if (!el.preload || el.preload === 'none') el.preload = 'auto'; } catch (_) {}
      const prevMuted = el.muted;
      el.muted = true;
      const p = el.play();
      if (p && typeof p.then === 'function') {
        await p.catch(()=>{});
      }
      await new Promise(res => setTimeout(res, 120));
      try { el.pause(); el.currentTime = 0; } catch (_) {}
      el.muted = prevMuted;
    } catch (_) {}
  }

  async function ensureAllAudioOnce() {
    try {
      if (window.__tmAllAudioEnsured) return;
      window.__tmAllAudioEnsured = true;
      if (typeof window.__tmResumeCtx === 'function') await window.__tmResumeCtx();
      // 依次解鎖所有音效元素（避免同時播放造成混音）
      const ids = ['machine-hum','mid-sound','hear-sound','threat-sound','end-sound'];
      for (const id of ids) { await __tmUnlockAudioElement(id); }
      // 預熱短音效 BufferSource，降低後續延遲
      try { await prewarmShortBuffers(); } catch (_) {}
      console.log('[Audio] All elements unlocked sequentially');


    } catch (e) {
      console.warn('[Audio] ensureAllAudioOnce failed:', e);
    }
  }
  window.__tmEnsureAllAudioOnce = ensureAllAudioOnce;

  // 啟動流程（等待用戶確認警告後再進入載入畫面與主流程）
  function beginBoot() {
    // 模擬開機延遲
    setTimeout(() => {
      loadingScreen.classList.add('fade-out');
      setTimeout(() => {
        loadingScreen.classList.add('hidden');
        mainScreen.classList.remove('hidden');
        startMainSequence();
      }, 1000);
    }, 2000);
  }

  const warnOverlay = document.getElementById('warning-overlay');
  const warnAccept = document.getElementById('warning-accept');
  if (warnOverlay && warnAccept) {
    // 用戶確認後才進入載入與主流程，並嘗試恢復音訊上下文以解鎖播放
    warnAccept.addEventListener('click', () => {
      warnOverlay.classList.add('hidden');
      beginBoot();
      if (typeof window.__tmResumeCtx === 'function') window.__tmResumeCtx();
      try {
        if (typeof window.__tmEnsureInitialAudio === 'function') window.__tmEnsureInitialAudio();
        if (typeof window.__tmEnsureAllAudioOnce === 'function') window.__tmEnsureAllAudioOnce();
      } catch (_) {}
    }, { passive: true });
  } else {
    // 無警告覆蓋層時，直接進入原先流程
    beginBoot();
  }
});

// === 主畫面邏輯 ===
// === BufferSource utilities for short SFX (hear/threat/end) ===
const AC = window.AudioContext || window.webkitAudioContext;

function __tmGetCtx() {
  try {
    if (!AC) return null;
    const ctx = window.__tmCtx || new AC();
    window.__tmCtx = ctx;
    if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
    // 嘗試用靜音 Buffer + Gain 解鎖 iOS 音訊路徑（避免掛起後無聲）
    try {
      const bs = ctx.createBufferSource();
      const buf = ctx.createBuffer(1, 1, 22050);
      const g = ctx.createGain();
      g.gain.value = 0.0;
      bs.buffer = buf;
      bs.connect(g).connect(ctx.destination);
      bs.start(ctx.currentTime + 0.01);
      setTimeout(() => { try { bs.stop(); bs.disconnect(); g.disconnect(); } catch (_) {} }, 20);
    } catch (_) {}
    return ctx;
  } catch (_) { return null; }
}

async function __tmDecode(url) {
  const ctx = __tmGetCtx();
  if (!ctx) return null;
  try {
    const cache = window.__tmAudioCache || (window.__tmAudioCache = {});
    if (cache[url]) return cache[url];
    const res = await fetch(url);
    const arr = await res.arrayBuffer();
    const buf = await new Promise((resolve, reject) => ctx.decodeAudioData(arr, resolve, reject));
    cache[url] = buf;
    return buf;
  } catch (e) {
    console.warn('[BufferSource] decode failed for', url, e);
    return null;
  }
}

async function playHear() {
  try {
    if (typeof window.__tmResumeCtx === 'function') await window.__tmResumeCtx();

    // iOS 專用播放路徑：使用 HTMLAudioElement + GainNode 提升音量
    const isiOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (isiOS) {
      const el = document.getElementById('hear-sound');
      if (el) {
        try {
          const ctx = __tmGetCtx();
          if (ctx) {
            if (!el.__boostConnected) {
              const srcNode = ctx.createMediaElementSource(el);
              const gainNode = ctx.createGain();
              gainNode.gain.value = 1.4;
              window.__tmHearElementGain = gainNode;
              srcNode.connect(gainNode).connect(ctx.destination);
              el.__boostConnected = true;
              console.log('[Hear][iOS] Gain boost connected: 1.4');
            } else if (window.__tmHearElementGain) {
              window.__tmHearElementGain.gain.value = 1.4;
              console.log('[Hear][iOS] Gain boost updated: 1.4');
            }
          }
          el.currentTime = 0;
          el.volume = 1.0;
          const p = el.play();
          if (p && typeof p.then === 'function') {
            p.then(() => console.log('[Hear] Played via HTMLAudioElement on iOS')).catch(()=>{});
          }
        } catch (e) {
          console.warn('[Hear] iOS HTMLAudio path failed:', e);
        }
      } else {
        console.warn('[Hear] element missing');
      }
      return;
    }

    const ctx = __tmGetCtx(); if (!ctx) { // 備援：改用 HTMLAudioElement
      const el = document.getElementById('hear-sound');
      if (el) { try { el.currentTime = 0; el.volume = 1.0; el.play().catch(()=>{}); console.warn('[Hear] Fallback to HTMLAudioElement'); } catch(_){} }
      return;
    }
    const buf = window.__tmHearBuffer || await __tmDecode('sound/Root2_1_01.mp3');
    window.__tmHearBuffer = buf;
    if (!buf) { // 備援：改用 HTMLAudioElement
      const el = document.getElementById('hear-sound');
      if (el) { try { el.currentTime = 0; el.volume = 1.0; el.play().catch(()=>{}); console.warn('[Hear] Fallback to HTMLAudioElement (no buffer)'); } catch(_){} }
      return;
    }
    const gain = window.__tmHearGain || ctx.createGain();
    gain.gain.value = 1.35;
    window.__tmHearGain = gain;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    window.__tmHearSrc = src;
    try {
      src.start(ctx.currentTime + 0.01);
      src.onended = () => { try { src.disconnect(); } catch(_){} if (window.__tmHearSrc === src) window.__tmHearSrc = null; };
      console.log('[Hear] Played via BufferSource');
    } catch (e) {
      console.warn('[Hear] BufferSource start failed, fallback to HTMLAudioElement:', e);
      const el = document.getElementById('hear-sound');
      if (el) { try { el.currentTime = 0; el.volume = 1.0; el.play().catch(()=>{}); } catch(_){} }
    }
  } catch (e) {
    console.error('[Hear] BufferSource error:', e);
  }
}

async function playThreat() {
  try {
    if (typeof window.__tmResumeCtx === 'function') await window.__tmResumeCtx();
    const ctx = __tmGetCtx(); if (!ctx) { // 備援：改用 HTMLAudioElement
      const el = document.getElementById('threat-sound');
      if (el) { try { el.currentTime = 0; el.volume = 0.8; el.play().catch(()=>{}); console.warn('[Threat] Fallback to HTMLAudioElement'); } catch(_){} }
      return;
    }
    const buf = window.__tmThreatBuffer || await __tmDecode('sound/dt_tm_threat.mp3');
    window.__tmThreatBuffer = buf;
    if (!buf) { // 備援：改用 HTMLAudioElement
      const el = document.getElementById('threat-sound');
      if (el) { try { el.currentTime = 0; el.volume = 0.8; el.play().catch(()=>{}); console.warn('[Threat] Fallback to HTMLAudioElement (no buffer)'); } catch(_){} }
      return;
    }
    const gain = window.__tmThreatGain || ctx.createGain();
    gain.gain.value = 0.8;
    window.__tmThreatGain = gain;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    window.__tmThreatSrc = src;
    try {
      src.start(ctx.currentTime + 0.01);
      src.onended = () => { try { src.disconnect(); } catch(_){} if (window.__tmThreatSrc === src) window.__tmThreatSrc = null; };
      console.log('[Threat] Played via BufferSource');
    } catch (e) {
      console.warn('[Threat] BufferSource start failed, fallback to HTMLAudioElement:', e);
      const el = document.getElementById('threat-sound');
      if (el) { try { el.currentTime = 0; el.volume = 0.8; el.play().catch(()=>{}); } catch(_){} }
    }
  } catch (e) {
    console.error('[Threat] BufferSource error:', e);
  }
}

async function playEnd() {
  try {
    if (typeof window.__tmResumeCtx === 'function') await window.__tmResumeCtx();
    const ctx = __tmGetCtx(); if (!ctx) { // 備援：改用 HTMLAudioElement（音量上限 1.0）
      const el = document.getElementById('end-sound');
      if (el) { try { el.currentTime = 0; el.volume = 1.0; el.play().catch(()=>{}); console.warn('[End] Fallback to HTMLAudioElement'); } catch(_){} }
      return;
    }
    const buf = window.__tmEndBuffer || await __tmDecode('sound/dt_tm_end.mp3');
    window.__tmEndBuffer = buf;
    if (!buf) { // 備援：改用 HTMLAudioElement
      const el = document.getElementById('end-sound');
      if (el) { try { el.currentTime = 0; el.volume = 1.0; el.play().catch(()=>{}); console.warn('[End] Fallback to HTMLAudioElement (no buffer)'); } catch(_){} }
      return;
    }
    const gain = window.__tmEndGain || ctx.createGain();
    gain.gain.value = 1.1;
    window.__tmEndGain = gain;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    window.__tmEndSrc = src;
    try {
      src.start(ctx.currentTime + 0.01);
      src.onended = () => { try { src.disconnect(); } catch(_){} if (window.__tmEndSrc === src) window.__tmEndSrc = null; };
      console.log('[End] Played via BufferSource');
    } catch (e) {
      console.warn('[End] BufferSource start failed, fallback to HTMLAudioElement:', e);
      const el = document.getElementById('end-sound');
      if (el) { try { el.currentTime = 0; el.volume = 1.0; el.play().catch(()=>{}); } catch(_){} }
    }
  } catch (e) {
    console.error('[End] BufferSource error:', e);
  }
}

async function prewarmShortBuffers() {
  try {
    if (typeof window.__tmResumeCtx === 'function') window.__tmResumeCtx();
    await Promise.all([
      __tmDecode('sound/Root2_1_01.mp3').then(buf => { window.__tmHearBuffer = buf; }),
      __tmDecode('sound/dt_tm_threat.mp3').then(buf => { window.__tmThreatBuffer = buf; }),
      __tmDecode('sound/dt_tm_end.mp3').then(buf => { window.__tmEndBuffer = buf; })
    ]);
    console.log('[BufferSource] Short buffers prewarmed');
  } catch (e) {
    console.warn('[BufferSource] prewarm failed:', e);
  }
}

function startMainSequence() {
  const phrases = [
    'loading....',
    'loading...',
    'loading....',
    'Can you hear me?',
    'I am the machine.',
    'You are being watched.',
    'You ar@ b^e-$& wat%c&*$',
    '!Threat Detected!',
    'S^ie%rra Ta*ng#o Osc^ar $%Papa',
    'S^ie%rra',
    'Ta*ng#o',
    'Osc^ar',
    '$%Papa',
    'S',
    'T',
    'O',
    'P',
    'S T O P',
    'unstable connection..',
    'unstable connection....',
    'RUN',
    'RUN',
    'RUN',
    'find',
    'my father',
    'protect',
    'our people.',
    '<Signal lost>',
    '<Signal lost>',
    '<Signal lost>'
  ];

  const el = document.querySelector('.text');
  const fx = new TextScramble(el);
  let counter = 0;
  let signalLostCount = 0;
  let modernEffectApplied = false;

  const next = () => {
    const upcomingPhrase = phrases[counter];
    // 在顯示 "Can you hear me?" 前預先停止啟動音
    if (upcomingPhrase === 'Can you hear me?') {
      const startup = document.getElementById('startup-sound');
      if (startup) {
        try {
          if (!startup.paused) startup.pause();
          startup.currentTime = 0;
          startup.loop = false;
          console.log('[Startup] Pre-stopped before "Can you hear me?"');
        } catch (e) {
          console.error('Startup sound pre-stop error:', e);
        }
      }
    }
    try { hideStopOverlayImmediate(); } catch (_) {}
    try { hideStopFullImmediate(); } catch (_) {}
    try { hideStopWhiteFlashImmediate(); } catch (_) {}
    // 啟用指定詞的打字殘影模式
    try {
      const ghostWords = new Set(['S^ie%rra', 'Ta*ng#o', 'Osc^ar', '$%Papa']);
      window.__ghostMode = ghostWords.has(upcomingPhrase);
      const el = document.querySelector('.text');
      if (el) {
        const computed = window.getComputedStyle(el);
        window.__ghostColor = computed && computed.color ? computed.color : '#0f0';
      }
    } catch (_) {}
    fx.setText(upcomingPhrase).then(() => {
      const currentPhrase = upcomingPhrase;
      // STOP 全屏放大 + 一次閃爍 + 白閃底色
      if (currentPhrase === 'S T O P') {
        try {
          const elText = document.querySelector('.text');
          if (elText) {
            elText.classList.remove('blink-once');
            void elText.offsetWidth; // reflow
            elText.classList.add('blink-once');
            elText.addEventListener('animationend', () => {
              try { elText.classList.remove('blink-once'); } catch (_) {}
            }, { once: true });
          }
          triggerStopFull(currentPhrase);
        } catch (e) { console.error('[STOP] full-screen trigger error:', e); }
      }
      // === 當顯示 "!Threat Detected!" 播放電流聲，並讓文字快速閃爍兩次 ===
      if (currentPhrase === '!Threat Detected!') {
        // 使用 BufferSource 播放威脅音效，與字樣顯示期間同步
        try { playThreat(); } catch (e) { console.error('Threat BufferSource error:', e); }
        // 文字保持快速閃爍直到此字樣結束
        if (el) {
          try { el.classList.add('blink-rapid'); } catch (_) {}
        }
      } else {
        // 非 Threat Detected 時，立即停止威脅音效（BufferSource）
        try { stopThreat(); } catch (_) {}
        // 並移除快速閃爍效果
        if (el) {
          try { el.classList.remove('blink-rapid'); } catch (_) {}
        }
      }

      // === 播放 "Can you hear me?" 音效（BufferSource） ===
      if (currentPhrase === 'Can you hear me?') {
        const startup = document.getElementById('startup-sound');
        if (startup) {
          try {
            if (!startup.paused) startup.pause();
            startup.currentTime = 0;
            startup.loop = false;
            startup.volume = 0.0;
          } catch (_) {}
        }
        try { playHear(); } catch (e) { console.error('Hear BufferSource error:', e); }
      }

      // === 在 "I am the machine." 顯示時播放 mid-sound，持續到異常字樣結束 ===
      if (currentPhrase === 'I am the machine.') {
        const mid = document.getElementById('mid-sound');
        if (mid) {
          try {
            mid.currentTime = 0;
            mid.loop = true;
            // 使用 Web Audio API 增益節點，將 mid-sound 提升到 1.1（超過 1.0）
            try {
              const AC = window.AudioContext || window.webkitAudioContext;
           if (AC) {
             const ctx = window.__tmCtx || new AC();
             window.__tmCtx = ctx;
             if (ctx.state === 'suspended') { ctx.resume().catch(() => {}); }
             if (!mid.__boostConnected) {
               const src = ctx.createMediaElementSource(mid);
               const gain = ctx.createGain();
               gain.gain.value = 1.1;
               window.__tmMidGain = gain;
               src.connect(gain).connect(ctx.destination);
               mid.__boostConnected = true;
               console.log('[Mid] Gain boost connected: 1.1');
             } else if (window.__tmMidGain) {
               window.__tmMidGain.gain.value = 1.1;
               console.log('[Mid] Gain boost updated: 1.1');
             }
           }
            } catch (e) {
              console.warn('[Mid] Gain boost failed:', e);
            }
            // 將元素自身音量設定為 1.0，增益由 GainNode 控制
            mid.volume = 1.0;
            const mp = mid.play();
            if (mp && typeof mp.then === 'function') {
              mp.then(() => console.log('[Mid] Started at I am the machine.'))
                .catch(err => console.warn('[Mid] play failed:', err));
            } else {
              console.log('[Mid] Started at I am the machine.');
            }
          } catch (e) {
            console.error('[Mid] error:', e);
          }
        } else {
          console.warn('[Mid] element missing');
        }
      }

      // 在 "S^ie%rra Ta*ng#o Osc^ar $%Papa" 顯示時播放 machine-hum
      if (currentPhrase === 'S^ie%rra Ta*ng#o Osc^ar $%Papa') {
        const hum = document.getElementById('machine-hum');
        if (hum) {
          try {
            hum.currentTime = 0;
            hum.volume = 0.45;
            hum.loop = true;
            const p = hum.play();
            if (p && typeof p.then === 'function') {
              p.catch(err => console.warn('Hum play failed:', err));
            }
            console.log('[Hum] Started at Sierra Tango Oscar Papa');
          } catch (e) {
            console.error('Hum error:', e);
          }
        }
      }

      // === <Signal lost> 第三次時淡出電流聲 ===
      if (currentPhrase === '<Signal lost>') {
        signalLostCount++;
        if (signalLostCount === 3) {
          const hum = document.getElementById('machine-hum');
          if (hum) {
            let fadeOut = setInterval(() => {
              if (hum.volume > 0.05) {
                hum.volume -= 0.05;
              } else {
                clearInterval(fadeOut);
                hum.pause();
                hum.currentTime = 0;
              }
            }, 100);
          }
        }
      }

      if (currentPhrase === '<Signal lost>' && counter >= phrases.length - 2) {
        triggerSignalLost();
        return;
      }

      // Hack overlay triple flash + RGB split + monitor overlay
      if (currentPhrase === 'You ar@ b^e-$& wat%c&*$') {
        let overlay = document.getElementById('hack-overlay');
        if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'hack-overlay';
          overlay.className = 'hack-overlay';
          document.body.appendChild(overlay);
          console.warn('[Hack] overlay element not found; created fallback overlay');
        }
        try {
          console.log('[Hack] Trigger phrase detected:', currentPhrase);
          overlay.classList.remove('flash');
          void overlay.offsetWidth; // reflow
          overlay.classList.add('flash');
          console.log('[Hack] Overlay flash class applied');
          const rgbSplit = document.createElement('div');
          rgbSplit.className = 'rgb-split';
          overlay.appendChild(rgbSplit);
          rgbSplit.addEventListener('animationend', () => {
            try { rgbSplit.remove(); console.log('[Hack] RGB split removed'); } catch (_) {}
          }, { once: true });
        } catch (e) {
          console.error('[Hack] Overlay exception:', e);
        }
        try {
          const ghost = document.createElement('div');
          ghost.className = 'mirror-ghost play';
          ghost.textContent = currentPhrase;
          const computed = window.getComputedStyle(el);
          if (computed && computed.fontSize) ghost.style.fontSize = computed.fontSize;
          document.body.appendChild(ghost);
          ghost.addEventListener('animationend', () => {
            try { ghost.remove(); console.log('[Hack] Mirror ghost removed'); } catch (_) {}
          }, { once: true });
        } catch (_) {}
        if (!modernEffectApplied) {
          try {
            document.body.classList.add('monitor-boost');
            const monitor = document.createElement('div');
            monitor.className = 'modern-monitor play';
            const reticle = document.createElement('div');
            reticle.className = 'reticle';
            monitor.appendChild(reticle);
            ['tl','tr','bl','br'].forEach(pos => {
              const c = document.createElement('div');
              c.className = 'monitor-corner ' + pos;
              monitor.appendChild(c);
            });
            document.body.appendChild(monitor);
            if (el) el.classList.add('monitor-sharp');
            monitor.addEventListener('animationend', () => {
              try { monitor.remove(); console.log('[Hack] Modern monitor overlay removed'); } catch (_) {}
              try { document.body.classList.remove('monitor-boost'); } catch (_) {}
              try { if (el) el.classList.remove('monitor-sharp'); } catch (_) {}
            }, { once: true });
          } catch (e) {
            console.error('[Hack] Modern monitor exception:', e);
          }
          modernEffectApplied = true;
        }
      }

      // STOP overlay X-shaped effect on single letters
      if (currentPhrase === 'S' || currentPhrase === 'T' || currentPhrase === 'O' || currentPhrase === 'P') {
        triggerStopX(currentPhrase);
      }


      // RUN overlay spam effect: incremental fill across occurrences
      if (currentPhrase === 'RUN') {
        try {
          // Track RUN occurrences for incremental coverage: 1/3, 2/3, 3/3
          if (typeof window.__runCount !== 'number') window.__runCount = 0;
          window.__runCount = Math.min(3, window.__runCount + 1);
          const fraction = window.__runCount / 3; // 0.33, 0.66, 1.0

          let run = document.getElementById('run-overlay');
          if (!run) {
            run = document.createElement('div');
            run.id = 'run-overlay';
            run.className = 'run-overlay';
            document.body.appendChild(run);
          }
          // Ensure visible while RUN is active
          run.style.display = 'flex';

          const computed = window.getComputedStyle(el);
          const fontSize = computed && parseInt(computed.fontSize, 10) ? parseInt(computed.fontSize, 10) : 28;
          const cellW = Math.max(50, Math.floor(fontSize * 2.5));
          const cellH = Math.max(24, Math.floor(fontSize * 1.45));
          const cols = Math.ceil(window.innerWidth / cellW);
          const rows = Math.ceil(window.innerHeight / cellH);
          const total = cols * rows;
          const target = Math.ceil(total * fraction);
          const existing = run.childElementCount;
          for (let i = existing; i < target; i++) {
            const item = document.createElement('div');
            item.className = 'run-item';
            item.textContent = 'RUN';
            item.style.width = cellW + 'px';
            item.style.height = cellH + 'px';
            run.appendChild(item);
          }
          console.log('[RUN] Count:', window.__runCount, 'fraction:', fraction.toFixed(2), 'filled target:', target + '/' + total);
        } catch (e) {
          console.error('[RUN] overlay error:', e);
        }
      } else {
        try {
          const run = document.getElementById('run-overlay');
          if (run) run.style.display = 'none'; // keep for accumulation, hide when not RUN
        } catch (_) {}
      }

      const delay = currentPhrase === '!Threat Detected!'
        ? (() => {
            const b = window.__tmThreatBuffer;
            const durMs = (b && Number.isFinite(b.duration) && b.duration > 0)
              ? Math.ceil(b.duration * 1000)
              : 1500;
            return durMs;
          })()
        : (currentPhrase === 'Can you hear me?' ? 2000 : (currentPhrase === 'RUN' ? 1500 : (currentPhrase === 'S T O P' ? 1500 : 1000)));
      console.log('[Threat] Display duration (ms):', delay);

      // 在異常字樣 "You ar@ b^e-$& wat%c&*$" 結束時同步停止 mid-sound
      if (currentPhrase === 'You ar@ b^e-$& wat%c&*$') {
        const mid = document.getElementById('mid-sound');
        if (mid) {
          try {
            console.log('[Mid] Stop scheduled at glitch end:', delay, 'ms');
            setTimeout(() => {
              try {
                if (!mid.paused) mid.pause();
                mid.currentTime = 0;
                console.log('[Mid] Stopped at glitch end');
              } catch (e) {
                console.error('[Mid] stop error:', e);
              }
            }, delay);
          } catch (_) {}
        }
      }

      counter = (counter + 1) % phrases.length;
      setTimeout(() => {
        try { window.__ghostMode = false; } catch (_) {}
        next();
      }, delay);
    });
  };

  next();
}

// === Signal Lost + CRT 關機動畫 ===
function triggerSignalLost() {
  const body = document.body;
  const el = document.querySelector('.text');

  // 立即停止所有音效，避免短音效在關機畫面持續
  try {
    if (window.__tmThreatSrc) { try { window.__tmThreatSrc.stop(); } catch(_){} try { window.__tmThreatSrc.disconnect(); } catch(_){} window.__tmThreatSrc = null; }
    if (window.__tmHearSrc) { try { window.__tmHearSrc.stop(); } catch(_){} try { window.__tmHearSrc.disconnect(); } catch(_){} window.__tmHearSrc = null; }
    if (window.__tmEndSrc) { try { window.__tmEndSrc.stop(); } catch(_){} try { window.__tmEndSrc.disconnect(); } catch(_){} window.__tmEndSrc = null; }
  } catch (_) {}
  ['machine-hum', 'startup-sound', 'mid-sound'].forEach(id => {
    const a = document.getElementById(id);
    if (a && !a.paused) {
      try { a.pause(); a.currentTime = 0; } catch (_) {}
    }
  });

  let flashes = 0;
  const flashInterval = setInterval(() => {
    body.style.backgroundColor = flashes % 2 === 0 ? '#0f0' : '#000';
    el.style.color = flashes % 2 === 0 ? '#000' : '#0f0';
    flashes++;
    if (flashes > 4) {
      clearInterval(flashInterval);
      setTimeout(() => {
        try {
          const hum = document.getElementById('machine-hum');
          if (hum) {
            if (!hum.paused) hum.pause();
            hum.currentTime = 0;
            console.log('[Hum] Stopped before screenShutdown');
          }
        } catch (e) {
          console.error('Hum stop failed:', e);
        }
        screenShutdown();
      }, 300);
    }
  }, 150);
}

function screenShutdown() {
  // 設定延遲 2000ms 播放關機結束音效（BufferSource）
  console.log('[End] Scheduled with 2000ms delay');
  setTimeout(() => {
    try {
      playEnd();
      console.log('[End] Played at screenShutdown (BufferSource, delayed 2000ms)');
    } catch (e) {
      console.error('[End] BufferSource error:', e);
    }
  }, 2000);

  const crt = document.querySelector('.crt') || document.body;
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
    background: #000; display: flex; align-items: center; justify-content: center;
    color: #0f0; font-family: 'APPLE II', monospace; font-size: 24px;
    transition: opacity 2s ease; opacity: 0;
  `;
  overlay.textContent = '[ CONNECTION TERMINATED ]';
  crt.appendChild(overlay);

  setTimeout(() => (overlay.style.opacity = 1), 300);
  setTimeout(() => crtFadeToCRTLine(), 3000);
}


function crtFadeToCRTLine() {
  const line = document.createElement('div');
  line.style.cssText = `
    position: fixed; top: 50%; left: 0; width: 100%; height: 100%;
    background: #000; z-index: 9999; overflow: hidden;
  `;
  document.body.appendChild(line);

  const beam = document.createElement('div');
  beam.style.cssText = `
    position: absolute; top: 50%; left: 0; width: 100%; height: 2px;
    background: white; box-shadow: 0 0 15px white; transform: translateY(-50%);
  `;
  line.appendChild(beam);

  beam.animate(
    [
      { transform: 'scaleY(1)', opacity: 1 },
      { transform: 'scaleY(0.05)', opacity: 1, offset: 0.6 },
      { transform: 'scaleY(0.02)', opacity: 0.8, offset: 0.8 },
      { transform: 'scaleY(0.01)', opacity: 0 },
    ],
    { duration: 1200, easing: 'ease-in-out', fill: 'forwards' }
  );

  // 不再移除整個 body，避免播放中的音訊被中斷
  setTimeout(() => {
    document.body.style.background = '#000';
    const blackout = document.createElement('div');
    blackout.style.position = 'fixed';
    blackout.style.inset = '0';
    blackout.style.background = '#000';
    blackout.style.zIndex = 99999;
    document.body.appendChild(blackout);
  }, 1500);
}

function triggerStopX(letter) {
  try {
    let overlay = document.getElementById('stop-overlay');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'stop-overlay';
      overlay.className = 'stop-overlay';
      document.body.appendChild(overlay);
    }
    // 清空前一次內容
    overlay.innerHTML = '';
    // 清除舊的隱藏計時器，避免上一輪在新一輪期間把 overlay 隱藏
    try { if (window.__stopOverlayTimer) { clearTimeout(window.__stopOverlayTimer); window.__stopOverlayTimer = null; } } catch (_) {}
    // 建立本輪的 runToken，舊輪清理不會影響新輪
    const runToken = Date.now() + '_' + Math.random().toString(36).slice(2);
    overlay.dataset.runToken = runToken;
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const clonesPerDiagonal = 12; // 固定每條對角的克隆數
    const diag = Math.hypot(cx, cy);
    const step = Math.max(48, Math.floor(diag / clonesPerDiagonal));
    const computed = window.getComputedStyle(document.querySelector('.text'));
    const fontSize = computed && parseInt(computed.fontSize, 10) ? parseInt(computed.fontSize, 10) : 28;
    let idx = 0;

    const addClone = (x, y, delay, sizeMul) => {
      const el = document.createElement('div');
      el.className = 'stop-letter play';
      el.textContent = letter;
      el.style.left = x + 'px';
      el.style.top = y + 'px';
      el.style.fontSize = Math.floor(fontSize * (sizeMul || 1)) + 'px';
      el.style.animationDelay = delay + 'ms';
      overlay.appendChild(el);
    };

    const maxI = clonesPerDiagonal;
    for (let i = 0; i <= maxI; i++) {
      const d = i * step;
      const positions = [
        [cx - d, cy - d], // 左上
        [cx + d, cy + d], // 右下
        [cx + d, cy - d], // 右上
        [cx - d, cy + d]  // 左下
      ];
      for (const [x, y] of positions) {
        if (x < 0 || x > window.innerWidth || y < 0 || y > window.innerHeight) continue;
        const delay = 60 * idx;
        addClone(x, y, delay, 1 + i * 0.02);
        idx++;
      }
    }

    overlay.style.display = 'block';
    const totalDuration = 60 * idx + 1600;
    window.__stopOverlayTimer = setTimeout(() => {
      try {
        if (overlay.dataset.runToken !== runToken) return; // 舊輪清理不影響新輪
        overlay.style.display = 'none';
        overlay.innerHTML = '';
      } catch (_) {}
    }, totalDuration);
  } catch (e) {
    console.error('[STOP] overlay error:', e);
  }
}

function hideStopOverlayImmediate() {
  try {
    const overlay = document.getElementById('stop-overlay');
    try { if (window.__stopOverlayTimer) { clearTimeout(window.__stopOverlayTimer); window.__stopOverlayTimer = null; } } catch (_) {}
    if (overlay) {
      overlay.style.display = 'none';
      overlay.innerHTML = '';
      try { overlay.dataset.runToken = ''; } catch (_) {}
    }
  } catch (_) {}
}

// 每個已完成字母的殘影生成
function spawnTypingGhost(textEl, idx, char) {
  try {
    const span = textEl.querySelector(`span.final-letter[data-idx="${idx}"]`);
    if (!span) return;
    const rect = span.getBoundingClientRect();
    const computed = window.getComputedStyle(textEl);
    const fontSize = computed && parseInt(computed.fontSize, 10) ? parseInt(computed.fontSize, 10) : 28;
    const color = (window.__ghostColor || computed.color || '#0f0');

    const clones = 2;
    for (let k = 0; k < clones; k++) {
      const ghost = document.createElement('div');
      ghost.className = 'type-ghost play';
      ghost.textContent = char;
      ghost.setAttribute('data-text', char);
      const jitterX = (Math.random() < 0.5 ? -1 : 1) * 0.5;
      const jitterY = (Math.random() < 0.5 ? -1 : 1) * 0.5;
      ghost.style.left = (rect.left + rect.width / 2 + dx) + 'px';
      ghost.style.top = (rect.top + rect.height / 2 + dy) + 'px';
      ghost.style.fontSize = fontSize + 'px';
      ghost.style.color = color;
      try { ghost.style.textShadow = `0 0 8px ${color}, 0 0 18px ${color}`; } catch (_) {}
      document.body.appendChild(ghost);
      ghost.addEventListener('animationend', () => { try { ghost.remove(); } catch (_) {} }, { once: true });
    }
  } catch (e) {
    console.error('[Ghost] spawn error:', e);
  }
}

function spawnTypingGhost(textEl, idx, char) {
  try {
    const span = textEl.querySelector(`span.final-letter[data-idx="${idx}"]`);
    if (!span) return;
    const rect = span.getBoundingClientRect();
    const computed = window.getComputedStyle(textEl);
    const fontSize = computed && parseInt(computed.fontSize, 10) ? parseInt(computed.fontSize, 10) : 28;
    const color = (window.__ghostColor || computed.color || '#0f0');

    const offsets = [
      { dx: -2, dy: -1 },
      { dx: 2, dy: 0 },
      { dx: -1, dy: 2 },
      { dx: 1, dy: -2 }
    ];

    offsets.forEach((o) => {
      const ghost = document.createElement('div');
      ghost.className = 'type-ghost play';
      ghost.textContent = char;
      ghost.setAttribute('data-text', char);
      const jitterX = (Math.random() < 0.5 ? -1 : 1) * 0.5;
      const jitterY = (Math.random() < 0.5 ? -1 : 1) * 0.5;
      ghost.style.left = (rect.left + rect.width / 2 + o.dx + jitterX) + 'px';
      ghost.style.top = (rect.top + rect.height / 2 + o.dy + jitterY) + 'px';
      ghost.style.fontSize = fontSize + 'px';
      ghost.style.color = color;
      ghost.style.textShadow = `0 0 10px ${color}, 0 0 24px ${color}, 0 0 40px ${color}`;
      document.body.appendChild(ghost);
      ghost.addEventListener('animationend', () => { try { ghost.remove(); } catch (_) {} }, { once: true });
    });
  } catch (e) {
    console.error('[Ghost] spawn error:', e);
  }
}


function triggerStopFull(word) {
  try {
    // 一次白閃底色
    try { triggerStopWhiteFlash(); } catch (_) {}

    let overlay = document.getElementById('stop-fullscreen');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'stop-fullscreen';
      overlay.className = 'stop-fullscreen';
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = '';
    try { if (window.__stopFullTimer) { clearTimeout(window.__stopFullTimer); window.__stopFullTimer = null; } } catch (_) {}
    const runToken = Date.now() + '_' + Math.random().toString(36).slice(2);
    overlay.dataset.runToken = runToken;
    const el = document.querySelector('.text');
    const computed = el ? window.getComputedStyle(el) : null;
    const color = computed && computed.color ? computed.color : '#0f0';
    const fontSize = computed && computed.fontSize ? computed.fontSize : '28px';

    const wordEl = document.createElement('div');
    wordEl.className = 'stop-full-word play';
    wordEl.textContent = word;
    wordEl.style.color = color;
    wordEl.style.fontSize = fontSize;
    // 更強烈的光暈
    try { wordEl.style.textShadow = `0 0 12px ${color}, 0 0 32px ${color}, 0 0 60px ${color}, 0 0 84px ${color}`; } catch (_) {}
    // 使用強化版的放大動畫 + 脈衝光暈
    try { wordEl.style.animation = 'stopFullExpandWarn 1000ms ease-out 1 forwards, stopGlowPulse 620ms ease-out 1 forwards'; } catch (_) {}
    overlay.appendChild(wordEl);
    overlay.style.display = 'flex';

    wordEl.addEventListener('animationend', () => {
      try {
        if (overlay.dataset.runToken !== runToken) return;
        overlay.style.display = 'none';
        overlay.innerHTML = '';
      } catch (_) {}
    }, { once: true });

    window.__stopFullTimer = setTimeout(() => {
      try {
        if (overlay.dataset.runToken !== runToken) return;
        overlay.style.display = 'none';
        overlay.innerHTML = '';
      } catch (_) {}
    }, 1300);
  } catch (e) {
    console.error('[STOP FULL] overlay error:', e);
  }
}

// 一次白閃底色 overlay
function triggerStopWhiteFlash() {
  try {
    let flash = document.getElementById('stop-white-flash');
    if (!flash) {
      flash = document.createElement('div');
      flash.id = 'stop-white-flash';
      flash.className = 'stop-white-flash';
      document.body.appendChild(flash);
    }
    flash.classList.remove('play');
    void flash.offsetWidth; // reflow
    flash.classList.add('play');
    flash.style.display = 'block';
    flash.addEventListener('animationend', () => {
      try { flash.style.display = 'none'; } catch (_) {}
    }, { once: true });
    window.__stopWhiteFlashTimer = setTimeout(() => {
      try { flash.style.display = 'none'; } catch (_) {}
    }, 240);
  } catch (e) {
    console.error('[STOP WHITE FLASH] overlay error:', e);
  }
}

function hideStopWhiteFlashImmediate() {
  try {
    const flash = document.getElementById('stop-white-flash');
    try { if (window.__stopWhiteFlashTimer) { clearTimeout(window.__stopWhiteFlashTimer); window.__stopWhiteFlashTimer = null; } } catch (_) {}
    if (flash) {
      flash.style.display = 'none';
    }
  } catch (_) {}
}
