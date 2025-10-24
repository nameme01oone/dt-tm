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

    for (let i = 0, n = this.queue.length; i < n; i++) {
      let { from, to, start, end, char } = this.queue[i];
      if (this.frame >= end) {
        complete++;
        output += to;
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

  // Attempt to play audio automatically
  if (audio) {
    audio.play().catch(error => {
      console.error("Audio autoplay failed:", error);
    });
  }

  // 模擬開機延遲（3 秒）
  setTimeout(() => {
    loadingScreen.classList.add('fade-out');

    setTimeout(() => {
      loadingScreen.classList.add('hidden');
      mainScreen.classList.remove('hidden');
      if (audio) {
        audio.pause();
      }
      startMainSequence();
    }, 1000);
  }, 2000);
});

// === 主畫面邏輯 ===
function startMainSequence() {
  const phrases = [
    'loading....',
    'loading...',
    'loading....',
    'Can you hear me?',
    'I am the machine.',
    'You are being watched.',
    'You ar@#%^-b^e-$&^wat%c&*',
    'Sie%^rra Ta*#ngo Osc^ar $%Papa',
    'Sierra',
    'Tango',
    'Oscar',
    'Papa',
    'S',
    'T',
    'O',
    'P',
    'S T O P',
    'unstable connection..',
    'unstable connection....',
    'Protect...',
    'my people.',
    '-Signal lost-',
    '-Signal lost-',
    '-Signal lost-'
  ];

  const el = document.querySelector('.text');
  const fx = new TextScramble(el);
  let counter = 0;

  const next = () => {
    fx.setText(phrases[counter]).then(() => {
      if (phrases[counter] === '-Signal lost-' && counter >= phrases.length - 3) {
        triggerSignalLost();
        return;
      }
      setTimeout(next, 1000);
    });
    counter = (counter + 1) % phrases.length;
  };

  next();
}

// === Signal Lost + 關機動畫 ===
function triggerSignalLost() {
  const body = document.body;
  const el = document.querySelector('.text');

  let flashes = 0;
  const flashInterval = setInterval(() => {
    body.style.backgroundColor = flashes % 2 === 0 ? '#0f0' : '#000';
    el.style.color = flashes % 2 === 0 ? '#000' : '#0f0';
    flashes++;
    if (flashes > 4) {
      clearInterval(flashInterval);
      setTimeout(screenShutdown, 300);
    }
  }, 150);
}

// === CRT 熄滅動畫 ===
function screenShutdown() {
  const crt = document.querySelector('.crt') || document.body;

  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = 0;
  overlay.style.left = 0;
  overlay.style.width = '100%';
  overlay.style.height = '100%';
  overlay.style.background = '#000';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.color = '#0f0';
  overlay.style.fontFamily = 'APPLE II, monospace';
  overlay.style.fontSize = '24px';
  overlay.style.transition = 'opacity 2s ease';
  overlay.style.opacity = 0;
  overlay.textContent = '[ CONNECTION TERMINATED ]';
  crt.appendChild(overlay);

  setTimeout(() => {
    overlay.style.opacity = 1;
  }, 300);

  setTimeout(() => {
    crtFadeToCRTLine();
  }, 3000);
}

// === CRT 收縮線動畫 ===
function crtFadeToCRTLine() {
  const line = document.createElement('div');
  line.style.position = 'fixed';
  line.style.top = '50%';
  line.style.left = 0;
  line.style.width = '100%';
  line.style.height = '100%';
  line.style.background = '#000';
  line.style.zIndex = 9999;
  line.style.overflow = 'hidden';
  document.body.appendChild(line);

  const beam = document.createElement('div');
  beam.style.position = 'absolute';
  beam.style.top = '50%';
  beam.style.left = 0;
  beam.style.width = '100%';
  beam.style.height = '2px';
  beam.style.background = 'white';
  beam.style.boxShadow = '0 0 15px white';
  beam.style.transform = 'translateY(-50%)';
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

  setTimeout(() => {
    document.body.style.background = '#000';
    document.body.innerHTML = '';
  }, 1500);
}
