// Co-op over nettet: direkte forbindelse mellem browserne (WebRTC via PeerJS). Værten opretter et rum med en kode,
// gæsterne forbinder til værten via linket (?rum=KODE). PeerJS' gratis signalserver bruges kun til at finde hinanden –
// selve spillet går direkte mellem telefonerne/computerne. Alt sendes som små JSON-beskeder.
import { Peer, type DataConnection, type PeerOptions } from 'peerjs';

export const MAX_PLAYERS = 4;
const PREFIX = 'klodskamp-v1-';
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // uden I, O, 0 og 1 (svære at skelne)

/** mic: 0 = ikke med i stemmechatten, 1 = taler med, 2 = med men har slået sin mikrofon fra */
export interface LobbyPlayer { pid: number; name: string; peerId?: string; mic?: 0 | 1 | 2 }
export interface CoopConfig { map: string; diff: string }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NetMsg = { t: string; [k: string]: any };
export interface Inbound { from: number; msg: NetMsg }

/** Signalserver: standard er PeerJS' gratis server; `?peer=vært:port` (tests) bruger en lokal */
function peerOptions(): PeerOptions {
  const opts: PeerOptions = {
    debug: 0,
    config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }] },
  };
  try {
    const custom = new URLSearchParams(location.search).get('peer');
    if (custom) {
      const [host, port] = custom.split(':');
      Object.assign(opts, { host, port: Number(port || 9000), path: '/', secure: false });
    }
  } catch { /* ingen location (tests) */ }
  return opts;
}

export const newRoomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]).join('');
export const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);

/** Link man deler: spillets adresse + ?rum=KODE */
export function inviteLink(code: string) {
  const u = new URL(location.href);
  u.search = '';
  u.hash = '';
  u.searchParams.set('rum', code);
  const peer = new URLSearchParams(location.search).get('peer');
  if (peer) u.searchParams.set('peer', peer);
  return u.toString();
}

/** Danske fejltekster */
function errorText(type: string) {
  switch (type) {
    case 'peer-unavailable': return 'Rummet findes ikke (værten har måske lukket det). Bed om et nyt link.';
    case 'network': case 'server-error': case 'socket-error': case 'socket-closed': return 'Ingen forbindelse til nettet. Tjek internettet og prøv igen.';
    case 'browser-incompatible': return 'Din browser kan ikke spille sammen med andre. Prøv Chrome eller Safari.';
    case 'webrtc': return 'Kunne ikke forbinde direkte til værten. Prøv på samme wifi som værten.';
    default: return 'Forbindelsen mislykkedes. Prøv igen.';
  }
}

export class CoopSession {
  readonly role: 'host' | 'client';
  code: string;
  /** Min spillers nummer (værten er 0) */
  pid = 0;
  players: LobbyPlayer[] = [];
  config: CoopConfig;
  /** Er jagten i gang (så kan nye gæster hoppe direkte ind) */
  started = false;
  inbox: Inbound[] = [];
  onLobby: (() => void) | null = null;
  onClose: ((reason: string) => void) | null = null;
  /** Værten: en gæst er kommet ind (sendes jagten, hvis den er i gang) */
  onJoin: ((pid: number) => void) | null = null;
  onLeave: ((pid: number, name: string) => void) | null = null;
  private peer: Peer;
  /** PeerJS-forbindelsen (bruges også til stemmechat) */
  get rtc() { return this.peer; }
  get isClosed() { return this.closed; }
  private conns = new Map<number, DataConnection>(); // værten: pid → forbindelse
  private host: DataConnection | null = null; // gæsten: forbindelsen til værten
  private nextPid = 1;
  private closed = false;

  private constructor(role: 'host' | 'client', peer: Peer, code: string, name: string, config: CoopConfig) {
    this.role = role;
    this.peer = peer;
    this.code = code;
    this.config = config;
    if (role === 'host') this.players = [{ pid: 0, name, peerId: peer.id, mic: 0 }];
  }

  /** Opret et rum (prøver en ny kode, hvis koden er optaget) */
  static host(name: string, config: CoopConfig): Promise<CoopSession> {
    return new Promise((resolve, reject) => {
      let tries = 0;
      const attempt = () => {
        const code = newRoomCode();
        const peer = new Peer(PREFIX + code, peerOptions());
        const timer = setTimeout(() => { peer.destroy(); reject(new Error(errorText('network'))); }, 15000);
        peer.on('open', () => {
          clearTimeout(timer);
          const s = new CoopSession('host', peer, code, name, config);
          peer.on('connection', (c) => s.accept(c));
          peer.on('disconnected', () => { if (!s.closed) peer.reconnect(); });
          resolve(s);
        });
        peer.on('error', (e) => {
          clearTimeout(timer);
          if (e.type === 'unavailable-id' && tries++ < 4) { peer.destroy(); attempt(); return; }
          peer.destroy();
          reject(new Error(errorText(e.type)));
        });
      };
      attempt();
    });
  }

  /** Gå ind i et rum med koden fra linket */
  static join(code: string, name: string): Promise<CoopSession> {
    return new Promise((resolve, reject) => {
      const peer = new Peer(peerOptions());
      let done = false;
      const fail = (msg: string) => { if (done) return; done = true; clearTimeout(timer); peer.destroy(); reject(new Error(msg)); };
      const timer = setTimeout(() => fail('Kunne ikke forbinde til værten. Prøv på samme wifi som værten, eller bed om et nyt link.'), 20000);
      peer.on('error', (e) => fail(errorText(e.type)));
      peer.on('open', () => {
        const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json' });
        let s: CoopSession | null = null;
        conn.on('open', () => conn.send({ t: 'hello', name }));
        conn.on('error', () => { if (s) s.lost('Forbindelsen til værten blev afbrudt.'); else fail(errorText('webrtc')); });
        conn.on('close', () => { if (s) s.lost('Værten har forladt spillet.'); else fail('Værten lukkede forbindelsen.'); });
        conn.on('data', (d) => {
          const msg = d as NetMsg;
          if (s) { s.receive(0, msg); return; }
          if (done) return;
          if (msg.t === 'full') { fail('Rummet er fuldt (højst 4 spillere).'); return; }
          if (msg.t !== 'welcome') return;
          done = true;
          clearTimeout(timer);
          s = new CoopSession('client', peer, code, name, msg.config);
          s.pid = msg.pid;
          s.players = msg.players;
          s.started = !!msg.started;
          s.host = conn;
          const ss = s;
          peer.on('disconnected', () => { if (!ss.closed) peer.reconnect(); });
          resolve(s);
        });
      });
    });
  }

  // ---------- Værten ----------

  private accept(c: DataConnection) {
    let pid = -1;
    c.on('data', (d) => {
      const msg = d as NetMsg;
      if (pid < 0) {
        if (msg.t !== 'hello') return;
        if (this.players.length >= MAX_PLAYERS) { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); return; }
        pid = this.nextPid++;
        const name = String(msg.name || 'Spiller').slice(0, 16);
        this.conns.set(pid, c);
        this.players.push({ pid, name, peerId: c.peer, mic: 0 });
        c.send({ t: 'welcome', pid, players: this.players, config: this.config, started: this.started });
        this.broadcastLobby();
        this.onJoin?.(pid);
        return;
      }
      this.receive(pid, msg);
    });
    c.on('close', () => this.drop(pid));
    c.on('error', () => this.drop(pid));
  }

  private drop(pid: number) {
    if (pid < 0 || !this.conns.has(pid)) return;
    this.conns.delete(pid);
    const p = this.players.find((x) => x.pid === pid);
    this.players = this.players.filter((x) => x.pid !== pid);
    this.inbox.push({ from: pid, msg: { t: 'left' } });
    this.broadcastLobby();
    this.onLeave?.(pid, p?.name ?? 'En spiller');
  }

  setConfig(config: CoopConfig) { this.config = config; this.broadcastLobby(); }

  /** Stemmechat: meld om man er med (og om mikrofonen er slået fra) – værten fortæller alle det */
  setMic(mic: 0 | 1 | 2) {
    if (this.role === 'host') this.updateMic(0, mic);
    else {
      const me = this.players.find((p) => p.pid === this.pid);
      if (me) me.mic = mic;
      this.send({ t: 'mic', mic });
      this.onLobby?.();
    }
  }
  private updateMic(pid: number, mic: number) {
    const p = this.players.find((x) => x.pid === pid);
    if (!p) return;
    p.mic = mic === 1 || mic === 2 ? mic : 0;
    this.broadcastLobby();
  }

  private broadcastLobby() {
    this.broadcast({ t: 'lobby', players: this.players, config: this.config });
    this.onLobby?.();
  }

  /** Send til alle gæster (evt. undtagen én) */
  broadcast(msg: NetMsg, except = -1) {
    for (const [pid, c] of this.conns) if (pid !== except && c.open) c.send(msg);
  }
  sendTo(pid: number, msg: NetMsg) { const c = this.conns.get(pid); if (c?.open) c.send(msg); }

  // ---------- Gæsten ----------

  send(msg: NetMsg) { if (this.host?.open) this.host.send(msg); }

  // ---------- Fælles ----------

  /** Beskeder om rummet håndteres her; resten lægges i indbakken til spillet */
  receive(from: number, msg: NetMsg) {
    if (msg.t === 'lobby') { this.players = msg.players; this.config = msg.config; this.onLobby?.(); return; }
    if (msg.t === 'mic' && this.role === 'host') { this.updateMic(from, Number(msg.mic)); return; }
    if (msg.t === 'bye') {
      if (this.role === 'host') this.drop(from); else this.lost(typeof msg.why === 'string' ? msg.why : 'Værten har lukket rummet.');
      return;
    }
    this.inbox.push({ from, msg });
  }

  get connectedCount() { return this.role === 'host' ? this.conns.size : this.host?.open ? 1 : 0; }

  private lost(reason: string) {
    if (this.closed) return;
    this.closed = true;
    this.peer.destroy();
    this.onClose?.(reason);
  }

  /** Værten: smid en gæst ud, der ikke har givet lyd fra sig i lang tid (fx lukket telefon) */
  kick(pid: number) {
    const c = this.conns.get(pid);
    if (c?.open) c.send({ t: 'bye', why: 'Du var væk fra spillet for længe og er taget ud af jagten. Åbn linket igen for at komme med.' });
    this.drop(pid);
    setTimeout(() => { try { c?.close(); } catch { /* allerede lukket */ } }, 300);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    if (this.role === 'host') this.broadcast({ t: 'bye' });
    else this.send({ t: 'bye' });
    setTimeout(() => this.peer.destroy(), 200);
  }
}
