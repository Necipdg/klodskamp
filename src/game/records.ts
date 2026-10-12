// Rekordlisten i Kæmpejagt: de 5 bedste resultater pr. bane og sværhedsgrad, gemt i browseren.
// Alt pakket i try/catch – spillet virker også uden lagring (så gælder listen kun, til siden lukkes).

export interface HuntRecord {
  score: number;
  won: boolean;
  wave: number;
  waves: number;
  time: number;
  kills: number;
  /** ÅÅÅÅ-MM-DD */
  date: string;
}

const KEY = 'klodskamp.rekorder';
const MAX = 5;
let memory: Record<string, HuntRecord[]> | null = null;

function load(): Record<string, HuntRecord[]> {
  if (memory) return memory;
  try { memory = JSON.parse(localStorage.getItem(KEY) || '{}') ?? {}; } catch { memory = {}; }
  return memory!;
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(memory)); } catch { /* ingen lagring */ } }

export function getRecords(map: string, diff: string): HuntRecord[] {
  return (load()[`${map}:${diff}`] ?? []).slice();
}

/** Tilføj et resultat. Returnerer pladsen på listen (0 = ny rekord) eller -1, hvis det ikke kom med. */
export function addRecord(map: string, diff: string, r: HuntRecord): number {
  const all = load();
  const k = `${map}:${diff}`;
  const list = (all[k] ?? []).slice();
  list.push(r);
  list.sort((a, b) => b.score - a.score || a.time - b.time);
  const rank = list.indexOf(r);
  all[k] = list.slice(0, MAX);
  save();
  return rank < MAX ? rank : -1;
}

export const today = () => new Date().toISOString().slice(0, 10);
