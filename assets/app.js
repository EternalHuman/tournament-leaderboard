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

const normalizePlacementRanges = value => {
  const ranges = [];
  if (Array.isArray(value)) {
    value.forEach(v => {
      normalizePlacementRanges(v).forEach(range => ranges.push(range));
    });
    return ranges;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    ranges.push({ min: value, max: value });
    return ranges;
  }
  if (typeof value !== 'string') return ranges;

  const tokens = value.split(',');
  tokens.forEach(token => {
    const text = token.trim();
    if (!text) return;
    const match = text.match(/^(\d+)(?:\s*[-–—]\s*(\d+))?$/);
    if (match) {
      const start = Number(match[1]);
      const end = Number(match[2] ?? match[1]);
      if (Number.isFinite(start) && Number.isFinite(end)) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        ranges.push({ min, max });
      }
      return;
    }
    const num = toNumber(text);
    if (Number.isFinite(num)) {
      ranges.push({ min: num, max: num });
    }
  });
  return ranges;
};

const createPlacementResolver = placements => {
  const rules = [];
  (Array.isArray(placements) ? placements : []).forEach(entry => {
    const points = toNumber(entry?.points);
    if (!Number.isFinite(points)) return;
    const ranges = normalizePlacementRanges(entry?.place);
    if (!ranges.length) return;
    rules.push({ ranges, points });
  });

  return placement => {
    const placeNumber = toNumber(placement);
    if (!Number.isFinite(placeNumber)) return 0;
    for (const rule of rules) {
      if (rule.ranges.some(range => placeNumber >= range.min && placeNumber <= range.max)) {
        return rule.points;
      }
    }
    return 0;
  };
};

async function loadJSON(path) {
  const meta = window.__meta || {};
  const v = meta.version ? `?v=${encodeURIComponent(meta.version)}` : '';
  const r = await fetch(path + v);
  if (!r.ok) throw new Error('Failed to load ' + path + ` (status ${r.status})`);
  const contentType = r.headers.get('content-type') || '';
  const text = await r.text();
  if (!contentType.toLowerCase().includes('application/json')) {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 160);
    throw new Error(`Unexpected content-type for ${path}: ${contentType || 'unknown'}; starts with: ${preview}`);
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(`Invalid JSON in ${path}: ${err.message}`);
  }
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

    const [ tInfo, teamMeta ] = await Promise.all([
      loadJSON('data/tournament.json'),
      loadJSON('data/teams.json')
    ]);

    const killPoint = toNumber(tInfo?.scoring?.killPoints ?? 0) || 0;
    const resolvePlacementPoints = createPlacementResolver(tInfo?.scoring?.placements);
    const totalFromInfo = Number(tInfo?.matches?.total) || 0;

    const teamsById = new Map();
    (teamMeta || []).forEach(team => {
      if (!team || !Number.isFinite(toNumber(team.id))) return;
      const id = Number(team.id);
      teamsById.set(id, {
        ...team,
        id,
        displayName: `${team.name ?? 'Команда'} (№${fmtNumber(id)})`
      });
    });

    const matchPromises = [];
    const mapsList = Array.isArray(tInfo?.matches?.maps) ? tInfo.matches.maps : [];
    const plannedMatches = totalFromInfo || mapsList.length;
    const attempts = Math.max(plannedMatches, 1);
    for (let i = 1; i <= attempts; i += 1) {
      matchPromises.push(
        loadJSON(`data/match${i}.json`).then(data => ({ ...data, __index: i }))
          .catch(err => {
            console.warn(`Не удалось загрузить match${i}.json`, err);
            return null;
          })
      );
    }

    const rawMatches = (await Promise.all(matchPromises)).filter(Boolean);
    const matchCount = rawMatches.length;
    const maxSlotFromMatches = rawMatches.reduce((max, match) => {
      const idx = toNumber(match?.matchId);
      return Number.isFinite(idx) && idx > max ? idx : max;
    }, 0);

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
    $('#t-matches').textContent = fmtNumber(matchCount || tInfo?.matches?.total || 0);
    const maps = mapsList;
    $('#t-maps').innerHTML = maps.length ? maps.map(m => `<span class="pill">${m}</span>`).join('') : '<span class="pill">TBD</span>';
    const rules = tInfo?.rules || [];
    $('#t-rules').innerHTML = rules.length ? rules.map(r => `<div>${r}</div>`).join('') : '<div>Тай-брейк не задан</div>';

    const matchSlots = Math.max(matchCount, totalFromInfo, mapsList.length, maxSlotFromMatches);

    const ensureTeamStats = teamId => {
      const key = Number(teamId);
      if (!Number.isFinite(key)) return null;
      if (!teamsById.has(key)) {
        teamsById.set(key, {
          id: key,
          name: `Команда ${fmtNumber(key)}`,
          displayName: `Команда ${fmtNumber(key)} (№${fmtNumber(key)})`
        });
      }
      if (!ensureTeamStats.cache.has(key)) {
        ensureTeamStats.cache.set(key, {
          id: key,
          team: teamsById.get(key).displayName,
          points: 0,
          kills: 0,
          matches: 0,
          placementSum: 0,
          placementCount: 0,
          perMatchPoints: Array(matchSlots).fill(null),
          perMatchKills: Array(matchSlots).fill(null),
          perMatchPlacement: Array(matchSlots).fill(null)
        });
      }
      return ensureTeamStats.cache.get(key);
    };
    ensureTeamStats.cache = new Map();

    // Инициализируем статистику для всех команд из справочника,
    // чтобы в таблице отображались даже те, у кого пока нет матчей.
    teamsById.forEach(team => {
      ensureTeamStats(team.id);
    });

    const playerStats = new Map();

    const normalizeMatchIndex = (match, idx) => {
      const rawIndex = toNumber(match?.matchId);
      if (Number.isFinite(rawIndex) && rawIndex > 0) return rawIndex - 1;
      return idx;
    };

    const matches = rawMatches.map((match, idx) => {
      const slot = normalizeMatchIndex(match, idx);
      const matchTeams = Array.isArray(match?.teams) ? match.teams : [];
      matchTeams.forEach(teamEntry => {
        const stats = ensureTeamStats(teamEntry?.teamId);
        if (!stats) return;
        const killsRaw = toNumber(teamEntry.kills);
        const placementRaw = toNumber(teamEntry.placement);
        const totalPointsRaw = toNumber(teamEntry.totalPoints);
        const killsValue = Number.isFinite(killsRaw) ? killsRaw : 0;
        const placement = Number.isFinite(placementRaw) ? placementRaw : null;
        const placementPointsValue = placement != null ? resolvePlacementPoints(placement) : 0;
        const computedPoints = Number.isFinite(totalPointsRaw)
          ? totalPointsRaw
          : placementPointsValue + killsValue * killPoint;

        stats.points += computedPoints;
        stats.kills += killsValue;
        stats.matches += 1;
        if (placement != null) {
          stats.placementSum += placement;
          stats.placementCount += 1;
        }
        if (slot < stats.perMatchPoints.length) {
          stats.perMatchPoints[slot] = computedPoints;
          stats.perMatchKills[slot] = killsValue;
          stats.perMatchPlacement[slot] = placement;
        }
      });

      const playerEntries = Array.isArray(match?.players) ? match.players : [];
      playerEntries.forEach(player => {
        const name = player?.nickname || player?.player || player?.name;
        if (!name) return;
        const teamId = toNumber(player.teamId);
        let stat = playerStats.get(name);
        if (!stat) {
          stat = {
            player: name,
            teamId: Number.isFinite(teamId) ? Number(teamId) : null,
            matches: 0,
            adrTotal: 0,
            adrSamples: 0,
            kills: 0,
            assists: 0,
            revives: 0
          };
          playerStats.set(name, stat);
        }
        if (Number.isFinite(teamId)) stat.teamId = Number(teamId);
        stat.matches += 1;
        const adr = toNumber(player.adr);
        if (Number.isFinite(adr)) {
          stat.adrTotal += adr;
          stat.adrSamples += 1;
        }
        const kills = toNumber(player.kills);
        if (Number.isFinite(kills)) stat.kills += kills;
        const assists = toNumber(player.assists);
        if (Number.isFinite(assists)) stat.assists += assists;
        const revives = toNumber(player.revives);
        if (Number.isFinite(revives)) stat.revives += revives;
      });

      return { ...match, slot };
    });

    const teamRows = Array.from(ensureTeamStats.cache.values()).map(stats => {
      const avg = stats.placementCount ? stats.placementSum / stats.placementCount : null;
      return {
        id: stats.id,
        team: teamsById.get(stats.id)?.displayName || `Команда ${fmtNumber(stats.id)}`,
        points: stats.points,
        kills: stats.kills,
        matches: stats.matches,
        placeAvg: avg,
        perMatchPoints: stats.perMatchPoints.slice(),
        perMatchKills: stats.perMatchKills.slice(),
        perMatchPlacement: stats.perMatchPlacement.slice()
      };
    });

    teamRows.sort((a, b) => {
      const diffPoints = (b.points ?? 0) - (a.points ?? 0);
      if (diffPoints !== 0) return diffPoints;
      const diffKills = (b.kills ?? 0) - (a.kills ?? 0);
      if (diffKills !== 0) return diffKills;
      const avgA = Number.isFinite(a.placeAvg) ? a.placeAvg : Infinity;
      const avgB = Number.isFinite(b.placeAvg) ? b.placeAvg : Infinity;
      if (avgA !== avgB) return avgA - avgB;
      return (a.id ?? 0) - (b.id ?? 0);
    });
    teamRows.forEach((row, idx) => { row.place = idx + 1; });

    const playerRows = Array.from(playerStats.values()).map(stat => {
      const teamInfo = stat.teamId != null ? teamsById.get(stat.teamId) : null;
      const avgAdr = stat.adrSamples ? stat.adrTotal / stat.adrSamples : null;
      return {
        player: stat.player,
        team: teamInfo ? teamInfo.displayName : 'Без команды',
        adr: avgAdr,
        kills: stat.kills,
        assists: stat.assists,
        revives: stat.revives,
        matches: stat.matches
      };
    });

    playerRows.sort((a, b) => {
      const adrA = Number.isFinite(a.adr) ? a.adr : -Infinity;
      const adrB = Number.isFinite(b.adr) ? b.adr : -Infinity;
      return adrB - adrA;
    });

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
        const k = t.perMatchKills?.[i];
        const pl = t.perMatchPlacement?.[i];
        const ptsLabel = Number.isFinite(pts) ? `+${fmtNumber(pts)}` : '—';
        const killsLabel = Number.isFinite(k) ? `${fmtNumber(k)}K` : '—';
        const placeLabel = Number.isFinite(pl) ? `Pl ${fmtNumber(pl)}` : 'Pl —';
        return `<span class="chip">M${i+1}: ${ptsLabel} • ${killsLabel} • ${placeLabel}</span>`;
      }).join('');
      return `<div class="teamcard">
        <div class="teamcard-title">${t.team}</div>
        <div class="teamcard-line">${chips}</div>
      </div>`;
    }).join('');

    const matchesEl = $('#matchesList');
    if (matchesEl) {
      const maps = tInfo?.matches?.maps || [];
      if (!matches.length) {
        matchesEl.innerHTML = '<div class="match-empty">Нет данных о матчах.</div>';
      } else {
        const matchCards = matches.map(match => {
          const entries = (Array.isArray(match.teams) ? match.teams : []).map(teamEntry => {
            const teamInfo = teamsById.get(toNumber(teamEntry.teamId));
            const teamName = teamInfo ? teamInfo.displayName : `Команда ${fmtNumber(teamEntry.teamId ?? '?')}`;
            const killsRaw = toNumber(teamEntry.kills);
            const kills = Number.isFinite(killsRaw) ? killsRaw : 0;
            const placementRaw = toNumber(teamEntry.placement);
            const placement = Number.isFinite(placementRaw) ? placementRaw : null;
            const placementPoints = placement != null ? resolvePlacementPoints(placement) : 0;
            const totalPointsRaw = toNumber(teamEntry.totalPoints);
            const points = Number.isFinite(totalPointsRaw) ? Number(totalPointsRaw) : placementPoints + kills * killPoint;
            return { teamName, kills, placement, points };
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
            if (!Number.isFinite(curr.placement)) return best;
            if (!best) return curr;
            if ((curr.placement ?? Infinity) < (best.placement ?? Infinity)) return curr;
            if ((curr.placement ?? Infinity) === (best.placement ?? Infinity) && (curr.points ?? 0) > (best.points ?? 0)) return curr;
            return best;
          }, null);

          const rowsHtml = entries.map((entry, idx) => {
            const pointsText = `+${fmtNumber(entry.points ?? 0)} оч.`;
            const killsText = `${fmtNumber(entry.kills ?? 0)}K`;
            const placeText = Number.isFinite(entry.placement) ? `Pl ${fmtNumber(entry.placement)}` : 'Pl —';
            return `<div class="match-row ${idx === 0 ? 'is-first' : ''}">
              <span class="rank">#${idx + 1}</span>
              <span class="team-name">${entry.teamName}</span>
              <span class="stat">${pointsText}</span>
              <span class="placement">${killsText} • ${placeText}</span>
            </div>`;
          }).join('');

          const metaLines = [];
          const leader = entries[0];
          if (leader) {
            const leaderPoints = `+${fmtNumber(leader.points ?? 0)} оч.`;
            const leaderKills = `${fmtNumber(leader.kills ?? 0)}K`;
            const leaderPlace = Number.isFinite(leader.placement) ? fmtNumber(leader.placement) : '—';
            metaLines.push(`Лидер: <strong>${leader.teamName}</strong> (${leaderPoints}, ${leaderKills}, место ${leaderPlace})`);
          }
          if (topKills && topKills !== leader) {
            metaLines.push(`Больше всего киллов: <strong>${topKills.teamName}</strong> (${fmtNumber(topKills.kills ?? 0)}K)`);
          }
          if (bestPlacement && bestPlacement !== leader) {
            const bestPlace = Number.isFinite(bestPlacement.placement) ? fmtNumber(bestPlacement.placement) : '—';
            metaLines.push(`Лучший плейсмент: <strong>${bestPlacement.teamName}</strong> (место ${bestPlace})`);
          }

          const metaHtml = metaLines.length ? metaLines.map(line => `<div>${line}</div>`).join('') : '<div>Нет дополнительной статистики.</div>';
          const mapLabel = match.map ?? maps[match.slot] ?? maps[match.__index ? match.__index - 1 : 0];
          const matchTitleNumber = Number.isFinite(toNumber(match.matchId)) ? toNumber(match.matchId) : (match.slot ?? 0) + 1;

          return `
            <div class="match-card">
              <div class="match-card-header">
                <div class="match-title">Матч ${fmtNumber(matchTitleNumber)}</div>
                ${mapLabel ? `<div class="match-map">${mapLabel}</div>` : ''}
              </div>
              <div class="match-meta">${metaHtml}</div>
              ${rowsHtml ? `<div class="match-rows">${rowsHtml}</div>` : '<div class="match-empty">Нет данных по этому матчу.</div>'}
            </div>
          `;
        });

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