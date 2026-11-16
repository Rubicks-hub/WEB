(() => {
  'use strict';

  // Cambia solo estos tres campos para usar a Link u otro personaje.
  const featuredCharacter = {
    featuredCharacter: 'Dante',
    featuredCharacterImage: 'assets/dante-provisional.png',
    featuredCharacterAlt: 'Ilustración provisional de Dante: cazador de cabello plateado, abrigo rojo y espada',
  };

  const SAVE_KEY = 'save-point-state';
  const SAVE_VERSION = 2;
  const screens = [...document.querySelectorAll('.screen')];
  const hud = document.getElementById('hudText');
  const saveStatus = document.getElementById('saveStatus');
  const auraButtons = [...document.querySelectorAll('.swatch')];
  const accessoryButtons = [...document.querySelectorAll('.accessory')];
  const searchButtons = [...document.querySelectorAll('.search-point')];
  const allowedScreens = ['inicio', 'personaje', 'mapa', 'final'];
  const auraNames = Object.fromEntries(auraButtons.map(button => [button.dataset.color, button.dataset.name]));
  const accessoryNames = Object.fromEntries(accessoryButtons.map(button => [button.dataset.item, button.dataset.name]));
  const discoveries = {
    moth: 'Una lucecita se desprende de las ramas. El sendero parece menos silencioso.',
    rune: 'La marca de la piedra responde al tacto. Un símbolo se suma a la señal.',
    pouch: 'La pequeña bolsa guardaba el último fragmento. La señal está completa.',
  };

  let state = freshState();
  let storageAvailable = true;
  let noticeTimer = null;
  let transitionTimer = null;
  let hintTimer = null;
  let audioContext = null;

  function freshState() {
    return { version: SAVE_VERSION, screen: 'inicio', aura: '#f0a65d', accessory: '✦', found: [], hints: 0, sound: false };
  }

  function isValidSave(value) {
    const validIds = Object.keys(discoveries);
    return value && typeof value === 'object' && value.version === SAVE_VERSION &&
      allowedScreens.includes(value.screen) && Object.hasOwn(auraNames, value.aura) &&
      Object.hasOwn(accessoryNames, value.accessory) && Array.isArray(value.found) &&
      value.found.length <= validIds.length && value.found.every(id => validIds.includes(id)) &&
      new Set(value.found).size === value.found.length && Number.isInteger(value.hints) &&
      value.hints >= 0 && value.hints <= 3 && typeof value.sound === 'boolean';
  }

  function readSave() {
    let raw;
    try {
      raw = localStorage.getItem(SAVE_KEY);
    } catch (_) {
      storageAvailable = false;
      return freshState();
    }
    if (!raw) return freshState();
    let parsed;
    try { parsed = JSON.parse(raw); } catch (_) { parsed = null; }
    if (isValidSave(parsed)) return parsed;
    try { localStorage.removeItem(SAVE_KEY); } catch (_) { storageAvailable = false; }
    return freshState();
  }

  function persist() {
    state.version = SAVE_VERSION;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      storageAvailable = true;
      saveStatus.textContent = 'GUARDADO AUTOMÁTICO · PARTIDA GUARDADA';
    } catch (_) {
      storageAvailable = false;
      saveStatus.textContent = 'MODO TEMPORAL · EL NAVEGADOR NO PUEDE GUARDAR';
    }
  }

  function showScreen(id) {
    if (!allowedScreens.includes(id)) return;
    clearTimeout(transitionTimer);
    clearTimeout(hintTimer);
    document.getElementById('transitionCurtain').classList.remove('play');
    void document.getElementById('transitionCurtain').offsetWidth;
    document.getElementById('transitionCurtain').classList.add('play');
    screens.forEach(screen => {
      const active = screen.id === id;
      screen.hidden = !active;
      screen.classList.toggle('active', active);
      screen.setAttribute('aria-hidden', String(!active));
    });
    state.screen = id;
    hud.textContent = ({ inicio: 'NUEVA PARTIDA DISPONIBLE', personaje: 'CAPÍTULO 01 — CREACIÓN', mapa: 'CAPÍTULO 02 — EL VALLE', final: 'MISIÓN COMPLETADA' })[id];
    persist();
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    transitionTimer = setTimeout(() => document.getElementById('transitionCurtain').classList.remove('play'), 700);
    if (id === 'mapa') startHintTimer();
  }

  function applyCustomization() {
    document.documentElement.style.setProperty('--avatar-color', state.aura);
    document.querySelectorAll('.avatar-body').forEach(body => body.style.backgroundColor = state.aura);
    document.querySelectorAll('.stage-glow').forEach(glow => glow.style.backgroundColor = state.aura);
    document.querySelectorAll('.hat').forEach(hat => hat.textContent = state.accessory);
    auraButtons.forEach(button => {
      const selected = button.dataset.color === state.aura;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    accessoryButtons.forEach(button => {
      const selected = button.dataset.item === state.accessory;
      button.classList.toggle('selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    document.getElementById('loadoutText').textContent = `${accessoryNames[state.accessory]} ${auraNames[state.aura]}`;
  }

  function applySearchProgress() {
    document.getElementById('progressText').textContent = `${state.found.length} / ${Object.keys(discoveries).length}`;
    searchButtons.forEach(button => {
      const found = state.found.includes(button.dataset.id);
      button.disabled = found;
      button.classList.toggle('found', found);
      button.setAttribute('aria-pressed', String(found));
      button.setAttribute('aria-label', found ? `Hallazgo recogido: ${button.dataset.id}` : button.dataset.originalLabel);
    });
    document.getElementById('mapStatus').textContent = state.found.length === 3 ? 'SEÑAL COMPLETA' : state.found.length ? 'SEÑAL INCOMPLETA' : 'BUSCA 3 PISTAS';
    document.getElementById('fragmentText').textContent = state.found.length ? discoveries[state.found[state.found.length - 1]] : 'Los objetos extraños guardan fragmentos de una señal.';
  }

  function applyHintState() {
    const hints = [
      'El camino guarda secretos a plena vista.',
      'Pista 1/3: el sendero y las ruinas esconden cosas que no pertenecen al valle.',
      'Pista 2/3: mira entre las ramas, en la piedra antigua y junto al camino.',
      'Pista 3/3: busca un destello pequeño, una marca tallada y una bolsa oscura.',
    ];
    document.getElementById('hintText').textContent = hints[state.hints];
  }

  function syncSoundControl() {
    const button = document.getElementById('soundToggle');
    button.setAttribute('aria-pressed', String(state.sound));
    button.setAttribute('aria-label', state.sound ? 'Desactivar sonidos' : 'Activar sonidos');
    button.innerHTML = `♫ <span>SONIDO ${state.sound ? 'ON' : 'OFF'}</span>`;
  }

  function notify(title, description, duration = 2200) {
    clearTimeout(noticeTimer);
    document.getElementById('achievementTitle').textContent = title;
    document.getElementById('achievementSub').textContent = description;
    const notice = document.getElementById('achievement');
    notice.classList.add('show');
    noticeTimer = setTimeout(() => notice.classList.remove('show'), duration);
  }

  function playTone(frequency = 660, duration = 0.08) {
    if (!state.sound) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.04, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + duration);
    } catch (_) {
      // El sonido es opcional y no bloquea la partida.
    }
  }

  function startHintTimer() {
    clearTimeout(hintTimer);
    hintTimer = setTimeout(() => {
      if (state.screen === 'mapa' && state.found.length < 3 && state.hints === 0) {
        document.getElementById('hintText').textContent = 'Pista disponible: usa «Pedir pista» si quieres una ayuda.';
      }
    }, 25000);
  }

  function newGame() {
    clearTimeout(noticeTimer);
    document.getElementById('achievement').classList.remove('show');
    state = freshState();
    applyCustomization();
    applySearchProgress();
    applyHintState();
    syncSoundControl();
    persist();
  }

  function configureFeaturedCharacter() {
    const image = document.getElementById('featuredImage');
    const name = featuredCharacter.featuredCharacter.toUpperCase();
    image.alt = featuredCharacter.featuredCharacterAlt;
    image.hidden = false;
    document.getElementById('featuredName').textContent = `${name} · ELECCIÓN PROVISIONAL`;
    document.getElementById('fallbackName').textContent = name;
    image.addEventListener('load', () => { document.getElementById('imageFallback').hidden = true; });
    image.addEventListener('error', () => {
      document.getElementById('imageFallback').hidden = false;
      image.hidden = true;
    });
    image.src = featuredCharacter.featuredCharacterImage;
  }

  document.querySelectorAll('.search-point').forEach(button => button.dataset.originalLabel = button.getAttribute('aria-label'));

  document.getElementById('homeLink').addEventListener('click', event => {
    event.preventDefault();
    showScreen('inicio');
  });

  document.getElementById('startBtn').addEventListener('click', () => {
    newGame();
    playTone(520);
    showScreen('personaje');
  });

  document.getElementById('soundToggle').addEventListener('click', event => {
    state.sound = !state.sound;
    syncSoundControl();
    persist();
    playTone(740);
  });

  auraButtons.forEach(button => button.addEventListener('click', () => {
    state.aura = button.dataset.color;
    applyCustomization();
    persist();
    playTone(620);
  }));

  accessoryButtons.forEach(button => button.addEventListener('click', () => {
    state.accessory = button.dataset.item;
    applyCustomization();
    persist();
    playTone(690);
  }));

  document.getElementById('confirmLook').addEventListener('click', () => {
    applyCustomization();
    notify('PERSONAJE CONFIRMADO', 'Tu look ya está listo para la misión.', 1400);
    playTone(880);
    showScreen('mapa');
  });

  searchButtons.forEach((button, index) => button.addEventListener('click', () => {
    const id = button.dataset.id;
    if (button.disabled || state.found.includes(id)) return;
    state.found.push(id);
    button.disabled = true;
    button.classList.add('found');
    button.setAttribute('aria-pressed', 'true');
    button.setAttribute('aria-label', `Hallazgo recogido: ${id}`);
    document.getElementById('progressText').textContent = `${state.found.length} / 3`;
    document.getElementById('fragmentText').textContent = discoveries[id];
    document.getElementById('mapStatus').textContent = state.found.length === 3 ? 'SEÑAL COMPLETA' : 'SEÑAL INCOMPLETA';
    persist();
    notify(state.found.length === 3 ? 'SEÑAL COMPLETA' : 'FRAGMENTO ENCONTRADO', state.found.length === 3 ? 'La señal abre el mensaje final.' : `Fragmento ${state.found.length} de 3 añadido a la señal.`);
    playTone(580 + index * 95);
    if (state.found.length === 3) setTimeout(() => showScreen('final'), 850);
  }));

  document.getElementById('hintBtn').addEventListener('click', () => {
    state.hints = Math.min(state.hints + 1, 3);
    applyHintState();
    persist();
  });

  document.getElementById('replayBtn').addEventListener('click', () => {
    clearTimeout(noticeTimer);
    newGame();
    showScreen('inicio');
  });

  // Estado accesible y recuperado; valores inválidos vuelven a una partida limpia.
  state = readSave();
  applyCustomization();
  applySearchProgress();
  configureFeaturedCharacter();
  syncSoundControl();
  applyHintState();
  saveStatus.textContent = storageAvailable ? 'GUARDADO AUTOMÁTICO · LISTO' : 'MODO TEMPORAL · EL NAVEGADOR NO PUEDE GUARDAR';
  showScreen(state.found.length === 3 && state.screen === 'mapa' ? 'final' : state.screen);
})();
