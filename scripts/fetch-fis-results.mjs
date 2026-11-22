// Holt die offiziellen Resultate der Ski-WM von fis-ski.com und schreibt sie in die Firebase-Datenbank.
// Läuft per GitHub Actions (siehe .github/workflows/fis-results.yml). Mit DRY_RUN=1 wird nur ausgegeben.
import { JSDOM } from 'jsdom';
import admin from 'firebase-admin';
import { parseEvent, parseResults } from './fis-parse.mjs';

const BASE = 'https://www.fis-ski.com';
const EVENT_ID = process.env.FIS_EVENT_ID || '62998';   // Crans-Montana 2027
const SEASON = process.env.FIS_SEASON || '2027';
const DRY = process.env.DRY_RUN === '1';
const UA = 'Tippspiel-SkiWM/1.0 (privates Tippspiel, nicht kommerziell, ca. alle 10 Minuten)';
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getDoc(url) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
  return new JSDOM(await r.text()).window.document;
}

const eventDoc = await getDoc(`${BASE}/DB/general/event-details.html?sectorcode=AL&eventid=${EVENT_ID}&seasoncode=${SEASON}`);
const races = parseEvent(eventDoc).filter(r => r.category === 'WSC' && r.tipId && !r.cancelled);
console.log(`${races.length} WM-Rennen gefunden, offiziell: ${races.filter(r => r.official).length}`);
if (races.length < 11) console.warn('Warnung: weniger als 11 WM-Rennen auf der FIS-Seite.');

const results = {};
for (const r of races) {
  if (!r.official) continue;
  await sleep(1000);
  const rows = parseResults(await getDoc(`${BASE}/DB/general/results.html?sectorcode=AL&raceid=${r.raceId}`), r.discipline);
  if (rows.length < 3) { console.warn(`${r.tipId}: nur ${rows.length} Podestplätze gelesen, übersprungen`); continue; }
  results[r.tipId] = { fisRaceId: r.raceId, official: true, rows };
  console.log(`${r.tipId}: ${rows.map(x => `${x.rank}. ${x.name} (${x.nat})`).join(', ')}`);
}

const medals = {};
for (const x of Object.values(results)) for (const row of x.rows) if (row.nat) medals[row.nat] = (medals[row.nat] || 0) + 1;
const complete = races.length >= 11 && races.every(r => results[r.tipId]);
console.log('Medaillen:', JSON.stringify(medals), complete ? '(alle Rennen fertig)' : '(noch nicht alle Rennen fertig)');

if (DRY) { console.log('DRY_RUN: nichts geschrieben.'); process.exit(0); }

admin.initializeApp({
  credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
  databaseURL: process.env.FIREBASE_DATABASE_URL
});
const db = admin.database();
for (const [id, x] of Object.entries(results)) {
  const old = (await db.ref('results/' + id).once('value')).val();
  if (old && JSON.stringify(old.rows) === JSON.stringify(x.rows) && old.fisRaceId === x.fisRaceId) continue;
  await db.ref('results/' + id).set({ ...x, updated: admin.database.ServerValue.TIMESTAMP });
  console.log('geschrieben:', id);
}
await db.ref('meta').set({ medals, complete, checked: admin.database.ServerValue.TIMESTAMP, source: 'fis-ski.com' });
await admin.app().delete();
