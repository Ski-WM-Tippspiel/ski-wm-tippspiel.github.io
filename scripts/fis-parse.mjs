// Liest die öffentlichen FIS-Seiten (fis-ski.com/DB/...) aus. Reine Funktionen auf einem DOM-Dokument,
// damit sie in Node (jsdom) und im Browser gleich laufen.

// FIS-Disziplin + Geschlecht -> Rennen-ID im Tippspiel (A = gemischt)
export const RACE_MAP = {
  'Team Parallel|A': 'tp',
  'Super G|W': 'sgd', 'Super G|M': 'sgh',
  'Downhill|W': 'abd', 'Downhill|M': 'abh',
  'Team Combined|W': 'kd', 'Team Combined|M': 'kh',
  'Giant Slalom|W': 'rd', 'Giant Slalom|M': 'rh',
  'Slalom|W': 'sd', 'Slalom|M': 'sh'
};
const TEAM = new Set(['Team Parallel', 'Team Combined']);
const txt = e => (e.textContent || '').replace(/\s+/g, ' ').trim();
const leaf = r => [...r.querySelectorAll('div,a,span')].filter(e => !e.querySelector('div,a,span')).map(txt);

/** Rennliste eines FIS-Events (event-details.html). */
export function parseEvent(doc) {
  const seen = new Set(), out = [];
  for (const row of doc.querySelectorAll('.table-row')) {
    const a = row.querySelector('a[href*="raceid="]');
    if (!a) continue;
    const m = /raceid=(\d+)/.exec(a.getAttribute('href') || '');
    if (!m || seen.has(m[1])) continue;
    seen.add(m[1]);
    const t = txt(row);
    const d = /\b\d{4}\s+(Team Parallel|Super G|Downhill Training|Downhill|Team Combined|Giant Slalom Qualification|Giant Slalom|Slalom Qualification|Slalom)\b/.exec(t);
    const c = /\b(WSC|TRA|FQUA)\s+([WMA])\b/.exec(t);
    if (!d || !c) continue;
    const dateEl = row.querySelector('.timezone-date');
    const runs = (t.match(/\b(?:1st|2nd)\s+\d{1,2}:\d{2}/g) || []).length || 1;
    const official = (t.match(/Official results/g) || []).length;
    out.push({
      raceId: m[1], discipline: d[1], category: c[1], gender: c[2],
      date: dateEl ? dateEl.getAttribute('data-date') : null,
      time: dateEl ? dateEl.getAttribute('data-time') : null,
      official: official >= runs, cancelled: /Cancelled/.test(t),
      tipId: RACE_MAP[d[1] + '|' + c[2]] || null
    });
  }
  return out;
}

const cap = w => w.toLowerCase().replace(/(^|[-'])([a-zà-ÿ])/g, (m, p, l) => p + l.toUpperCase());
/** "GUT-BEHRAMI Lara" -> "Lara Gut-Behrami" */
export function formatName(s) {
  const tok = s.split(' ').filter(Boolean);
  const isUp = w => /[A-ZÀ-Þ]/.test(w) && w === w.toUpperCase();
  let i = 0;
  while (i < tok.length && isUp(tok[i])) i++;
  if (i === 0 || i === tok.length) return tok.map(cap).join(' ');
  return tok.slice(i).join(' ') + ' ' + tok.slice(0, i).map(cap).join(' ');
}

/** Podestplätze (Rang 1-3, bei Gleichstand auch mehr) einer Ergebnisseite (results.html). */
export function parseResults(doc, discipline) {
  const team = TEAM.has(discipline), rows = [];
  for (const r of doc.querySelectorAll('.table-row')) {
    if (!r.querySelector('.g-row')) continue;
    const c = leaf(r);
    if (!/^\d+$/.test(c[0] || '') || !/^\d{4,8}$/.test(c[2] || '')) continue; // Rang und FIS-/Nationencode nötig
    const rank = Number(c[0]);
    if (rank > 3) continue;
    const hasYear = /^\d{4}$/.test(c[4] || '');
    if (team === hasYear) continue; // Einzelrennen: Athlet mit Jahrgang; Teamrennen: Nation ohne Jahrgang
    const nat = c.slice(4).find(x => /^[A-Z]{3}$/.test(x)) || '';
    const name = team ? cap(c[3].replace(/\s+\d+$/, '')) : formatName(c[3]);
    rows.push({ rank, name, nat });
  }
  rows.sort((a, b) => a.rank - b.rank);
  return rows;
}
