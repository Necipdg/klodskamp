// Stemmechat i "Spil sammen": lyd direkte mellem telefonerne (WebRTC-opkald via PeerJS – samme forbindelser som spillet).
// Alle der har slået "Tal sammen" til, ringer til hinanden (spilleren med det laveste nummer ringer op). Hvem der taler,
// aflæses fra forbindelsens egne lydniveauer (getStats), så lyden ikke skal gennem Web Audio (det driller på iPhone).
import type { MediaConnection } from 'peerjs';
import type { CoopSession, LobbyPlayer } from './coop';

/** Lydniveau (0..1) hvor man regnes for at tale */
export const TALK_LEVEL = 0.035;

export class VoiceChat {
  /** Er man med i stemmechatten (mikrofonen er givet) */
  on = false;
  muted = false;
  /** Lydniveau pr. medspiller (pid) og ens eget */
  levels = new Map<number, number>();
  myLevel = 0;
  onChange: (() => void) | null = null;
  private stream: MediaStream | null = null;
  private calls = new Map<number, MediaConnection>();
  private audios = new Map<number, HTMLAudioElement>();
  private timer = 0;
  private starting = false;

  constructor(private s: CoopSession) {
    s.rtc.on('call', (c) => this.incoming(c));
    this.timer = window.setInterval(() => { void this.poll(); }, 300);
    // Telefoner må først afspille lyd efter et tryk – prøv igen ved næste tryk, hvis det blev afvist
    document.addEventListener('pointerdown', this.resume, true);
  }

  static supported() { return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== 'undefined'; }

  /** Slå "Tal sammen" til: spørger om mikrofonen. Returnerer en fejltekst, hvis det ikke gik. */
  async enable(): Promise<string | null> {
    if (this.on || this.starting) return null;
    if (!VoiceChat.supported()) return 'Din browser kan ikke bruge mikrofonen her.';
    this.starting = true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    } catch (e) {
      this.starting = false;
      const name = (e as Error).name;
      return name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Mikrofonen blev ikke tilladt. Giv spillet adgang til mikrofonen i telefonens indstillinger og prøv igen.'
        : 'Kunne ikke starte mikrofonen.';
    }
    this.starting = false;
    if (this.s.isClosed) { this.stopStream(); return null; }
    this.on = true;
    this.muted = false;
    this.s.setMic(1);
    this.sync();
    this.onChange?.();
    return null;
  }

  disable() {
    if (!this.on) return;
    this.on = false;
    for (const pid of [...this.calls.keys()]) this.hangUp(pid);
    this.stopStream();
    this.s.setMic(0);
    this.onChange?.();
  }

  setMuted(m: boolean) {
    if (!this.on) return;
    this.muted = m;
    for (const t of this.stream?.getAudioTracks() ?? []) t.enabled = !m;
    this.s.setMic(m ? 2 : 1);
    this.onChange?.();
  }

  /** Kaldes når spillerlisten ændrer sig: ring op til nye, læg på til dem der er gået/slået fra */
  sync() {
    const others = new Map(this.s.players.filter((p) => p.pid !== this.s.pid).map((p) => [p.pid, p] as [number, LobbyPlayer]));
    for (const pid of [...this.calls.keys()]) {
      const p = others.get(pid);
      if (!this.on || !p || !p.mic) this.hangUp(pid);
    }
    if (!this.on || !this.stream) return;
    for (const p of others.values()) {
      if (!p.mic || !p.peerId || this.calls.has(p.pid)) continue;
      if (this.s.pid > p.pid) continue; // den med det laveste nummer ringer op
      const call = this.s.rtc.call(p.peerId, this.stream);
      if (call) this.attach(p.pid, call);
    }
  }

  private incoming(call: MediaConnection) {
    const p = this.s.players.find((x) => x.peerId === call.peer && x.pid !== this.s.pid);
    if (!this.on || !this.stream || !p) { call.close(); return; }
    this.calls.get(p.pid)?.close();
    call.answer(this.stream);
    this.attach(p.pid, call);
  }

  private attach(pid: number, call: MediaConnection) {
    this.calls.set(pid, call);
    call.on('stream', (remote) => {
      let a = this.audios.get(pid);
      if (!a) {
        a = document.createElement('audio');
        a.autoplay = true;
        a.setAttribute('playsinline', '');
        a.dataset.voice = String(pid);
        document.body.append(a);
        this.audios.set(pid, a);
      }
      a.srcObject = remote;
      a.play().catch(() => { /* afspilles ved næste tryk */ });
      this.onChange?.();
    });
    const end = () => { if (this.calls.get(pid) === call) this.hangUp(pid); };
    call.on('close', end);
    call.on('error', end);
  }

  private hangUp(pid: number) {
    const c = this.calls.get(pid);
    this.calls.delete(pid);
    try { c?.close(); } catch { /* allerede lukket */ }
    const a = this.audios.get(pid);
    if (a) { a.srcObject = null; a.remove(); this.audios.delete(pid); }
    this.levels.delete(pid);
    this.onChange?.();
  }

  private resume = () => { for (const a of this.audios.values()) if (a.paused) a.play().catch(() => {}); };

  /** Hvem taler lige nu (lydniveauer fra forbindelserne) */
  private async poll() {
    let mine = 0;
    for (const [pid, call] of this.calls) {
      const pc = call.peerConnection;
      if (!pc) continue;
      try {
        const stats = await pc.getStats();
        let lvl = 0;
        stats.forEach((r: { type: string; kind?: string; audioLevel?: number }) => {
          if (r.type === 'inbound-rtp' && r.kind === 'audio' && typeof r.audioLevel === 'number') lvl = Math.max(lvl, r.audioLevel);
          if (r.type === 'media-source' && r.kind === 'audio' && typeof r.audioLevel === 'number') mine = Math.max(mine, r.audioLevel);
        });
        this.levels.set(pid, lvl);
      } catch { /* forbindelsen lukker */ }
    }
    this.myLevel = this.muted ? 0 : mine;
  }

  /** Taler spilleren lige nu? (pid = egen → ens egen mikrofon) */
  talking(pid: number) { return pid === this.s.pid ? this.myLevel > TALK_LEVEL : (this.levels.get(pid) ?? 0) > TALK_LEVEL; }
  /** Er der lyd fra en medspiller (forbindelsen er oppe) */
  connected(pid: number) { return this.audios.has(pid); }

  private stopStream() {
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
  }

  destroy() {
    this.on = false;
    for (const pid of [...this.calls.keys()]) this.hangUp(pid);
    this.stopStream();
    clearInterval(this.timer);
    document.removeEventListener('pointerdown', this.resume, true);
    this.onChange = null;
  }
}
