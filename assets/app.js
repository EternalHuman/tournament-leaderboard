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
const pluralizeRu = (value, forms) => {
  if (!Array.isArray(forms) || forms.length < 3) return '';
  const [one, few, many] = forms;
  const num = Math.abs(Math.trunc(Number.isFinite(value) ? value : 0));
  const mod10 = num % 10;
  const mod100 = num % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
};
const $ = sel => document.querySelector(sel);

const computeImpact = ({ kills = 0, assists = 0, revives = 0, dbnos = 0, timeSurvived = 0, adr = 0 }) => {
  const safe = value => (Number.isFinite(value) ? value : 0);
  const killsScore = safe(kills) * 5;
  const assistsScore = safe(assists) * 2;
  const revivesScore = safe(revives) * 1.5;
  const adrScore = safe(adr) * 0.02;
  const timeScore = safe(timeSurvived) / 120;
  const dbnoPenalty = safe(dbnos) * 0.7;
  const impact = killsScore + assistsScore + revivesScore + adrScore + timeScore - dbnoPenalty;
  return impact;
};

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
  const r = await fetch(path + v, { cache: 'no-store' });
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

function setActiveTab(id, options) {
  const opts = options || {};
  const currentActive = document.querySelector('[data-tab].active');
  const alreadyActive = currentActive ? currentActive.dataset.tab === id : false;

  document.querySelectorAll('[data-tab]').forEach(el => {
    el.classList.toggle('active', el.dataset.tab === id);
  });
  document.querySelectorAll('[data-panel]').forEach(el => {
    el.style.display = (el.dataset.panel === id) ? 'block' : 'none';
  });
  location.hash = id;

  if (!alreadyActive && opts.scroll !== false) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
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

    const statusEls = {
      card: $('#statusCard'),
      state: $('#statusState'),
      message: $('#statusMessage'),
      countdown: $('#statusCountdown'),
      podium: $('#statusPodium')
    };
    const startTimeRaw = tInfo?.startTime;
    const startDate = startTimeRaw ? new Date(startTimeRaw) : null;
    const hasValidStart = startDate instanceof Date && !Number.isNaN(startDate.getTime());
    let countdownTimer = null;

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
    const expectedMatchesCount = totalFromInfo > 0 ? totalFromInfo : (mapsList.length > 0 ? mapsList.length : null);
    const plannedMatches = expectedMatchesCount ?? mapsList.length;
    const attempts = Math.max(plannedMatches || 0, 1);
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
    const plannedTotal = expectedMatchesCount ?? Math.max(matchCount, mapsList.length);
    const matchesSummary = `Сыграно ${fmtNumber(matchCount)} из ${fmtNumber(plannedTotal)} матчей`;
    $('#t-matches').textContent = matchesSummary;
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
            revives: 0,
            dbnos: 0,
            timeSurvived: 0
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
        const dbnos = toNumber(player.DBNOs ?? player.dbnos);
        if (Number.isFinite(dbnos)) stat.dbnos += dbnos;
        const timeSurvived = toNumber(player.timeSurvived);
        if (Number.isFinite(timeSurvived)) stat.timeSurvived += timeSurvived;
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
      const avgA = Number.isFinite(a.placeAvg) ? a.placeAvg : Infinity;
      const avgB = Number.isFinite(b.placeAvg) ? b.placeAvg : Infinity;
      if (avgA !== avgB) return avgA - avgB;
      const diffKills = (b.kills ?? 0) - (a.kills ?? 0);
      if (diffKills !== 0) return diffKills;
      return (a.id ?? 0) - (b.id ?? 0);
    });
    teamRows.forEach((row, idx) => { row.place = idx + 1; });

    const renderCountdown = remainingMs => {
      if (!statusEls?.countdown) return;
      const totalSeconds = Math.max(Math.floor(remainingMs / 1000), 0);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      const segments = [
        { value: days, forms: ['день', 'дня', 'дней'], pad: days < 100 ? 2 : String(days).length },
        { value: hours, forms: ['час', 'часа', 'часов'], pad: 2 },
        { value: minutes, forms: ['минута', 'минуты', 'минут'], pad: 2 },
        { value: seconds, forms: ['секунда', 'секунды', 'секунд'], pad: 2 }
      ];
      statusEls.countdown.innerHTML = segments.map(segment => {
        const label = pluralizeRu(segment.value, segment.forms);
        const value = segment.pad ? String(segment.value).padStart(segment.pad, '0') : String(segment.value);
        return `
          <div class="status-countdown__item">
            <span class="status-countdown__value">${value}</span>
            <span class="status-countdown__label">${label}</span>
          </div>
        `;
      }).join('');
    };

    const renderPodium = winners => {
      if (!statusEls?.podium) return;
      const slots = [
        { place: 2, modifier: 'second', data: winners[1] },
        { place: 1, modifier: 'first', data: winners[0] },
        { place: 3, modifier: 'third', data: winners[2] }
      ].filter(slot => slot.data);
      if (!slots.length) {
        statusEls.podium.innerHTML = '';
        statusEls.podium.hidden = true;
        return;
      }
      statusEls.podium.innerHTML = slots.map(slot => {
        const row = slot.data;
        const teamInfo = teamsById.get(row.id);
        const teamName = teamInfo?.name || teamInfo?.displayName || row.team || `Команда ${fmtNumber(row.id)}`;
        const pointsValue = Number.isFinite(toNumber(row.points)) ? fmtNumber(toNumber(row.points)) : null;
        const pointsText = pointsValue != null ? `${pointsValue} очков` : '';
        return `
          <div class="status-podium__slot status-podium__slot--${slot.modifier}">
            <div class="status-podium__block">
              <div class="status-podium__place">${slot.place}</div>
              <div class="status-podium__team">${teamName}</div>
              ${pointsText ? `<div class="status-podium__points">${pointsText}</div>` : ''}
            </div>
          </div>
        `;
      }).join('');
      statusEls.podium.hidden = false;
    };

    const updateStatusCard = () => {
      if (!statusEls?.card) return;
      const now = new Date();
      const beforeStart = hasValidStart && now < startDate;
      const winners = teamRows.filter(row => (row.matches ?? 0) > 0 || (row.points ?? 0) !== 0).slice(0, 3);
      const hasResults = matchCount > 0 && winners.length > 0;
      const allMatchesPlayed = (expectedMatchesCount != null && expectedMatchesCount > 0)
        ? matchCount >= expectedMatchesCount
        : false;

      if (beforeStart) {
        statusEls.state && (statusEls.state.textContent = 'Турнир ещё не начался');
        statusEls.message && (statusEls.message.textContent = 'До начала турнира осталось:');
        if (statusEls.countdown) {
          statusEls.countdown.hidden = false;
          renderCountdown(startDate.getTime() - now.getTime());
        }
        if (statusEls.podium) {
          statusEls.podium.hidden = true;
          statusEls.podium.innerHTML = '';
        }
        return;
      }

      if (statusEls.countdown) {
        statusEls.countdown.hidden = true;
        statusEls.countdown.innerHTML = '';
      }

      if (allMatchesPlayed && hasResults) {
        statusEls.state && (statusEls.state.textContent = 'Турнир завершён');
        statusEls.message && (statusEls.message.textContent = winners.length >= 3
          ? 'Поздравляем призёров турнира:'
          : 'Итоги турнира: призовые места');
        renderPodium(winners);
        return;
      }

      if ((hasValidStart && now >= startDate) || hasResults) {
        statusEls.state && (statusEls.state.textContent = 'Турнир в процессе');
        statusEls.message && (statusEls.message.textContent = 'Турнир начался, ожидание результатов...');
        if (statusEls.podium) {
          statusEls.podium.hidden = true;
          statusEls.podium.innerHTML = '';
        }
        return;
      }

      statusEls.state && (statusEls.state.textContent = 'Статус турнира');
      statusEls.message && (statusEls.message.textContent = 'Информация будет обновлена по мере появления данных.');
      if (statusEls.podium) {
        statusEls.podium.hidden = true;
        statusEls.podium.innerHTML = '';
      }
    };

    updateStatusCard();
    if (hasValidStart && statusEls?.card) {
      const tick = () => {
        updateStatusCard();
        if (new Date() >= startDate && countdownTimer) {
          clearInterval(countdownTimer);
          countdownTimer = null;
        }
      };
      if (new Date() < startDate) {
        countdownTimer = setInterval(tick, 1000);
      }
    }

    const playerRows = Array.from(playerStats.values()).map(stat => {
      const teamInfo = stat.teamId != null ? teamsById.get(stat.teamId) : null;
      const avgAdr = stat.adrSamples ? stat.adrTotal / stat.adrSamples : null;
      const impact = computeImpact({
        kills: stat.kills,
        assists: stat.assists,
        revives: stat.revives,
        dbnos: stat.dbnos,
        timeSurvived: stat.timeSurvived,
        adr: avgAdr
      });
      return {
        player: stat.player,
        team: teamInfo ? teamInfo.displayName : 'Без команды',
        impact,
        adr: avgAdr,
        kills: stat.kills,
        assists: stat.assists,
        revives: stat.revives,
        dbnos: stat.dbnos,
        timeSurvived: stat.timeSurvived,
        matches: stat.matches
      };
    });

    playerRows.sort((a, b) => {
      const impactDiff = (b.impact ?? -Infinity) - (a.impact ?? -Infinity);
      if (impactDiff !== 0) return impactDiff;
      const killsDiff = (b.kills ?? 0) - (a.kills ?? 0);
      if (killsDiff !== 0) return killsDiff;
      const adrA = Number.isFinite(a.adr) ? a.adr : -Infinity;
      const adrB = Number.isFinite(b.adr) ? b.adr : -Infinity;
      if (adrB !== adrA) return adrB - adrA;
      return String(a.player ?? '').localeCompare(String(b.player ?? ''), 'ru', { sensitivity: 'base' });
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
    sortable($('#teamsTable'), teamRows, teamCols, $('#teamCount'), $('#teamFilter'), {key:'place', dir:'asc'});

    const infoIcons = Array.from(document.querySelectorAll('.info-icon'));
    if (infoIcons.length) {
      const tooltip = document.createElement('div');
      tooltip.className = 'info-tooltip';
      tooltip.setAttribute('role', 'tooltip');
      tooltip.style.display = 'none';
      document.body.appendChild(tooltip);

      let activeIcon = null;

      const hideTooltip = () => {
        if (!activeIcon) return;
        activeIcon.setAttribute('aria-expanded', 'false');
        activeIcon = null;
        tooltip.classList.remove('info-tooltip--visible');
        tooltip.style.display = 'none';
        tooltip.textContent = '';
      };

      const positionTooltip = icon => {
        const rect = icon.getBoundingClientRect();
        const tooltipRect = tooltip.getBoundingClientRect();
        const viewportWidth = document.documentElement.clientWidth;
        const scrollX = window.pageXOffset || document.documentElement.scrollLeft || 0;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
        let left = rect.left + scrollX + rect.width / 2 - tooltipRect.width / 2;
        const minLeft = scrollX + 8;
        const maxLeft = scrollX + viewportWidth - tooltipRect.width - 8;
        if (left < minLeft) left = minLeft;
        if (left > maxLeft) left = Math.max(minLeft, maxLeft);
        const top = rect.bottom + scrollY + 10;
        tooltip.style.left = `${Math.round(left)}px`;
        tooltip.style.top = `${Math.round(top)}px`;
      };

      const showTooltip = icon => {
        const text = icon.dataset.tooltip || icon.getAttribute('title') || icon.getAttribute('aria-label');
        if (!text) return;
        if (activeIcon === icon) {
          hideTooltip();
          return;
        }
        if (activeIcon) {
          activeIcon.setAttribute('aria-expanded', 'false');
        }
        activeIcon = icon;
        tooltip.textContent = text;
        tooltip.style.display = 'block';
        tooltip.classList.remove('info-tooltip--visible');
        requestAnimationFrame(() => {
          positionTooltip(icon);
          tooltip.classList.add('info-tooltip--visible');
          icon.setAttribute('aria-expanded', 'true');
        });
      };

      infoIcons.forEach(icon => {
        if (!icon.dataset.tooltip && icon.getAttribute('title')) {
          icon.dataset.tooltip = icon.getAttribute('title');
        }
        icon.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          showTooltip(icon);
        });
        icon.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            showTooltip(icon);
          }
        });
        icon.addEventListener('blur', () => {
          setTimeout(() => {
            if (activeIcon === icon && document.activeElement !== icon) {
              hideTooltip();
            }
          }, 10);
        });
      });

      document.addEventListener('click', e => {
        if (!activeIcon) return;
        if (!tooltip.contains(e.target) && e.target !== activeIcon) {
          hideTooltip();
        }
      });

      document.addEventListener('keydown', e => {
        if (!activeIcon) return;
        if (e.key === 'Escape' || e.key === 'Esc') {
          hideTooltip();
        }
      });

      window.addEventListener('scroll', () => {
        if (!activeIcon) return;
        hideTooltip();
      }, true);

      window.addEventListener('resize', () => {
        if (!activeIcon) return;
        tooltip.classList.remove('info-tooltip--visible');
        requestAnimationFrame(() => {
          if (!activeIcon) return;
          positionTooltip(activeIcon);
          tooltip.classList.add('info-tooltip--visible');
        });
      });
    }

    // Players
    const playerCols = [
      { key:'impact',  title:'Импакт', num:true, format:'float' },
      { key:'player',  title:'Игрок' },
      { key:'team',    title:'Команда' },
      { key:'kills',   title:'Убийства', num:true, format:'int' },
      { key:'adr',     title:'ADR', num:true, format:'float' },
      { key:'assists', title:'Помощь', num:true, format:'int' },
      { key:'revives', title:'Ревайвы', num:true, format:'int' },
      { key:'dbnos',   title:'DBNOs', num:true, format:'int' },
      { key:'timeSurvived', title:'Время (с)', num:true, format:'int' },
      { key:'matches', title:'Матчи', num:true, format:'int' },
    ];
    sortable($('#playersTable'), playerRows, playerCols, $('#playerCount'), $('#playerFilter'), {key:'impact', dir:'desc'});

    // tabs
    document.querySelectorAll('[data-tab]').forEach(tab => {
      tab.addEventListener('click', () => setActiveTab(tab.dataset.tab, { scroll: true }));
    });
    const initial = location.hash?.replace('#','') || 'overview';
    setActiveTab(initial, { scroll: false });

  } catch (e) {
    console.error(e);
    alert('Ошибка загрузки данных: ' + e.message);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();