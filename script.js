(() => {
  'use strict';
  const featuredCharacter = { featuredCharacter: 'Dante', featuredCharacterImage: 'assets/dante-provisional.png', featuredCharacterAlt: 'Ilustración provisional de Dante: cazador de cabello plateado, abrigo rojo y espada' };
  const SAVE_KEY = 'save-point-state', SAVE_VERSION = 3;
  const screens = [...document.querySelectorAll('.screen')], hud = document.getElementById('hudText'), saveStatus = document.getElementById('saveStatus');
  const auraButtons = [...document.querySelectorAll('.swatch')], accessoryButtons = [...document.querySelectorAll('.accessory')];
  const allowedScreens = ['inicio', 'personaje', 'boss', 'final'];
  const auraNames = Object.fromEntries(auraButtons.map(b => [b.dataset.color, b.dataset.name]));
  const accessoryNames = Object.fromEntries(accessoryButtons.map(b => [b.dataset.item, b.dataset.name]));
  let state, storageAvailable = true, noticeTimer = null, transitionTimer = null, combatTimer = null, audioContext = null;
  let fight = { round: 1, hearts: 3, boss: 3, phase: 'idle', gaugeStart: 0, gaugeDuration: 0, target: .66, perfect: .075, active: false };

  function freshState() { return { version: SAVE_VERSION, screen: 'inicio', aura: '#f0a65d', accessory: '✦', sound: false, combat: { round: 1, hearts: 3, boss: 3 } }; }
  function validSave(v) { return v && typeof v === 'object' && v.version === SAVE_VERSION && allowedScreens.includes(v.screen) && Object.hasOwn(auraNames, v.aura) && Object.hasOwn(accessoryNames, v.accessory) && typeof v.sound === 'boolean' && v.combat && Number.isInteger(v.combat.round) && v.combat.round >= 1 && v.combat.round <= 3 && Number.isInteger(v.combat.hearts) && v.combat.hearts >= 0 && v.combat.hearts <= 3 && Number.isInteger(v.combat.boss) && v.combat.boss >= 1 && v.combat.boss <= 3 && v.combat.boss === 4 - v.combat.round; }
  function readSave() {
    let raw;
    try { raw = localStorage.getItem(SAVE_KEY); } catch (_) { storageAvailable = false; return freshState(); }
    if (!raw) return freshState();
    try {
      const v = JSON.parse(raw);
      if (validSave(v)) return v;
      // Migrate the previous search-game save, keeping only checked appearance/audio settings.
      if (v && v.version === 2 && Object.hasOwn(auraNames, v.aura) && Object.hasOwn(accessoryNames, v.accessory) && typeof v.sound === 'boolean') return { ...freshState(), aura: v.aura, accessory: v.accessory, sound: v.sound, screen: ['personaje', 'mapa', 'boss', 'final'].includes(v.screen) ? 'personaje' : 'inicio' };
    } catch (_) { /* corrupted JSON is removed below */ }
    try { localStorage.removeItem(SAVE_KEY); } catch (_) { storageAvailable = false; }
    return freshState();
  }
  function persist() {
    state.version = SAVE_VERSION;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); storageAvailable = true; saveStatus.textContent = 'GUARDADO AUTOMÁTICO · PARTIDA GUARDADA'; }
    catch (_) { storageAvailable = false; saveStatus.textContent = 'MODO TEMPORAL · EL NAVEGADOR NO PUEDE GUARDAR'; }
  }
  function clearCombatTimer() { clearTimeout(combatTimer); combatTimer = null; }
  function clearNotice() { clearTimeout(noticeTimer); noticeTimer = null; document.getElementById('achievement').classList.remove('show'); }
  function showScreen(id) {
    if (!allowedScreens.includes(id)) return;
    clearTimeout(transitionTimer); clearCombatTimer();
    const curtain = document.getElementById('transitionCurtain'); curtain.classList.remove('play'); void curtain.offsetWidth; curtain.classList.add('play');
    screens.forEach(s => { const active = s.id === id; s.hidden = !active; s.classList.toggle('active', active); s.setAttribute('aria-hidden', String(!active)); });
    const resumeFight = id === 'boss' && state.screen === 'boss';
    state.screen = id; hud.textContent = ({ inicio: 'NUEVA PARTIDA DISPONIBLE', personaje: 'CAPÍTULO 01 — CREACIÓN', boss: 'CAPÍTULO 02 — EL UMBRAL', final: 'MISIÓN COMPLETADA' })[id]; persist();
    window.scrollTo({ top: 0, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    transitionTimer = setTimeout(() => curtain.classList.remove('play'), 700);
    if (id === 'boss') startFight(resumeFight);
  }
  function applyCustomization() {
    document.documentElement.style.setProperty('--avatar-color', state.aura);
    document.querySelectorAll('.avatar-body').forEach(b => b.style.backgroundColor = state.aura);
    document.querySelectorAll('.stage-glow').forEach(g => g.style.backgroundColor = state.aura);
    document.querySelectorAll('.hat').forEach(h => h.textContent = state.accessory);
    auraButtons.forEach(b => { const on = b.dataset.color === state.aura; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', String(on)); });
    accessoryButtons.forEach(b => { const on = b.dataset.item === state.accessory; b.classList.toggle('selected', on); b.setAttribute('aria-pressed', String(on)); });
    document.getElementById('loadoutText').textContent = `${accessoryNames[state.accessory]} ${auraNames[state.aura]}`;
  }
  function syncSound() { const b = document.getElementById('soundToggle'); b.setAttribute('aria-pressed', String(state.sound)); b.setAttribute('aria-label', state.sound ? 'Desactivar sonidos' : 'Activar sonidos'); b.innerHTML = `♫ <span>SONIDO ${state.sound ? 'ON' : 'OFF'}</span>`; }
  function notify(title, sub, duration = 1900) { clearTimeout(noticeTimer); const box = document.getElementById('achievement'); document.getElementById('achievementTitle').textContent = title; document.getElementById('achievementSub').textContent = sub; box.classList.add('show'); noticeTimer = setTimeout(() => { box.classList.remove('show'); noticeTimer = null; }, duration); }
  function playTone(f = 660, d = .08) { if (!state.sound) return; try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); const o = audioContext.createOscillator(), g = audioContext.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.04, audioContext.currentTime); g.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + d); o.connect(g); g.connect(audioContext.destination); o.start(); o.stop(audioContext.currentTime + d); } catch (_) { /* optional */ } }
  function setButtons(dodge = false, attack = false) { document.getElementById('dodgeBtn').disabled = !dodge; document.getElementById('attackBtn').disabled = !attack; }
  function phase(name, caption, feedback, gaugeLabel = 'ESPERA LA SEÑAL') {
    fight.phase = name;
    const arena = document.getElementById('arena'); arena.className = `boss-arena ${name}`;
    document.getElementById('phaseCaption').textContent = caption; document.getElementById('combatFeedback').textContent = feedback; document.getElementById('gaugeLabel').textContent = gaugeLabel;
    document.getElementById('timingGauge').classList.remove('running');
    document.getElementById('dangerMark').hidden = !['enemy-telegraph', 'dodge-window'].includes(name);
    setButtons(name === 'dodge-window', name === 'attack-window');
  }
  function gauge(action, duration) {
    fight.gaugeStart = performance.now(); fight.gaugeDuration = duration; fight.target = .66;
    const width = Math.max(.12, .26 - (fight.round - 1) * .045); fight.perfect = .08 - (fight.round - 1) * .012;
    const gaugeEl = document.getElementById('timingGauge'); gaugeEl.style.setProperty('--target-start', `${(fight.target - width / 2) * 100}%`); gaugeEl.style.setProperty('--target-width', `${width * 100}%`);
    gaugeEl.style.setProperty('--gauge-duration', `${duration}ms`); void gaugeEl.offsetWidth; gaugeEl.classList.add('running');
    if (action === 'dodge') combatTimer = setTimeout(() => missDodge(), duration);
    else combatTimer = setTimeout(() => missAttack(), duration);
  }
  function startFight(resume = false) {
    clearCombatTimer();
    if (!resume) state.combat = { round: 1, hearts: 3, boss: 3 };
    fight = { round: resume ? state.combat.round : 1, hearts: resume ? state.combat.hearts : 3, boss: resume ? state.combat.boss : 3, phase: 'idle', gaugeStart: 0, gaugeDuration: 0, target: .66, perfect: .08, active: true };
    persist();
    document.getElementById('outcomeOverlay').hidden = true; document.getElementById('retryBtn').hidden = true;
    document.querySelectorAll('.heart').forEach(h => h.classList.toggle('lost', Number(h.dataset.heart) > fight.hearts));
    updateBoss(); updateRound(); phase('intro', 'EL DUELO COMIENZA', resume ? 'Partida recuperada. El duelo vuelve a empezar esta ronda.' : 'Lee el ritmo del guardián. Esquiva y contraataca.');
    if (fight.hearts === 0) { finishFight(false); return; }
    combatTimer = setTimeout(telegraph, 1100);
  }
  function updateBoss() { document.getElementById('bossHealthFill').style.width = `${fight.boss / 3 * 100}%`; document.getElementById('bossHealth').setAttribute('aria-valuenow', String(fight.boss)); document.getElementById('bossHealthText').textContent = `${fight.boss} / 3`; }
  function updateRound() { document.getElementById('roundNumber').innerHTML = `${String(fight.round).padStart(2, '0')} <small>/ 03</small>`; }
  function telegraph() { if (!fight.active) return; clearCombatTimer(); phase('enemy-telegraph', '¡PREPARA LA ESQUIVA!', 'El guardián carga un golpe. Pulsa cuando el marcador cruce la zona dorada.', 'ESQUIVA EN LA ZONA DORADA'); combatTimer = setTimeout(() => { phase('dodge-window', '¡AHORA!', '¡Esquiva en el instante preciso!', 'PULSA ESQUIVAR'); gauge('dodge', [2300, 2050, 1850][fight.round - 1]); }, [950, 820, 700][fight.round - 1]); }
  function precision() { const progress = (performance.now() - fight.gaugeStart) / fight.gaugeDuration; const diff = Math.abs(progress - fight.target); return diff <= fight.perfect ? 'perfect' : diff <= Math.max(.12, .19 - (fight.round - 1) * .02) ? 'good' : 'miss'; }
  function dodge() {
    if (!fight.active || fight.phase !== 'dodge-window') return;
    const result = precision(); clearCombatTimer();
    if (result === 'miss') { missDodge(); return; }
    const perfect = result === 'perfect'; phase('enemy-vulnerable', perfect ? 'ESQUIVA PERFECTA' : 'BUEN TIEMPO', perfect ? '¡El guardián quedó expuesto! Contraataca.' : 'El núcleo está expuesto. ¡Ataca ahora!'); document.getElementById('playerFighter').classList.add('dodging'); playTone(perfect ? 920 : 740); notify(perfect ? 'ESQUIVA PERFECTA' : 'ESQUIVA A TIEMPO', 'El guardián quedó expuesto.', 1200);
    combatTimer = setTimeout(() => { document.getElementById('playerFighter').classList.remove('dodging'); phase('attack-window', '¡CONTRAATACA!', 'Golpea cuando el marcador cruce la zona dorada.', 'ATACA EN LA ZONA DORADA'); gauge('attack', [2200, 1950, 1750][fight.round - 1]); }, perfect ? 420 : 600);
  }
  function missDodge() {
    clearCombatTimer(); if (!fight.active) return; fight.hearts--;
    document.querySelector(`.heart[data-heart="${fight.hearts + 1}"]`).classList.add('lost'); document.getElementById('playerFighter').classList.add('damaged'); state.combat = { round: fight.round, hearts: fight.hearts, boss: fight.boss }; persist(); playTone(180);
    if (fight.hearts <= 0) { finishFight(false); return; }
    phase('enemy-attack', 'GOLPE RECIBIDO', 'No llegaste a esquivar. Recupera el ritmo para el siguiente intento.'); combatTimer = setTimeout(() => { document.getElementById('playerFighter').classList.remove('damaged'); telegraph(); }, 1050);
  }
  function missAttack() { clearCombatTimer(); if (!fight.active) return; phase('enemy-attack', 'EL NÚCLEO SE CERRÓ', 'El contraataque no conectó. Vuelve a leer el ritmo.'); playTone(260); combatTimer = setTimeout(telegraph, 950); }
  function attack() {
    if (!fight.active || fight.phase !== 'attack-window') return;
    const result = precision(); clearCombatTimer(); if (result === 'miss') { missAttack(); return; }
    fight.boss--; updateBoss(); const boss = document.getElementById('bossFighter'); boss.classList.add('hit'); document.getElementById('arena').classList.add('enemy-hit'); playTone(result === 'perfect' ? 980 : 800); notify(result === 'perfect' ? 'GOLPE PERFECTO' : 'GOLPE CERTERO', `Energía del guardián: ${fight.boss} de 3.`, 1500);
    if (fight.boss === 0) { state.screen = 'final'; persist(); finishFight(true); return; }
    fight.round++; state.combat = { round: fight.round, hearts: fight.hearts, boss: fight.boss }; persist();
    phase('enemy-hit', '¡IMPACTO!', 'El guardián perdió energía. ¡Mantén el ritmo!'); updateRound(); combatTimer = setTimeout(() => { boss.classList.remove('hit'); telegraph(); }, 1200);
  }
  function finishFight(won) {
    clearCombatTimer(); fight.active = false; setButtons();
    const overlay = document.getElementById('outcomeOverlay'); overlay.hidden = false;
    document.getElementById('outcomeTitle').textContent = won ? '¡VICTORIA!' : 'FIN DEL COMBATE';
    document.getElementById('outcomeText').textContent = won ? 'El guardián se aparta. Tu mensaje aguarda al otro lado.' : 'El umbral sigue en pie. Ajusta el ritmo y vuelve a intentarlo.';
    document.getElementById('retryBtn').hidden = won;
    if (won) { phase('victory', 'UMBRAL ABIERTO', '¡Lo lograste! La carta se desbloqueó.'); combatTimer = setTimeout(() => showScreen('final'), 2300); }
    else phase('game-over', 'FIN DEL COMBATE', 'Prueba otra vez cuando estés listo.');
  }
  function newGame() { clearNotice(); clearCombatTimer(); state = { ...freshState(), sound: state.sound }; applyCustomization(); syncSound(); }
  function configureFeaturedCharacter() {
    const image = document.getElementById('featuredImage'), name = featuredCharacter.featuredCharacter.toUpperCase();
    image.alt = featuredCharacter.featuredCharacterAlt; image.hidden = false; document.getElementById('featuredName').textContent = `${name} · ELECCIÓN PROVISIONAL`; document.getElementById('fallbackName').textContent = name;
    image.addEventListener('load', () => { document.getElementById('imageFallback').hidden = true; });
    image.addEventListener('error', () => { document.getElementById('imageFallback').hidden = false; image.hidden = true; }); image.src = featuredCharacter.featuredCharacterImage;
  }
  document.getElementById('homeLink').addEventListener('click', e => { e.preventDefault(); clearCombatTimer(); showScreen('inicio'); });
  document.getElementById('startBtn').addEventListener('click', () => { newGame(); playTone(520); showScreen('personaje'); });
  document.getElementById('soundToggle').addEventListener('click', () => { state.sound = !state.sound; syncSound(); persist(); playTone(740); });
  auraButtons.forEach(b => b.addEventListener('click', () => { state.aura = b.dataset.color; applyCustomization(); persist(); playTone(620); }));
  accessoryButtons.forEach(b => b.addEventListener('click', () => { state.accessory = b.dataset.item; applyCustomization(); persist(); playTone(690); }));
  document.getElementById('confirmLook').addEventListener('click', () => { applyCustomization(); notify('PERSONAJE CONFIRMADO', 'Tu look ya está listo para el combate.', 1400); playTone(880); showScreen('boss'); });
  document.getElementById('dodgeBtn').addEventListener('click', dodge); document.getElementById('attackBtn').addEventListener('click', attack);
  document.getElementById('retryBtn').addEventListener('click', () => startFight(false));
  document.addEventListener('keydown', e => {
    if (e.repeat || state.screen !== 'boss') return;
    const tag = e.target && e.target.tagName;
    if (['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;
    if (e.code === 'Space' || e.code === 'ArrowDown') { if (fight.phase === 'dodge-window') { e.preventDefault(); dodge(); } }
    else if (e.code === 'KeyZ' || e.code === 'Enter') { if (fight.phase === 'attack-window') { e.preventDefault(); attack(); } }
  });
  document.getElementById('replayBtn').addEventListener('click', () => { clearNotice(); newGame(); showScreen('inicio'); });
  state = readSave(); applyCustomization(); syncSound(); configureFeaturedCharacter();
  saveStatus.textContent = storageAvailable ? 'GUARDADO AUTOMÁTICO · LISTO' : 'MODO TEMPORAL · EL NAVEGADOR NO PUEDE GUARDAR';
  // Keep the saved screen, but never revive a timed attack after reload.
  showScreen(state.screen);
})();
