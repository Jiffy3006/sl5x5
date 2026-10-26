'use strict';
const KEY = 'sl5x5.v1';
const NAMES = { squat: 'Kniebeuge', bench: 'Bankdrücken', row: 'Langhantelrudern', ohp: 'Schulterdrücken', deadlift: 'Kreuzheben' };
const PLAN = { A: [['squat', 5], ['bench', 5], ['row', 5]], B: [['squat', 5], ['ohp', 5], ['deadlift', 1]] };
const STEP = { squat: 2.5, bench: 2.5, row: 2.5, ohp: 2.5, deadlift: 5 };

const defaults = () => ({
  weights: { squat: 40, bench: 30, row: 30, ohp: 20, deadlift: 50 },
  fails: { squat: 0, bench: 0, row: 0, ohp: 0, deadlift: 0 },
  next: 'A', history: [], session: null,
  settings: { rest: 90, autoTimer: true }
});
const load = () => {
  try { const d = JSON.parse(localStorage.getItem(KEY)); return d ? { ...defaults(), ...d } : defaults(); }
  catch { return defaults(); }
};
let S = load();
const save = () => {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { alert('Speichern fehlgeschlagen: ' + e.message); }
};

const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fw = w => String(w).replace('.', ',');
const fd = iso => new Date(iso).toLocaleDateString('de-AT', { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' });

/* ---------- Pausentimer (zeitstempelbasiert, übersteht Drosselung im Hintergrund) ---------- */
let restEnd = 0, tick = null, ctx = null, lock = null;
function startRest() {
  if (!S.settings.autoTimer) return;
  try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); ctx.resume && ctx.resume(); } catch {}
  restEnd = Date.now() + S.settings.rest * 1000;
  clearInterval(tick); tick = setInterval(updateTimer, 250); updateTimer();
}
function stopRest() { restEnd = 0; clearInterval(tick); updateTimer(); }
function updateTimer() {
  const left = Math.ceil((restEnd - Date.now()) / 1000);
  if (restEnd && left <= 0) { stopRest(); beep(); return; }
  $('#timer').hidden = !restEnd;
  if (restEnd) $('#tt').textContent = 'Pause ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
}
function beep() {
  try {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = 880; g.gain.value = 0.2; o.connect(g); g.connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + 0.5);
  } catch {}
  if (navigator.vibrate) navigator.vibrate([250, 100, 250]);
}

/* ---------- Bildschirm während des Trainings anlassen ---------- */
async function wake() {
  try {
    if (S.session && 'wakeLock' in navigator && !lock) {
      lock = await navigator.wakeLock.request('screen');
      lock.addEventListener('release', () => { lock = null; });
    }
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') wake(); });

/* ---------- Views ---------- */
let tab = 'train';

function vTrain() {
  const s = S.session;
  if (s) {
    return `<h2>Workout ${s.type}</h2>` + s.ex.map((x, i) => `
      <section class="card">
        <div class="row"><b>${esc(x.name)}</b>
          <span class="w"><button data-a="w" data-i="${i}" data-d="-1" aria-label="Weniger Gewicht">−</button>
          <output>${fw(x.weight)} kg</output>
          <button data-a="w" data-i="${i}" data-d="1" aria-label="Mehr Gewicht">+</button></span></div>
        <div class="sets">${x.sets.map((v, j) =>
          `<button class="set ${v === null ? '' : v === x.target ? 'ok' : 'part'}" data-a="set" data-i="${i}" data-j="${j}">${v === null ? x.target : v}</button>`
        ).join('')}</div>
      </section>`).join('') +
      `<button class="primary" data-a="finish">Workout beenden</button>
       <button class="link danger" data-a="cancel">Workout verwerfen</button>`;
  }
  const t = S.next;
  return `<section class="card">
    <small>Nächstes Workout</small><h2>Workout ${t}</h2>
    <ul>${PLAN[t].map(([id, n]) => `<li><span>${NAMES[id]}${S.fails[id] ? ` <small>(Fehlversuche ${S.fails[id]}/3)</small>` : ''}</span><b>${n}×5 · ${fw(S.weights[id])} kg</b></li>`).join('')}</ul>
    <button class="primary" data-a="start">Training starten</button>
    <button class="link" data-a="swap">Stattdessen Workout ${t === 'A' ? 'B' : 'A'}</button>
  </section>`;
}

function vHist() {
  if (!S.history.length) return '<p class="empty">Noch keine Einträge. Dein erstes Workout erscheint hier.</p>';
  return S.history.map(h => `
    <section class="card">
      <div class="row"><b>Workout ${esc(h.type)}</b><small>${fd(h.date)}</small></div>
      ${h.ex.map(x => `<div class="line"><span>${esc(x.name)} · ${fw(x.weight)} kg</span><span>${x.sets.map(v => v === null ? '–' : v).join(' ')}</span></div>`).join('')}
      <button class="link danger" data-a="del" data-id="${h.id}">Eintrag löschen</button>
    </section>`).join('');
}

function vSetup() {
  return `
  <section class="card"><h3>Aktuelle Gewichte</h3>
    ${Object.keys(NAMES).map(id => `<label class="line"><span>${NAMES[id]}</span><span><input type="number" inputmode="decimal" step="0.5" min="0" value="${S.weights[id]}" data-w="${id}"> kg</span></label>`).join('')}
  </section>
  <section class="card"><h3>Pause</h3>
    <label class="line"><span>Timer nach jedem Satz starten</span><input type="checkbox" id="auto" ${S.settings.autoTimer ? 'checked' : ''}></label>
    <label class="line"><span>Pausenlänge</span><span><input type="number" inputmode="numeric" min="10" step="10" value="${S.settings.rest}" data-rest> s</span></label>
  </section>
  <section class="card"><h3>Daten</h3>
    <button class="btn" data-a="csv">Verlauf als CSV exportieren</button>
    <button class="btn" data-a="json">Sicherung als JSON speichern</button>
    <button class="btn" data-a="share">Sicherung teilen (Drive, Mail …)</button>
    <label class="btn">Sicherung wiederherstellen<input type="file" id="imp" accept=".json,application/json" hidden></label>
    <button class="btn danger" data-a="reset">Alle Daten löschen</button>
  </section>`;
}

function render() {
  $('#view').innerHTML = { train: vTrain, hist: vHist, setup: vSetup }[tab]();
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
}

/* ---------- Export / Import ---------- */
function download(name, text, mime) {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 10);
const csvText = () => {
  const q = v => '"' + String(v).replace(/"/g, '""') + '"';
  const rows = ['Datum;Workout;Übung;Satz;Wiederholungen;Gewicht_kg'];
  S.history.forEach(h => h.ex.forEach(x => x.sets.forEach((v, j) =>
    rows.push([q(h.date.slice(0, 16).replace('T', ' ')), h.type, q(x.name), j + 1, v === null ? '' : v, String(x.weight).replace('.', ',')].join(';')))));
  return '\ufeff' + rows.join('\n');
};
const jsonText = () => JSON.stringify({ app: 'sl5x5', version: 1, exported: new Date().toISOString(),
  weights: S.weights, fails: S.fails, next: S.next, history: S.history, settings: S.settings }, null, 2);

async function shareFile(name, text, mime) {
  const f = new File([text], name, { type: mime });
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title: name }); } catch {}
  } else download(name, text, mime);
}

// akzeptiert das eigene Format und das Backup-Format der alten HTML-Version
const normalize = h => ({
  id: h.id, date: h.date, type: h.type,
  ex: (h.ex || h.exercises || []).map(x => ({
    id: x.id, name: x.name, weight: x.weight, target: x.target || x.targetReps || 5, sets: x.sets || x.completedSets || []
  }))
});
async function importFile(file) {
  if (!file) return;
  try {
    const d = JSON.parse(await file.text());
    if (!Array.isArray(d.history)) throw new Error('kein Verlauf gefunden');
    if (!confirm('Aktuelle Daten durch die Sicherung ersetzen?')) return;
    const st = d.settings || {};
    S = { ...defaults(), weights: { ...defaults().weights, ...d.weights }, fails: { ...defaults().fails, ...d.fails },
      next: d.next || d.nextWorkout || 'A', history: d.history.map(normalize),
      settings: { rest: st.rest || st.defaultRest || 90, autoTimer: st.autoTimer !== false } };
    save(); render(); alert('Sicherung wiederhergestellt.');
  } catch (e) { alert('Import fehlgeschlagen: ' + e.message); }
}

/* ---------- Aktionen ---------- */
const A = {
  start() {
    const t = S.next;
    S.session = { type: t, start: Date.now(),
      ex: PLAN[t].map(([id, n]) => ({ id, name: NAMES[id], weight: S.weights[id], target: 5, sets: Array(n).fill(null) })) };
    save(); wake(); render();
  },
  swap() { S.next = S.next === 'A' ? 'B' : 'A'; save(); render(); },
  set(b) {
    const x = S.session.ex[+b.dataset.i], j = +b.dataset.j, v = x.sets[j];
    x.sets[j] = v === null ? x.target : v > 0 ? v - 1 : null;   // Tippen: 5 → 4 → … → 0 → leer
    save(); render();
    if (x.sets[j] === null) stopRest(); else startRest();
  },
  w(b) {
    const x = S.session.ex[+b.dataset.i];
    x.weight = Math.max(0, x.weight + (+b.dataset.d) * STEP[x.id]);
    save(); render();
  },
  finish() {
    const s = S.session;
    if (s.ex.some(x => x.sets.includes(null)) && !confirm('Nicht alle Sätze sind eingetragen. Trotzdem beenden?')) return;
    s.ex.forEach(x => {
      if (x.sets.every(v => v === null)) return;                  // Übung nicht gemacht: nichts ändern
      if (x.sets.every(v => v === x.target)) { S.weights[x.id] = x.weight + STEP[x.id]; S.fails[x.id] = 0; }
      else {
        S.weights[x.id] = x.weight; S.fails[x.id]++;
        if (S.fails[x.id] >= 3) { S.weights[x.id] = Math.round(x.weight * 0.9 / 2.5) * 2.5; S.fails[x.id] = 0; }  // Deload −10 %
      }
    });
    S.history.unshift({ id: Date.now(), date: new Date().toISOString(), type: s.type, ex: s.ex });
    S.next = s.type === 'A' ? 'B' : 'A'; S.session = null;
    save(); stopRest(); if (lock) lock.release(); render();
  },
  cancel() { if (confirm('Dieses Workout verwerfen?')) { S.session = null; save(); stopRest(); if (lock) lock.release(); render(); } },
  del(b) { if (confirm('Eintrag löschen? Die Gewichte bleiben unverändert.')) { S.history = S.history.filter(h => String(h.id) !== b.dataset.id); save(); render(); } },
  stoprest() { stopRest(); },
  csv() { download(`stronglifts_${stamp()}.csv`, csvText(), 'text/csv;charset=utf-8'); },
  json() { download(`stronglifts_backup_${stamp()}.json`, jsonText(), 'application/json'); },
  share() { shareFile(`stronglifts_backup_${stamp()}.json`, jsonText(), 'application/json'); },
  reset() { if (confirm('Wirklich ALLE Daten löschen?')) { localStorage.removeItem(KEY); S = defaults(); stopRest(); render(); } }
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-a],[data-tab]');
  if (!b) return;
  if (b.dataset.tab) { tab = b.dataset.tab; render(); return; }
  if (A[b.dataset.a]) A[b.dataset.a](b);
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.w) { const v = parseFloat(t.value.replace(',', '.')); if (v > 0) { S.weights[t.dataset.w] = v; S.fails[t.dataset.w] = 0; save(); } }
  else if ('rest' in t.dataset) { const v = parseInt(t.value, 10); if (v >= 10) { S.settings.rest = v; save(); } }
  else if (t.id === 'auto') { S.settings.autoTimer = t.checked; save(); }
  else if (t.id === 'imp') { importFile(t.files[0]); t.value = ''; }
});

render(); wake();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(console.error);
if (navigator.storage && navigator.storage.persist) navigator.storage.persist();   // Browser soll die Daten nicht von selbst löschen
