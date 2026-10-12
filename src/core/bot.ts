// Bots: enkle tilstande (købe, rykke frem, holde post, kæmpe, plante, desarmere) oven på A*-vejfinding.
// En bot "ser" kun en fjende, hvis fjenden er inden for synsvinklen OG der er frit udsyn (voxel-stråle).
import { TUNING, BOT_SKILL } from '../config/tuning';
import { WEAPONS } from '../config/weapons';
import { isDestructible } from './blocks';
import { DEG, angleDiff, clamp, dist, yawPitchTo, type V3 } from './math';
import { NAV } from './nav';
import { lineOfSight } from './ray';
import { chestPos, eyePos, headPos, type Player } from './player';
import type { Game } from './game';
import type { Spot } from './map';

type Goal = { x: number; z: number; kind: string; look?: number } | null;

export class Bot {
  private path: number[] | null = null;
  private pathI = 0;
  private pathGoal = '';
  private pathNavVer = -1;
  private repathT = 0;
  private thinkT = 0;
  private stuckT = 0;
  private lastCheckPos: V3 = { x: 0, y: 0, z: 0 };
  private checkT = 0;
  private penalty = new Map<number, number>();

  target: Player | null = null;
  private targetVisible = false;
  private reactAt = 0;
  private lastSeenT = -99;
  lastKnown: V3 | null = null;
  private alertT = -99;
  private errYaw = 0;
  private errPitch = 0;
  private burstLeft = 0;
  private burstPause = 0;
  private strafeT = 0;
  private strafeDir = 1;
  private wantYaw = 0;
  private wantPitch = 0;
  private breakCell: { x: number; y: number; z: number } | null = null;
  routeIdx = 0;
  route: 'lang' | 'tunnel' = 'lang';
  private bought = false;
  private holdSpot: Spot | null = null;
  private role = 0;
  private built = false;
  goal: Goal = null;
  state = 'idle';

  constructor(private g: Game, readonly p: Player) {}

  private get skill() { return BOT_SKILL[this.g.difficulty]; }

  newRound() {
    const g = this.g, p = this.p;
    this.path = null; this.pathGoal = ''; this.target = null; this.targetVisible = false;
    this.lastKnown = null; this.breakCell = null; this.routeIdx = 0; this.bought = false; this.penalty.clear();
    this.stuckT = 0; this.alertT = -99; this.lastSeenT = -99; this.built = false;
    this.wantYaw = p.yaw; this.wantPitch = 0;
    const mates = g.players.filter((q) => q.team === p.team);
    const role = mates.indexOf(p);
    this.role = role;
    if (p.team === 'A') {
      this.route = g.attackRoute;
      // Den tredje angriber lurer af og til ad den anden rute
      if (role === 2 && g.rng.chance(0.35)) this.route = g.attackRoute === 'lang' ? 'tunnel' : 'lang';
    } else {
      // Én holder Lang, én holder Tunnelen/Midten, én bliver på bombeområdet
      const h = g.map.holds;
      const r = g.rng.next();
      // Af og til presser én forsvarer langt frem – så kan angriberne komme ind på bombeområdet ad den anden vej
      // Rolle 0 holder Lang (af og til langt fremme), rolle 1 Tunnelen/Midten, rolle 2 er anker på bombeområdet
      const pick = [r < 0.1 ? h[7] : g.rng.chance(0.3) ? h[0] : h[1], r > 0.9 ? h[6] : g.rng.chance(0.3) ? h[2] : h[3], g.rng.chance(0.5) ? h[4] : h[5]];
      this.holdSpot = pick[role] ?? h[4];
    }
    this.thinkT = g.rng.next() * TUNING.botThinkInterval;
  }

  // ---------- Signaler fra spillet ----------

  hearShot(shooter: Player, from: V3) {
    const p = this.p;
    if (!p.alive || shooter.team === p.team) return;
    if (dist(from, eyePos(p)) > TUNING.botHearRange) return;
    if (!this.targetVisible) { this.lastKnown = { ...shooter.body.pos }; this.alertT = this.g.time; }
  }

  onDamaged(attacker: Player) {
    if (attacker.team === this.p.team) return;
    if (!this.targetVisible) { this.lastKnown = { ...attacker.body.pos }; this.alertT = this.g.time; }
  }

  // ---------- Hver simuleringsskridt ----------

  update(dt: number) {
    const g = this.g, p = this.p;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT += TUNING.botThinkInterval; this.think(); }

    // Følg målet mellem beslutningerne
    if (this.targetVisible && this.target?.alive) {
      const w = yawPitchTo(eyePos(p), this.aimPoint(this.target));
      this.wantYaw = w.yaw;
      this.wantPitch = w.pitch - p.recoilP * DEG * 0.75;
    }
    // Sigte: drej mod det ønskede med begrænset hastighed
    const rate = this.skill.turnRate * DEG * dt * (this.targetVisible ? 1 : 0.55);
    const dy = angleDiff(p.yaw, this.wantYaw + this.errYaw);
    p.yaw += clamp(dy, -rate, rate);
    const dpch = this.wantPitch + this.errPitch - p.pitch;
    p.pitch += clamp(dpch, -rate, rate);
    this.errYaw *= Math.exp(-dt * 2.2);
    this.errPitch *= Math.exp(-dt * 2.2);

    // Skud
    const inp = p.input;
    const ws = g.currentWeaponState(p);
    inp.fire = false;
    if (g.phase === 'buy' || g.phase === 'over') return;
    if (this.breakCell) {
      const off = Math.abs(dy) + Math.abs(dpch);
      if (off < 4 * DEG && ws && ws.mag > 0 && p.fireCd <= 0) { inp.fire = true; inp.firePressed = true; }
      return;
    }
    if (!this.target || !this.targetVisible || g.time < this.reactAt || !ws) return;
    if (this.burstPause > 0) { this.burstPause -= dt; return; }
    const tpos = this.aimPoint(this.target);
    const d = dist(eyePos(p), tpos);
    const want = yawPitchTo(eyePos(p), tpos);
    const offYaw = Math.abs(angleDiff(p.yaw, want.yaw)), offP = Math.abs(want.pitch - p.pitch);
    const tol = Math.max(1.4 * DEG, Math.atan(0.42 / Math.max(d, 1))) * 1.5;
    if (offYaw < tol && offP < tol * 1.3 && ws.mag > 0 && p.fireCd <= 0) {
      // Tjek udsynet lige nu (ikke kun ved sidste beslutning) – bots skyder aldrig gennem vægge
      const eye = eyePos(p);
      if (!lineOfSight(g.world, eye, headPos(this.target)) && !lineOfSight(g.world, eye, chestPos(this.target))) { this.targetVisible = false; return; }
      const def = WEAPONS[ws.id];
      inp.fire = true;
      inp.firePressed = true;
      // Et mål i fart er sværere at ramme (den der stormer, får en fordel over den der står stille)
      const ts = Math.hypot(this.target.body.vel.x, this.target.body.vel.z) / TUNING.runSpeed;
      const j = this.skill.jitter * DEG * (1 + d / 22) * (1 + 0.3 * Math.min(1, ts));
      this.errYaw += (g.rng.next() - 0.5) * 2 * j;
      this.errPitch += (g.rng.next() - 0.5) * j;
      if (def.auto) {
        this.burstLeft--;
        if (this.burstLeft <= 0) {
          this.burstLeft = this.skill.burst + Math.floor(g.rng.next() * 2);
          this.burstPause = d > 15 ? 0.32 : 0.12;
        }
      } else this.burstPause = 0.12 + g.rng.next() * 0.15;
    }
  }

  /** Kaldes af spillet i selve skud-øjeblikket (efter bevægelse): skyder kun med frit udsyn */
  clearShot(): boolean {
    if (this.breakCell) return true;
    const t = this.target;
    if (!t || !t.alive) return false;
    const eye = eyePos(this.p);
    if (lineOfSight(this.g.world, eye, headPos(t)) || lineOfSight(this.g.world, eye, chestPos(t))) return true;
    this.targetVisible = false;
    return false;
  }

  private aimPoint(t: Player): V3 {
    return this.headAim ? headPos(t) : chestPos(t);
  }
  private headAim = false;

  // ---------- Beslutninger (10 gange i sekundet) ----------

  private think() {
    const g = this.g, p = this.p;
    const inp = p.input;
    inp.fwd = 0; inp.right = 0; inp.jump = false; inp.walk = false; inp.crouch = false;
    if (!p.alive) return;

    if (g.phase === 'buy') {
      if (!this.bought) { this.doBuy(); this.bought = true; }
      inp.use = false;
      this.lookAround();
      return;
    }
    if (g.phase === 'over') { inp.use = false; return; }

    this.perceive();
    this.manageWeapon();

    // Igangværende plantning/desarmering
    if (p.action) {
      const covered = g.alive(p.team).some((q) => q !== p && dist(q.body.pos, p.body.pos) < 9);
      const enemyClose = this.targetVisible && this.target && dist(this.target.body.pos, p.body.pos) < (p.action.kind === 'plant' ? (covered ? 4 : 12) : 25);
      const nearlyDone = p.action.kind === 'defuse' ? p.action.t > TUNING.defuseTime * 0.65 : p.action.t > TUNING.plantTime * 0.7;
      if (enemyClose && !nearlyDone) inp.use = false;
      else { inp.use = true; return; }
    }
    inp.use = false;

    // Kamp
    if (this.target && this.targetVisible) {
      this.state = 'kamp';
      this.breakCell = null;
      const d = dist(this.target.body.pos, p.body.pos);
      // Bæreren planter under dækning fra en holdkammerat i stedet for at skyde
      if (p.hasBomb && g.canPlant(p) && d > 4 && g.alive('A').some((q) => q !== p && dist(q.body.pos, p.body.pos) < 9)) { inp.use = true; this.state = 'planter'; return; }
      // Angribere lader sig ikke låse fast i lange skudvekslinger: de rykker frem mod målet, mens de skyder
      if (p.team === 'A' && g.phase === 'live' && (d > 16 || (p.hasBomb && d > 11))) {
        const goal = this.chooseGoal();
        if (goal && goal.kind !== 'jagt') {
          this.goal = goal;
          const near = Math.hypot(p.body.pos.x - goal.x, p.body.pos.z - goal.z) < 0.6;
          if (goal.kind === 'plant' && (near || g.inSite(p)) && g.canPlant(p)) inp.use = true;
          else this.followPath(goal);
          this.state = 'kamp+frem';
          return;
        }
      }
      this.combatMove();
      // Forsvarere på post sidder på hug bag dækning
      if (p.team === 'D' && this.goal?.kind === 'post' && Math.hypot(p.body.pos.x - this.goal.x, p.body.pos.z - this.goal.z) < 1.2) { inp.crouch = true; inp.right = 0; }
      return;
    }

    // Mål for bevægelse
    this.goal = this.chooseGoal();
    this.state = this.goal?.kind ?? 'idle';
    if (!this.goal) { this.lookAround(); return; }

    const atGoal = Math.hypot(p.body.pos.x - this.goal.x, p.body.pos.z - this.goal.z) < (this.goal.kind === 'plant' || this.goal.kind === 'defuse' ? 0.45 : 0.9);
    if (atGoal) {
      this.path = null;
      this.breakCell = null;
      if (this.goal.kind === 'plant' && g.canPlant(p)) inp.use = true;
      if (this.goal.kind === 'defuse' && g.canDefuse(p)) inp.use = true;
      if (this.goal.kind === 'route') this.routeIdx++;
      if (this.goal.kind === 'post') { inp.crouch = true; this.buildCover(this.goal.look); }
      if (this.goal.kind === 'samles') this.lookIdle(this.route === 'lang' ? 0 : 0);
      this.lookIdle(this.goal.look);
      return;
    }
    this.followPath(this.goal);
  }

  private chooseGoal(): Goal {
    const g = this.g, p = this.p, m = g.map;
    const recent = this.lastKnown && g.time - Math.max(this.lastSeenT, this.alertT) < 4;

    if (p.team === 'A') {
      if (g.bomb.state === 'planted') {
        const spot = m.postPlant[this.roleIndex() % m.postPlant.length];
        if (recent && dist(this.lastKnown!, g.bomb.pos) < 14) return { x: this.lastKnown!.x, z: this.lastKnown!.z, kind: 'jagt' };
        return { x: spot.x, z: spot.z, kind: 'vagt', look: spot.look };
      }
      if (g.bomb.state === 'dropped') {
        const attackers = g.alive('A');
        let best = attackers[0];
        for (const a of attackers) if (dist(a.body.pos, g.bomb.pos) < dist(best.body.pos, g.bomb.pos)) best = a;
        if (best === p) return { x: g.bomb.pos.x, z: g.bomb.pos.z, kind: 'bombe' };
      }
      if (recent && !p.hasBomb) return { x: this.lastKnown!.x, z: this.lastKnown!.z, kind: 'jagt' };
      const late = g.roundT < 30;
      const route = m.routes[this.route];
      // Saml holdet ved ruten, før der stormes (ellers dør de én ad gangen)
      const st = m.stage[this.route];
      if (!late && this.routeIdx > st && !g.stageGo[this.route]) {
        if (g.stageT[this.route] < 0) g.stageT[this.route] = g.time;
        const mates = g.alive('A').filter((q) => q.isBot || g.bots.has(q.id)).map((q) => g.bots.get(q.id)!).filter((b) => b && b.route === this.route);
        const all = mates.every((b) => b.routeIdx > st);
        if (all || g.time - g.stageT[this.route] > 2.5 || g.roundT < 45) g.stageGo[this.route] = true;
        else { const w = route[st]; return { x: w.x, z: w.z, kind: 'samles', look: 0 }; }
      }
      if (!late && this.routeIdx < route.length) {
        const w = route[this.routeIdx];
        return { x: w.x, z: w.z, kind: 'route' };
      }
      if (p.hasBomb) {
        if (g.inSite(p)) return { x: p.body.pos.x, z: p.body.pos.z, kind: 'plant' }; // allerede på bombeområdet: plant her
        const s = m.plantSpots[(p.id + g.round) % m.plantSpots.length];
        return { x: s.x, z: s.z, kind: 'plant' };
      }
      // Dæk bombebæreren
      const carrier = g.players[g.bomb.carrier];
      if (carrier && carrier.alive && carrier !== p && dist(carrier.body.pos, p.body.pos) > 5) {
        return { x: carrier.body.pos.x, z: carrier.body.pos.z, kind: 'følg' };
      }
      const spot = m.postPlant[this.roleIndex() % m.postPlant.length];
      return { x: spot.x, z: spot.z, kind: 'vagt', look: spot.look };
    }

    // Forsvarere
    if (g.bomb.state === 'planted') {
      const defenders = g.alive('D');
      let best = defenders[0];
      for (const d of defenders) if (dist(d.body.pos, g.bomb.pos) < dist(best.body.pos, g.bomb.pos)) best = d;
      if (best === p) return { x: g.bomb.pos.x, z: g.bomb.pos.z, kind: 'defuse' };
      if (recent) return { x: this.lastKnown!.x, z: this.lastKnown!.z, kind: 'jagt' };
      return { x: g.bomb.pos.x + 2.5, z: g.bomb.pos.z + 1.5, kind: 'vagt' };
    }
    if (recent && dist(this.lastKnown!, p.body.pos) < 18) return { x: this.lastKnown!.x, z: this.lastKnown!.z, kind: 'jagt' };
    // Holdkammerater har set nogen på bombeområdet → rotér derhen
    const intel = g.intel.D;
    // Ankeret (rolle 2) bliver på bombeområdet; de andre roterer
    if (this.role !== 2 && intel && g.time - intel.t < 5 && Math.hypot(intel.pos.x - 11, intel.pos.z - 12) < 16 && dist(intel.pos, p.body.pos) > 8 && dist(intel.pos, p.body.pos) < 32) {
      return { x: intel.pos.x, z: intel.pos.z, kind: 'rotér' };
    }
    const s = this.holdSpot ?? m.holds[0];
    return { x: s.x, z: s.z, kind: 'post', look: s.look };
  }

  private roleIndex() { return this.g.players.filter((q) => q.team === this.p.team).indexOf(this.p); }

  // ---------- Opfattelse ----------

  private perceive() {
    const g = this.g, p = this.p;
    const eye = eyePos(p);
    let best: Player | null = null, bestD = Infinity;
    for (const q of g.players) {
      if (!q.alive || q.team === p.team) continue;
      const d = dist(q.body.pos, p.body.pos);
      if (d > TUNING.botViewRange) continue;
      const tracking = q === this.target && this.targetVisible;
      if (!tracking && d > 4) {
        const dir = yawPitchTo(eye, chestPos(q));
        if (Math.abs(angleDiff(p.yaw, dir.yaw)) > TUNING.botFov * DEG) continue;
      }
      if (!lineOfSight(g.world, eye, headPos(q)) && !lineOfSight(g.world, eye, chestPos(q))) continue;
      if (d < bestD) { best = q; bestD = d; }
    }
    if (best) {
      if (best !== this.target || !this.targetVisible) {
        // Ny fjende i synet: reaktionstid og en indledende sigtefejl
        const facing = Math.abs(angleDiff(p.yaw, yawPitchTo(eye, chestPos(best)).yaw)) < 20 * DEG;
        const holding = this.goal?.kind === 'post' && Math.hypot(p.body.pos.x - this.goal.x, p.body.pos.z - this.goal.z) < 1.2;
        this.reactAt = g.time + this.skill.reaction * (facing ? 0.75 : 1.1) * (holding ? 0.65 : 1) * (0.8 + g.rng.next() * 0.5);
        const e = this.skill.aimError * DEG;
        this.errYaw = (g.rng.next() - 0.5) * 2 * e;
        this.errPitch = (g.rng.next() - 0.5) * e;
        this.burstLeft = this.skill.burst;
        this.headAim = g.rng.chance(this.skill.headChance);
      }
      this.target = best;
      this.targetVisible = true;
      this.lastSeenT = g.time;
      this.lastKnown = { ...best.body.pos };
      g.intel[p.team] = { pos: { ...best.body.pos }, t: g.time };
      // Sigt (med rekylkompensation)
      const w = yawPitchTo(eye, this.aimPoint(best));
      this.wantYaw = w.yaw;
      this.wantPitch = w.pitch - p.recoilP * DEG * 0.75;
    } else {
      this.targetVisible = false;
      if (this.target && (!this.target.alive || g.time - this.lastSeenT > 3)) this.target = null;
    }
  }

  private manageWeapon() {
    const p = this.p, g = this.g;
    const inp = p.input;
    const want = p.primary ? 'primary' : 'pistol';
    if (p.slot !== want && !this.breakCell) inp.slot = want;
    const ws = g.currentWeaponState(p);
    if (ws && ws.mag === 0 && ws.reserve === 0) {
      // Tom: skift til det andet våben eller kniven
      if (p.slot === 'primary' && p.pistol.mag + p.pistol.reserve > 0) inp.slot = 'pistol';
      else if (p.slot === 'pistol' && p.primary && p.primary.mag + p.primary.reserve > 0) inp.slot = 'primary';
      else inp.slot = 'knife';
    }
    if (ws && !this.targetVisible && p.reloadT <= 0 && ws.mag < WEAPONS[ws.id].mag * 0.45 && ws.reserve > 0) inp.reload = true;
  }

  // ---------- Bevægelse ----------

  private combatMove() {
    const g = this.g, p = this.p, t = this.target!;
    const d = dist(t.body.pos, p.body.pos);
    const ws = g.currentWeaponState(p);
    const inp = p.input;
    this.strafeT -= TUNING.botThinkInterval;
    if (this.strafeT <= 0) { this.strafeT = 0.5 + g.rng.next() * 0.9; this.strafeDir = g.rng.chance(0.5) ? 1 : -1; }
    // Riffel på afstand: stå stille for præcision. Ellers små sidetrin mellem salverne.
    const precise = ws && ws.id === 'rifle' && d > 9;
    if (!precise && this.burstPause > 0) inp.right = this.strafeDir;
    if (ws?.id === 'knife' || !ws) {
      this.moveToward(t.body.pos.x, t.body.pos.z);
    }
    if (p.slot === 'knife' && d < 1.8) { inp.fire = true; inp.firePressed = true; }
  }

  private followPath(goal: NonNullable<Goal>) {
    const g = this.g, p = this.p, nav = g.nav;
    const key = `${Math.floor(goal.x)},${Math.floor(goal.z)}`;
    this.repathT -= TUNING.botThinkInterval;
    if (!this.path || this.pathGoal !== key || this.pathNavVer !== nav.version || this.repathT <= 0) {
      this.path = nav.findPath(p.body.pos.x, p.body.pos.z, goal.x, goal.z, this.penalty);
      this.pathI = 0;
      this.pathGoal = key;
      this.pathNavVer = nav.version;
      this.repathT = 2.5;
      if (!this.path) { this.lookIdle(goal.look); return; }
    }
    const path = this.path;
    const W = nav.w;
    const cx = (i: number) => (path[i] % W) + 0.5, cz = (i: number) => Math.floor(path[i] / W) + 0.5;
    // Videre langs ruten
    while (this.pathI < path.length - 1 && Math.hypot(p.body.pos.x - cx(this.pathI), p.body.pos.z - cz(this.pathI)) < 0.55) this.pathI++;
    const next = path[this.pathI];
    const nk = nav.kind[next];
    const nx = cx(this.pathI), nz = cz(this.pathI);
    const dn = Math.hypot(p.body.pos.x - nx, p.body.pos.z - nz);

    // Spærret af noget der kan skydes væk
    if (nk === NAV.BREAK) {
      if (dn < 2.2) {
        const bx = next % W, bz = Math.floor(next / W);
        const y = g.world.solidAt(bx, 2, bz) && isDestructible(g.world.get(bx, 2, bz)) ? 2 : 1;
        this.breakCell = { x: bx, y, z: bz };
        const w = yawPitchTo(eyePos(p), { x: bx + 0.5, y: y + 0.5, z: bz + 0.5 });
        this.wantYaw = w.yaw; this.wantPitch = w.pitch;
        this.errYaw = 0; this.errPitch = 0;
        const ws = g.currentWeaponState(p);
        if (ws && ws.mag === 0 && ws.reserve === 0) p.input.slot = 'knife';
        if (p.slot === 'knife' && dn > 1.3) this.moveToward(nx, nz);
        return;
      }
    } else this.breakCell = null;

    // Kig frem ad ruten og vælg det fjerneste punkt man kan gå lige hen til
    let tx = nx, tz = nz;
    for (let j = Math.min(path.length - 1, this.pathI + 6); j > this.pathI; j--) {
      let ok = true;
      for (let k = this.pathI; k <= j; k++) if (nav.kind[path[k]] !== NAV.OPEN) { ok = false; break; }
      if (ok && nav.clearLine(p.body.pos.x, p.body.pos.z, cx(j), cz(j))) { tx = cx(j); tz = cz(j); break; }
    }
    if (this.pathI === path.length - 1) { tx = goal.x; tz = goal.z; }
    this.moveToward(tx, tz);
    // Hop op på lave forhindringer
    if (nk === NAV.HOP && dn < 1.4 && p.body.onGround) p.input.jump = true;
    // Kig i bevægelsesretningen (eller mod sidst kendte fjende)
    if (this.lastKnown && this.g.time - Math.max(this.lastSeenT, this.alertT) < 4) this.lookAt(this.lastKnown, 1.4);
    else {
      const a = Math.atan2(-(tx - p.body.pos.x), -(tz - p.body.pos.z));
      this.wantYaw = a; this.wantPitch = 0;
    }
    this.checkStuck();
  }

  private moveToward(x: number, z: number) {
    const p = this.p;
    const dx = x - p.body.pos.x, dz = z - p.body.pos.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.05) return;
    const wx = dx / l, wz = dz / l;
    // Verdensretning → frem/højre i forhold til hvor botten kigger
    const sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    p.input.fwd = wx * -sy + wz * -cy;
    p.input.right = wx * cy + wz * -sy;
    if (l < 0.6) { p.input.fwd *= l / 0.6; p.input.right *= l / 0.6; }
  }

  private checkStuck() {
    const p = this.p;
    this.checkT -= TUNING.botThinkInterval;
    if (this.checkT > 0) return;
    this.checkT = 0.5;
    const moved = Math.hypot(p.body.pos.x - this.lastCheckPos.x, p.body.pos.z - this.lastCheckPos.z);
    this.lastCheckPos = { ...p.body.pos };
    if (moved < 0.2 && !this.breakCell) {
      this.stuckT += 0.5;
      if (this.stuckT >= 0.5) p.input.jump = true;
      if (this.stuckT >= 1.5 && this.path) {
        // Gør den næste celle dyr og find en anden vej
        const c = this.path[Math.min(this.pathI, this.path.length - 1)];
        this.penalty.set(c, (this.penalty.get(c) ?? 0) + 25);
        this.path = null;
        this.stuckT = 0;
      }
    } else this.stuckT = 0;
  }

  private lookAt(pos: V3, eyeH = 1.4) {
    const w = yawPitchTo(eyePos(this.p), { x: pos.x, y: pos.y + eyeH, z: pos.z });
    this.wantYaw = w.yaw; this.wantPitch = w.pitch;
  }

  private lookIdle(look?: number) {
    if (this.lastKnown && this.g.time - Math.max(this.lastSeenT, this.alertT) < 6) { this.lookAt(this.lastKnown); return; }
    if (look !== undefined) {
      this.wantYaw = look + Math.sin(this.g.time * 0.7 + this.p.id) * 0.35;
      this.wantPitch = 0;
    }
  }

  private lookAround() {
    this.wantYaw = this.p.yaw;
  }

  /** Forsvarere med sandsække bygger en lav mur foran deres post (de sidder på hug bag den) */
  private buildCover(look?: number) {
    const g = this.g, p = this.p;
    if (this.built || look === undefined || p.blocks <= 0 || g.phase !== 'live') return;
    this.built = true;
    const fx = -Math.sin(look), fz = -Math.cos(look);
    const rx = Math.cos(look), rz = -Math.sin(look);
    const cx = p.body.pos.x + fx * 1.6, cz = p.body.pos.z + fz * 1.6;
    for (const side of [0, -1, 1]) {
      if (p.blocks <= 0) break;
      const x = Math.floor(cx + rx * side), z = Math.floor(cz + rz * side);
      if (g.checkPlacement(p, x, 1, z).valid) g.placeBlock(p, { x, y: 1, z });
    }
  }

  // ---------- Køb ----------

  private doBuy() {
    const g = this.g, p = this.p;
    const buy = (id: Parameters<Game['buy']>[1]) => g.buy(p.id, id);
    if (!p.primary) {
      if (p.money >= 2700 + 650) { buy('rifle'); buy('vest'); }
      else if (p.money >= 2700) buy('rifle');
      else if (p.money >= 1250 + 650 && g.round > 1) { buy('smg'); buy('vest'); }
      else if (p.money >= 650 && g.round === 1) buy('vest');
      else if (p.money >= 1250 && g.round > 2) buy('smg');
    } else if (p.armor <= 0 && p.money >= 650) buy('vest');
    // Forsvarere med penge til overs køber sandsække til at bygge dækning
    if (p.team === 'D' && p.primary && p.money >= 600 && g.rng.chance(0.6)) buy('blocks');
    const ws = [p.pistol, p.primary].filter(Boolean);
    if (ws.some((w) => w!.reserve < WEAPONS[w!.id].reserve * 0.4) && p.money >= 100) buy('ammo');
  }

  /** Til tests: hvad botten har gang i */
  debug() {
    return { state: this.state, goal: this.goal, target: this.target?.id ?? -1, visible: this.targetVisible, breakCell: this.breakCell, route: this.route };
  }
}

