const fmtNumber = v => (typeof v === 'number' ? v.toLocaleString('ru-RU') : (v ?? ''));
const fmtFloat = v => (typeof v === 'number' ? v.toLocaleString('ru-RU', {maximumFractionDigits:2}) : (v ?? ''));
const toNumber = value => {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const normalized = value.replace(/\s+/g, '').replace(',', '.');
    const n = Number(normalized);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
};
const pluralizePoints = value => {
  const num = Math.abs(Math.trunc(value));
  if (!Number.isFinite(value) || Math.floor(Math.abs(value)) !== Math.abs(value)) {
    return 'очков';
  }
  const mod10 = num % 10;
  const mod100 = num % 100;
  if (mod10 === 1 && mod100 !== 11) return 'очко';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'очка';
  return 'очков';
};
const formatPoints = (value, { signed = true } = {}) => {
  const num = toNumber(value);
  if (!Number.isFinite(num)) {
    const prefix = signed ? '+' : '';
    return `${prefix}${value ?? ''} очков`;
  }
  const absValue = Math.abs(num);
  const formatted = Number.isInteger(absValue) ? fmtNumber(absValue) : fmtFloat(absValue);
  const signChar = signed ? (num >= 0 ? '+' : '-') : (num < 0 ? '-' : '');
  const suffix = pluralizePoints(num);
  return `${signChar}${formatted} ${suffix}`;
};
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
    tableEl.querySelectorAll('th.sortable').forEach(th => {
      th.dataset.dir = th.dataset.key === state.key ? state.dir : '';
    });
    if (counterEl) counterEl.textContent = data.length + ' записей';
  }

  tableEl.querySelectorAll('th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      state.dir = (state.key === key && state.dir === 'asc') ? 'desc' : 'asc';
      state.key = key;
      update();
    });
  });
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

    $('#title').textContent = tInfo?.title || 'Турнир';

    // Overview
    $('#t-desc').textContent = tInfo?.description || 'Описание будет добавлено позже.';
    const pl = tInfo?.scoring?.placements || [];
    const plList = $('#t-placements');
    plList.innerHTML = '';
    pl.forEach(p => {
      const placeValue = p.place;
      const placeLabel = (typeof placeValue === 'number') ? fmtNumber(placeValue) : (placeValue ?? '-');
      const pointsLabel = formatPoints(p.points ?? 0);
      const row = document.createElement('div');
      row.className = 'placement-row';
      row.innerHTML = `
        <div class="placement-rank"><span>${placeLabel}</span></div>
        <div class="placement-body">
          <div class="placement-label">Место ${placeLabel}</div>
          <div class="placement-points">${pointsLabel}</div>
        </div>
      `;
      plList.appendChild(row);
    });
    if (!pl.length) {
      plList.innerHTML = `
        <div class="placement-row">
          <div class="placement-rank"><span>–</span></div>
          <div class="placement-body">
            <div class="placement-label">Нет данных</div>
            <div class="placement-points">Правила начисления будут обновлены позже</div>
          </div>
        </div>
      `;
    }

    const killPoints = tInfo?.scoring?.killPoints ?? 0;
    $('#t-kill').textContent = formatPoints(killPoints);
    $('#t-matches').textContent = fmtNumber(tInfo?.matches?.total ?? 0);
    const maps = tInfo?.matches?.maps || [];
    $('#t-maps').innerHTML = maps.length ? maps.map(m => `<span class="pill">${m}</span>`).join('') : '<span class="pill">TBD</span>';
    const rules = tInfo?.rules || [];
    $('#t-rules').innerHTML = rules.length ? rules.map(r => `<div>${r}</div>`).join('') : '<div>Тай-брейк не задан</div>';

    // Teams
    const teamCols = [
      { key:'place',   title:'#', num:true, format:'int' },
      { key:'team',    title:'Команда' },
      { key:'points',  title:'Очки', num:true, format:'int' },
      { key:'kills',   title:'Убийства', num:true, format:'int' },
      { key:'placeAvg',title:'Сред. место', num:true, format:'float' },
      { key:'matches', title:'Матчи', num:true, format:'int' },
    ];
    
    const perMatchEl = $('#perMatch');
    // Use card tiles with centered team name and horizontal chips
    perMatchEl.classList.add('pergrid');
    perMatchEl.innerHTML = teamRows.map(t => {
      const chips = (t.perMatchPoints||[]).map((pts, i) => {
        const k = t.perMatchKills?.[i] ?? 0;
        const pl = t.perMatchPlacement?.[i] ?? '-';
        return `<span class="chip">M${i+1}: +${pts} • ${k}K • Pl ${pl}</span>`;
      }).join('');
      return `<div class="teamcard">
        <div class="teamcard-title">${t.team}</div>
        <div class="teamcard-line">${chips}</div>
      </div>`;
    }).join('');

    const matchesEl = $('#matchesList');
    if (matchesEl) {
      const maps = tInfo?.matches?.maps || [];
      const totalMatches = Math.max(
        tInfo?.matches?.total ?? 0,
        ...teamRows.map(t => t.perMatchPoints?.length || 0),
        ...teamRows.map(t => t.perMatchKills?.length || 0),
        ...teamRows.map(t => t.perMatchPlacement?.length || 0)
      );

      if (!totalMatches) {
        matchesEl.innerHTML = '<div class="match-empty">Нет данных о матчах.</div>';
      } else {
        const matchCards = [];
        for (let i = 0; i < totalMatches; i += 1) {
          const entries = teamRows.map(t => ({
            team: t.team,
            points: t.perMatchPoints?.[i],
            kills: t.perMatchKills?.[i],
            placement: t.perMatchPlacement?.[i]
          })).filter(e => e.points != null || e.kills != null || e.placement != null);

          entries.forEach(e => {
            e.points = typeof e.points === 'number' ? e.points : Number(e.points ?? 0);
            e.kills = typeof e.kills === 'number' ? e.kills : Number(e.kills ?? 0);
            if (typeof e.placement === 'string') {
              const n = Number(e.placement);
              e.placement = Number.isFinite(n) ? n : e.placement;
            }
          });

          entries.sort((a, b) => {
            const diff = (b.points ?? 0) - (a.points ?? 0);
            if (diff !== 0) return diff;
            return (b.kills ?? 0) - (a.kills ?? 0);
          });

          const topKills = entries.reduce((best, curr) => {
            if (!best) return curr;
            if ((curr.kills ?? -Infinity) > (best.kills ?? -Infinity)) return curr;
            if ((curr.kills ?? -Infinity) === (best.kills ?? -Infinity) && (curr.points ?? 0) > (best.points ?? 0)) return curr;
            return best;
          }, null);
          const bestPlacement = entries.reduce((best, curr) => {
            if (typeof curr.placement !== 'number') return best;
            if (!best) return curr;
            if ((curr.placement ?? Infinity) < (best.placement ?? Infinity)) return curr;
            if ((curr.placement ?? Infinity) === (best.placement ?? Infinity) && (curr.points ?? 0) > (best.points ?? 0)) return curr;
            return best;
          }, null);

          const rowsHtml = entries.map((entry, idx) => {
            const pointsText = `+${fmtNumber(entry.points ?? 0)} оч.`;
            const killsText = `${fmtNumber(entry.kills ?? 0)}K`;
            const placeText = entry.placement != null ? `Pl ${fmtNumber(entry.placement)}` : 'Pl -';
            return `<div class="match-row ${idx === 0 ? 'is-first' : ''}">
              <span class="rank">#${idx + 1}</span>
              <span class="team-name">${entry.team}</span>
              <span class="stat">${pointsText}</span>
              <span class="placement">${killsText} • ${placeText}</span>
            </div>`;
          }).join('');

          const metaLines = [];
          const leader = entries[0];
          if (leader) {
            const leaderPoints = `+${fmtNumber(leader.points ?? 0)} оч.`;
            const leaderKills = `${fmtNumber(leader.kills ?? 0)}K`;
            const leaderPlace = leader.placement != null
              ? (typeof leader.placement === 'number' ? fmtNumber(leader.placement) : leader.placement)
              : '—';
            metaLines.push(`Лидер: <strong>${leader.team}</strong> (${leaderPoints}, ${leaderKills}, место ${leaderPlace})`);
          }
          if (topKills && topKills !== leader) {
            metaLines.push(`Больше всего киллов: <strong>${topKills.team}</strong> (${fmtNumber(topKills.kills ?? 0)}K)`);
          }
          if (bestPlacement && bestPlacement !== leader) {
            const bestPlace = bestPlacement.placement != null ? fmtNumber(bestPlacement.placement) : '—';
            metaLines.push(`Лучший плейсмент: <strong>${bestPlacement.team}</strong> (место ${bestPlace})`);
          }

          const metaHtml = metaLines.length ? metaLines.map(line => `<div>${line}</div>`).join('') : '<div>Нет дополнительной статистики.</div>';

          matchCards.push(`
            <div class="match-card">
              <div class="match-card-header">
                <div class="match-title">Матч ${i + 1}</div>
                ${maps[i] ? `<div class="match-map">${maps[i]}</div>` : ''}
              </div>
              <div class="match-meta">${metaHtml}</div>
              ${rowsHtml ? `<div class="match-rows">${rowsHtml}</div>` : '<div class="match-empty">Нет данных по этому матчу.</div>'}
            </div>
          `);
        }

        matchesEl.innerHTML = matchCards.join('');
      }
    }
    sortable($('#teamsTable'), teamRows, teamCols, $('#teamCount'), $('#teamFilter'), {key:'points', dir:'desc'});

    // Players
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

    // tabs
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