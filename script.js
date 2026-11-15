(() => {
  const screens = [...document.querySelectorAll('.screen')];
  const hud = document.getElementById('hudText');
  let collected = 0;
  let audioContext = null;
  let soundOn = false;
  const labels = ['NUEVA PARTIDA DISPONIBLE', 'CAPÍTULO 01 — EL MAPA', 'CAPÍTULO 02 — TU PERSONAJE', 'MISIÓN COMPLETADA'];
  function show(id) {
    screens.forEach(s => s.classList.toggle('active', s.id === id));
    hud.textContent = labels[['inicio','mapa','personaje','final'].indexOf(id)] || labels[0];
    window.scrollTo({top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'});
  }
  function tone(freq = 660, duration = .08) {
    if (!soundOn) return;
    try {
      audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioContext.createOscillator(), gain = audioContext.createGain();
      osc.type = 'sine'; osc.frequency.value = freq; gain.gain.setValueAtTime(.045, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.001, audioContext.currentTime + duration);
      osc.connect(gain); gain.connect(audioContext.destination); osc.start(); osc.stop(audioContext.currentTime + duration);
    } catch (_) { /* Sonido opcional: la experiencia funciona sin audio. */ }
  }
  document.getElementById('startBtn').addEventListener('click', () => { tone(520); show('mapa'); });
  document.getElementById('soundToggle').addEventListener('click', e => {
    soundOn = !soundOn; e.currentTarget.innerHTML = `♫ <span>SONIDO ${soundOn ? 'ON' : 'OFF'}</span>`; e.currentTarget.setAttribute('aria-label', soundOn ? 'Desactivar sonidos' : 'Activar sonidos'); tone(740);
  });
  const achievement = document.getElementById('achievement');
  document.querySelectorAll('.collectible').forEach((gem, i) => gem.addEventListener('click', () => {
    if (gem.classList.contains('collected')) return;
    gem.classList.add('collected'); collected++; tone(580 + i * 100);
    document.getElementById('progressText').textContent = `${collected} / 3`;
    document.getElementById('achievementTitle').textContent = collected === 3 ? 'MISIÓN COMPLETADA' : 'DESTELLO ENCONTRADO';
    document.getElementById('achievementSub').textContent = collected === 3 ? 'El camino al siguiente nivel está abierto.' : `Llevas ${collected} de 3. Un secreto más cerca.`;
    achievement.classList.add('show'); setTimeout(() => achievement.classList.remove('show'), 2100);
    if (collected === 3) setTimeout(() => show('personaje'), 1100);
  }));
  const names = { '✦':'ESTRELLA', '♢':'CRISTAL', '☾':'LUNA', '♡':'CORAZÓN' };
  let aura = 'ÁMBAR', item = '✦';
  function updateLoadout() { document.getElementById('loadoutText').textContent = `${names[item]} ${aura}`; document.querySelector('.hat').textContent = item; tone(680); }
  document.querySelectorAll('.swatch').forEach(btn => btn.addEventListener('click', () => {
    document.querySelector('.swatch.selected').classList.remove('selected'); btn.classList.add('selected');
    const color = btn.dataset.color; document.documentElement.style.setProperty('--avatar-color', color); document.querySelector('.custom-avatar').style.setProperty('--avatar-color', color); document.querySelector('.stage-glow').style.background = color;
    aura = ({'#f0a65d':'ÁMBAR','#7fd3bf':'MENTA','#b9a0f5':'VIOLETA','#ee8294':'ROSA'})[color]; updateLoadout();
  }));
  document.querySelectorAll('.accessory').forEach(btn => btn.addEventListener('click', () => { document.querySelector('.accessory.selected').classList.remove('selected'); btn.classList.add('selected'); item = btn.dataset.item; updateLoadout(); }));
  document.getElementById('confirmLook').addEventListener('click', () => { tone(880); show('final'); });
  document.getElementById('replayBtn').addEventListener('click', () => {
    collected = 0; document.querySelectorAll('.collectible').forEach(g => g.classList.remove('collected')); document.getElementById('progressText').textContent = '0 / 3'; show('inicio');
  });
})();
