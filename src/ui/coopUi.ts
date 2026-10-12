// Co-op-skærmene: opret et rum, del linket (WhatsApp m.m.), lobbyen og "Du er inviteret".
import type { Difficulty } from '../config/tuning';
import type { HuntMapId } from '../hunt/city';
import { HUNT_MAPS } from '../hunt/maps';
import { HUNT_DIFF } from '../hunt/progress';
import { MAX_PLAYERS, inviteLink, type CoopSession } from '../net/coop';
import { MATE_COLOR } from './huntUi';

export interface CoopCallbacks {
  create(name: string, map: HuntMapId, diff: Difficulty): void;
  join(code: string, name: string): void;
  start(): void;
  /** Luk rummet/forlad det og gå til hovedmenuen */
  leave(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = '') => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
};
const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const cleanName = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 16);

export class CoopUI {
  private root = el('div', 'overlay hidden');
  private players: HTMLElement | null = null;
  private status: HTMLElement | null = null;

  constructor(private cb: CoopCallbacks) {
    this.root.id = 'coop';
    document.getElementById('ui')!.append(this.root);
  }

  get open() { return !this.root.classList.contains('hidden'); }
  hide() { this.root.classList.add('hidden'); this.root.innerHTML = ''; this.players = null; this.status = null; }

  private card() {
    this.root.innerHTML = '';
    const c = el('div', 'card interactive');
    this.root.append(c);
    this.root.classList.remove('hidden');
    return c;
  }

  private nameInput(name: string) {
    const i = el('input', 'name') as HTMLInputElement;
    i.type = 'text';
    i.maxLength = 16;
    i.placeholder = 'Dit navn';
    i.value = name;
    i.setAttribute('autocomplete', 'nickname');
    i.enterKeyHint = 'go';
    return i;
  }

  /** Trin 1 for værten: navn, bane og sværhed */
  showHost(name: string, map: HuntMapId, diff: Difficulty) {
    const c = this.card();
    c.append(el('div', 'label', 'Kæmpejagt · spil sammen'), el('h2', 'heading', 'Spil sammen'));
    c.append(el('div', 'sub', 'Opret et rum og send linket til familien, fx på WhatsApp. I er på samme hold mod kæmperne – op til 4 spillere. Alle skal være på nettet.'));
    c.append(el('div', 'label', 'Dit navn'));
    const inp = this.nameInput(name);
    c.append(inp);
    c.append(el('div', 'label', 'Bane'));
    const mseg = el('div', 'seg');
    for (const m of HUNT_MAPS) {
      const b = el('button', m.id === map ? 'on' : '', m.name);
      b.dataset.map = m.id;
      b.onclick = () => { map = m.id; mseg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
      mseg.append(b);
    }
    c.append(mseg);
    c.append(el('div', 'label', 'Sværhed'));
    const dseg = el('div', 'seg');
    for (const k of ['let', 'normal', 'svaer'] as Difficulty[]) {
      const b = el('button', k === diff ? 'on' : '', HUNT_DIFF[k].name);
      b.dataset.diff = k;
      b.onclick = () => { diff = k; dseg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); };
      dseg.append(b);
    }
    c.append(dseg);
    const err = el('div', 'err');
    c.append(err);
    const btns = el('div', 'btns');
    const go = el('button', 'btn primary', 'Opret rum');
    go.dataset.act = 'create';
    const back = el('button', 'btn', 'Tilbage');
    const create = () => {
      const n = cleanName(inp.value);
      if (!n) { err.textContent = 'Skriv dit navn, så de andre kan se hvem du er'; inp.focus(); return; }
      this.cb.create(n, map, diff);
    };
    go.onclick = create;
    inp.onkeydown = (e) => { if (e.key === 'Enter') create(); e.stopPropagation(); };
    back.onclick = () => this.cb.leave();
    btns.append(go, back);
    c.append(btns);
  }

  /** "Opretter rum …" / "Forbinder …" */
  showBusy(text: string) {
    const c = this.card();
    c.append(el('h2', 'heading', 'Et øjeblik …'), el('div', 'wait', esc(text)));
    const b = el('button', 'btn', 'Annullér');
    b.onclick = () => this.cb.leave();
    c.append(b);
  }

  /** Fejl – evt. med "Prøv igen" (fx når forbindelsen til værten ikke kunne oprettes) */
  showError(text: string, retry: (() => void) | null = null) {
    const c = this.card();
    c.append(el('div', 'label', 'Spil sammen'), el('h2', 'heading', 'Det gik ikke'), el('div', 'err', esc(text)));
    const btns = el('div', 'btns');
    if (retry) {
      const r = el('button', 'btn primary', 'Prøv igen');
      r.dataset.act = 'retry';
      r.onclick = retry;
      btns.append(r);
    }
    const b = el('button', `btn${retry ? '' : ' primary'}`, retry ? 'Til menuen' : 'OK');
    b.onclick = () => this.cb.leave();
    btns.append(b);
    c.append(btns);
  }

  /** Værtens lobby: koden, linket og hvem der er kommet */
  showHostLobby(s: CoopSession) {
    const c = this.card();
    const mapName = HUNT_MAPS.find((m) => m.id === s.config.map)?.name ?? s.config.map;
    const diffName = HUNT_DIFF[s.config.diff as Difficulty]?.name ?? s.config.diff;
    c.append(el('div', 'label', `Kæmpejagt · ${esc(mapName)} · ${esc(diffName)}`), el('h2', 'heading', 'Rummet er klar'));
    c.append(el('div', 'sub', 'Send linket til dem der skal være med. Når de har åbnet det og skrevet deres navn, dukker de op herunder.'));
    const link = inviteLink(s.code);
    c.append(el('div', 'code', s.code));
    const lk = el('div', 'link', esc(link));
    c.append(lk);
    const text = `Kom og jagt kæmper med mig i Klodskamp! Tryk på linket for at være med (rum ${s.code}): ${link}`;
    const share = el('div', 'share');
    if (typeof navigator.share === 'function') {
      const b = el('button', 'btn', 'Del …');
      b.onclick = () => { navigator.share({ title: 'Klodskamp – spil sammen', text: `Kom og jagt kæmper med mig i Klodskamp! (rum ${s.code})`, url: link }).catch(() => {}); };
      share.append(b);
    }
    const wa = el('a', 'btn wa', 'WhatsApp') as HTMLAnchorElement;
    wa.href = `https://wa.me/?text=${encodeURIComponent(text)}`;
    wa.target = '_blank';
    wa.rel = 'noopener';
    const copy = el('button', 'btn', 'Kopiér link');
    copy.onclick = () => {
      const ok = () => { copy.textContent = 'Kopieret ✓'; setTimeout(() => { copy.textContent = 'Kopiér link'; }, 1800); };
      navigator.clipboard?.writeText(link).then(ok, () => this.selectText(lk)) ?? this.selectText(lk);
    };
    share.append(wa, copy);
    c.append(share);
    c.append(el('div', 'label', `Spillere (højst ${MAX_PLAYERS})`));
    this.players = el('div', 'players');
    c.append(this.players);
    this.status = el('div', 'wait');
    c.append(this.status);
    const btns = el('div', 'btns');
    const go = el('button', 'btn primary', 'Start jagten');
    go.dataset.act = 'start';
    go.onclick = () => this.cb.start();
    const close = el('button', 'btn', 'Luk rummet');
    close.onclick = () => this.cb.leave();
    btns.append(go, close);
    c.append(btns);
    this.refresh(s);
  }

  private selectText(e: HTMLElement) {
    const r = document.createRange();
    r.selectNodeContents(e);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  }

  /** Gæsten: "Du er inviteret" – skriv navn og gå ind */
  showJoin(code: string, name: string) {
    const c = this.card();
    c.append(el('div', 'label', `Kæmpejagt · rum ${esc(code)}`), el('h2', 'heading', 'Du er inviteret!'));
    c.append(el('div', 'sub', 'Spil Kæmpejagt sammen på samme hold. Skriv dit navn og gå ind i rummet – værten starter jagten, når alle er klar.'));
    c.append(el('div', 'label', 'Dit navn'));
    const inp = this.nameInput(name);
    c.append(inp);
    const err = el('div', 'err');
    c.append(err);
    const btns = el('div', 'btns');
    const go = el('button', 'btn primary', 'Gå ind');
    go.dataset.act = 'join';
    const solo = el('button', 'btn', 'Spil alene i stedet');
    const join = () => {
      const n = cleanName(inp.value);
      if (!n) { err.textContent = 'Skriv dit navn, så de andre kan se hvem du er'; inp.focus(); return; }
      this.cb.join(code, n);
    };
    go.onclick = join;
    inp.onkeydown = (e) => { if (e.key === 'Enter') join(); e.stopPropagation(); };
    solo.onclick = () => this.cb.leave();
    btns.append(go, solo);
    c.append(btns);
  }

  /** Gæstens lobby: venter på værten */
  showGuestLobby(s: CoopSession) {
    const c = this.card();
    const mapName = HUNT_MAPS.find((m) => m.id === s.config.map)?.name ?? s.config.map;
    const diffName = HUNT_DIFF[s.config.diff as Difficulty]?.name ?? s.config.diff;
    c.append(el('div', 'label', `Kæmpejagt · ${esc(mapName)} · ${esc(diffName)} · rum ${esc(s.code)}`), el('h2', 'heading', 'Du er med!'));
    this.players = el('div', 'players');
    c.append(this.players);
    this.status = el('div', 'wait');
    c.append(this.status);
    const b = el('button', 'btn', 'Forlad rummet');
    b.onclick = () => this.cb.leave();
    c.append(b);
    this.refresh(s);
  }

  /** Opdatér spillerlisten (nogen kom ind eller gik) */
  refresh(s: CoopSession) {
    if (!this.players) return;
    const rows: string[] = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const p = s.players[i];
      if (p) rows.push(`<div class="p"><i style="background:${MATE_COLOR[p.pid % MATE_COLOR.length]}"></i>${esc(p.name)}<small>${p.pid === 0 ? 'vært' : ''}${p.pid === s.pid ? (p.pid === 0 ? ' · dig' : 'dig') : ''}</small></div>`);
      else rows.push('<div class="p empty">Ledig plads</div>');
    }
    this.players.innerHTML = rows.join('');
    if (this.status) {
      const host = s.players.find((p) => p.pid === 0)?.name ?? 'værten';
      this.status.textContent = s.role === 'host'
        ? (s.players.length < 2 ? 'Venter på at nogen åbner linket … (du kan også starte alene)' : `${s.players.length} spillere klar – kæmperne får mere liv, jo flere I er`)
        : s.started ? 'Jagten er i gang – du hopper ind om et øjeblik …' : `Venter på at ${host} starter jagten …`;
    }
  }
}
