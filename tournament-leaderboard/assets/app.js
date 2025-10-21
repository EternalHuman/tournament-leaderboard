const fmtNumber = v => (typeof v === 'number' ? v.toLocaleString('ru-RU') : (v ?? ''));
const fmtFloat = v => (typeof v === 'number' ? v.toLocaleString('ru-RU', {maximumFractionDigits:2}) : (v ?? ''));
const $ = sel => document.querySelector(sel);

async function loadJSON(path) {
  const meta = window.__meta || {};
  const v = meta.version ? `?v=${encodeURIComponent(meta.version)}` : '';
  const r = await fetch(path + v);
  if (!r.ok) throw new Error('Failed to load ' + path);
  return r.json();
}

function setActiveTab(id) {
  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === id);
  });
  document.querySelectorAll('[data-panel]').forEach(el => {
    el.style.display = (el.dataset.panel === id) ? 'block' : 'none';
  });
  // remember in hash
  location.hash = id;
}

function sortable(tableEl, rows, columns, counterEl, filterInput, defaultSort) {
  let state = { key: defaultSort?.key ?? columns[0].key, dir: defaultSort?.dir ?? 'desc', q: '' };

  function filtered() {
    if (!state.q) return rows.slice();
    const q = state.q.toLowerCase();
    return rows.filter(r => Object.values(r).some(x => String(x??'').toLowerCase().includes(q)));
  }

  function update() {
    const col = columns.find(c => c.key === state.key) || columns[0];
    const data = filtered().sort((a,b) => {
      const aV = a[state.key], bV = b[state.key];
      const isNum = !!col.num;
      const m = state.dir === 'desc' ? -1 : 1;
      if (isNum) return ((aV??0)-(bV??0))*m;
      return String(aV??'').localeCompare(String(bV??''), 'ru', {numeric:true, sensitivity:'base'})*m;
    });
    // render
    const tbody = tableEl.querySelector('tbody');
    tbody.innerHTML='';
    for (const r of data) {
      const tr = document.createElement('tr');
      for (const c of columns) {
        const td = document.createElement('td');
        td.className = c.num ? 'num' : '';
        td.dataset.label = c.title;
        let value = r[c.key];
        if (c.format === 'float') value = fmtFloat(value);
        else if (c.format === 'int') value = fmtNumber(value);
        td.textContent = value ?? '';
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    // header arrows
    tableEl.querySelectorAll('th.sortable').forEach(th => {
      th.dataset.dir = th.dataset.key === state.key ? state.dir : '';
    });
    if (counterEl) counterEl.textContent = data.length + ' записей';
  }

  // header events
  tableEl.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      state.dir = (state.key === key && state.dir === 'asc') ? 'desc' : 'asc';
      state.key = key;
      update();
    });
  });
  // filter
  filterInput?.addEventListener('input', e => { state.q = e.target.value.trim(); update(); });

  update();
}

async function init() {
  try {
    window.__meta = await loadJSON('data/meta.json').catch(()=>({}));
    const m = window.__meta;
    const updated = m?.generatedAt ? new Date(m.generatedAt).toLocaleString('ru-RU') : 'неизвестно';
    $('#updated').textContent = 'Обновлено: ' + updated;

    const [ tInfo, teamRows, playerRows ] = await Promise.all([
      loadJSON('data/tournament.json'),
      loadJSON('data/teams.json'),
      loadJSON('data/players.json')
    ]);

    // Header title
    $('#title').textContent = tInfo?.title || 'Турнир';

    // Panel: Overview
    $('#t-desc').textContent = tInfo?.description || '';
    const pl = tInfo?.scoring?.placements || [];
    const plList = $('#t-placements');
    plList.innerHTML = '';
    pl.forEach(p => {
      const li = document.createElement('div');
      li.className = 'kv';
      li.innerHTML = `<div class="k">Место ${p.place}</div><div class="v">+${fmtNumber(p.points)} оч.</div>`;
      plList.appendChild(li);
    });
    $('#t-kill').textContent = '+' + fmtFloat(tInfo?.scoring?.killPoints ?? 0) + ' оч. за убийство';
    $('#t-assist').textContent = '+' + fmtFloat(tInfo?.scoring?.assistPoints ?? 0) + ' оч. за поддержку';
    $('#t-revive').textContent = '+' + fmtFloat(tInfo?.scoring?.revivePoints ?? 0) + ' оч. за ревайв';
    $('#t-matches').textContent = fmtNumber(tInfo?.matches?.total ?? 0);
    const maps = tInfo?.matches?.maps || [];
    $('#t-maps').innerHTML = maps.map(m => `<span class="pill">${m}</span>`).join('');
    $('#t-rules').innerHTML = (tInfo?.rules||[]).map(r => `<div>• ${r}</div>`).join('');

    // Panel: Teams
    const teamCols = [
      { key:'place',   title:'#', num:true, format:'int' },
      { key:'team',    title:'Команда' },
      { key:'points',  title:'Очки', num:true, format:'int' },
      { key:'kills',   title:'Убийства', num:true, format:'int' },
      { key:'placeAvg',title:'Сред. место', num:true, format:'float' },
      { key:'matches', title:'Матчи', num:true, format:'int' },
    ];
    const perMatchEl = $('#perMatch');
    perMatchEl.innerHTML = teamRows.map(t => {
      const pills = (t.perMatchPoints||[]).map(v => `<span class="pill">${fmtNumber(v)}</span>`).join('');
      return `<div class="kv"><div class="k">${t.team}</div><div class="v pills">${pills}</div></div>`;
    }).join('');
    sortable($('#teamsTable'), teamRows, teamCols, $('#teamCount'), $('#teamFilter'), {key:'points', dir:'desc'});

    // Panel: Players
    const playerCols = [
      { key:'player',  title:'Игрок' },
      { key:'team',    title:'Команда' },
      { key:'adr',     title:'ADR', num:true, format:'float' },
      { key:'kills',   title:'Убийства', num:true, format:'int' },
      { key:'assists', title:'Поддержки', num:true, format:'int' },
      { key:'revives', title:'Ревайвы', num:true, format:'int' },
      { key:'matches', title:'Матчи', num:true, format:'int' },
    ];
    sortable($('#playersTable'), playerRows, playerCols, $('#playerCount'), $('#playerFilter'), {key:'adr', dir:'desc'});

    // tabs setup
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
    });
    const initial = location.hash?.replace('#','') || 'overview';
    setActiveTab(initial);

  } catch (e) {
    console.error(e);
    alert('Ошибка загрузки данных: ' + e.message);
  }
}

document.addEventListener('DOMContentLoaded', init);