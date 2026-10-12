# CLAUDE.md — Klodskamp

3D-blokspil med to spiltyper: **Taktisk kamp** (Counter-Strike-agtige bomberunder, 3 mod 3 med bots) i en
Minecraft-agtig by af sandsten, terrakottatage og trækasser – og **Kæmpejagt** (alene mod tre bølger
kæmper i murbyen "Bastionen", med krog, gas og skydevåben). Hobby/læring under "Spiludvikling med AI".
Eget navn, egen bane ("Sandgården"), al grafik og lyd lavet i kode – ingen assets fra Minecraft eller CS.
Visuel kvalitetsreference: Nick Saraevs "Titan Siege" (attack-on-titancraft.netlify.app) – ikke kopieret.

## Status (11.10.2026)

- v0.1 afleveret: fuld lokal kamp mod bots (første hold til 5 runder), køb, økonomi, bygning,
  ødelæggelse, bombe (plant/eksplosion/desarmering), tilskuer, start-/købs-/pause-/slutskærm, lyd.
- Testet: 37 logik-tests (`npm test`) + browsertest af brugerfladen (`scripts/ui-test.mjs`, 34 tjek).
  Ydelse målt i Necips Chrome (Intel Arc 140V, 1920×1080, grafik Høj): ≈2,6 ms pr. billede (F8).
- v0.2 (11.10.2026): bots planter selv (~30 % af bot-runderne, før 0 %): samling før stormløb, bæreren
  planter under dækning, ankeret venter skjult i forsvarergangen og tager området tilbage, forsvarerne
  roterer ikke alle på én gang. Tabsbelønning $2600 (før $1900 – vinderen af pistolrunden snebolde).
  Spillere kan ikke længere gå gennem hinanden. Forsvarende bots køber sandsække og bygger dækning ved
  deres post. Bots tjekker udsynet i selve skud-øjeblikket (0 skud uden frit udsyn i testene).
- v0.3 (11.10.2026): ny spiltype **Kæmpejagt** – valg af spiltype på startskærmen, banen Bastionen,
  krog (højre mus), gas-boost (mellemrum), bremse (G), hurtig spoling (Shift), skydning i luften, én
  animeret kæmpetype (lerkæmpe; stor stenkæmpe i bølge 3) med varslede slag og stenkast, svagt punkt i
  nakken, knæfald, død med fald og smuldren, tre bølger, forsyningsdepoter, sejr/nederlag og "Prøv igen".
  Testet: 21 logik-tests i `tests/hunt.test.ts` + browsertest `scripts/hunt-ui-test.mjs` (49 tjek, inkl.
  5 skift frem og tilbage mellem spiltyperne). Ydelse (Necips Chrome, F8): ≈4,2 ms pr. billede med 4 kæmper.
  Krogen og flyvningen er IKKE prøvespillet med rigtig mus af et menneske endnu – kun via tests og tastetryk.
- v0.4 (11.10.2026): ny Kæmpejagt-bane **Ravnsdalen** (standard) – eventyrdal på 208×208×72 med bjerge
  (fire pas), kongeborg på klippe, by, flod med vandfald og stenbro, kæmpeskov, ruiner med Den gamle port,
  marker med tre vindmøller (vingerne er ankerpunkter), fyrtårn og bjergkulisse. Banevalg i menuen.
  Kæmper følger terrænhøjden og vader i floden. Nye blokke: klippe, sne, mossten, skifer, korn, mørke
  blade, grus. Testet: 6 logik-tests i `tests/valley.test.ts` (64 i alt) + `hunt-ui-test.mjs` (57 tjek).
  Ydelse (Necips Chrome, F8, ved startpunktet med 4 kæmper): ≈5,2 ms pr. billede.
- v0.5 (12.10.2026): Ravnsdalen får **Borgporten** med liv (kæmper går efter den; tæt på/skud = de skifter til
  spilleren; falder porten er dalen tabt; repareres 30 % mellem bølger), **dag og nat** over **5 bølger**
  (himmel, sol/måne, stjerner, fakler, oplyste vinduer, glødende øjne, fårekyllinger) og **Bjergkæmpen**
  (variant 'mountain', skala 1,5, 4400 liv) gennem Den gamle port i sidste bølge. Bastionen er uændret
  (3 bølger, dag, ingen port). Testet: 67 logik-tests + `hunt-ui-test.mjs` (60 tjek) + taktisk ui-test.
  Ydelse IKKE målt igen efter v0.5 (Chrome-fanen var skjult, så målingen kunne ikke aflæses).
- v0.6 (12.10.2026): **mobil/tablet** – touch-styring (`src/game/touch.ts`): styrepind der dukker op under
  venstre tommelfinger, kig ved at trække (også mens SKYD/KROG holdes), knapper der trykker virtuelle taster i
  `Input` (`virtualDown`/`virtualUp`, `axisX/axisY`). Ingen pointer lock på touch; pauseknap. Kompakt HUD og
  menuer (`body.touch`, `@media (max-height: 560px)`), "drej telefonen" på højkant, Lav grafik som standard på
  telefoner og 190 m synsvidde på Lav. Indstilling "Touch-knapper" (Auto/Til/Fra). Købsmenuen bygges ikke
  længere om hvert billede (tryk gik tabt). Testet i Chrome-emulering af telefon: `scripts/mobile-test.mjs`
  (30 tjek, flere fingre ad gangen). IKKE testet på en rigtig telefon; ydelse på telefoner ukendt.
- v0.7 (12.10.2026): **opgraderinger, sværhed og rekorder** i Kæmpejagt (`src/hunt/progress.ts`: tal for
  sværhed, mønter, opgraderinger og point; `src/game/records.ts`: top 5 pr. bane+sværhed i localStorage).
  Mønter for kæmper/nakketræf/bølger; opgraderingsmenu (B / OPGRADÉR) kun i pausen – simuleringen står stille,
  mens den er åben. `Hunt(seed, map, difficulty)`. Mobil: pause + lyd slukket ved app-skift (visibilitychange),
  knapstørrelse (CSS-variablen `--u` på `#touch`), vibration, "Vis FPS", "Mål ydelse" i pausemenuen.
  Testet: 75 logik-tests (+8 i `tests/progress.test.ts`) + `scripts/progress-ui-test.mjs` (40 tjek, også touch).
- v0.8 (12.10.2026): **nye kæmpetyper** – `variant` 'runner' (løberkæmpe: egne mål `RUNNER_DIM`, ×2,1 fart, spring
  `windLeap → leap → land` med trykbølge, orange ring ved landingsstedet, jager altid spilleren) og 'thrower' (kaster:
  `THROWER_DIM`, ×0,75 fart, står stille på afstand med frit udsyn og kaster store klippeblokke – `Rock.big` med
  trykbølge – og bombarderer Borgporten fra `throwerGateRange`). Tal i `config/hunt.ts`. Begge baners bølger har dem.
  Testet: 83 logik-tests (+8 i `tests/types.test.ts`, bl.a. spring aldrig gennem huse og trykbølge aldrig gennem mure).
- v0.9 (12.10.2026): ny Kæmpejagt-bane **Saltvig** (`src/hunt/harbor.ts`, 192×192×64, `HG = 4`): havneby i en fjord.
  Rådhusporten er målet (`gate.name` – UI bruger navnet), kaj, pakhuse, brygger (kind 5: gulv i HG, kæmper går på
  dem), 3 skibe (master/rær/sejl – ny blok `SAIL`), kraner, kirke, søfort, fyrtårn, fiskerlandsby, vindmølle.
  Vandet har tre dybder (HG-1/-2/-3 efter afstand til land); kæmper fra havet vader ind gennem sundet (port 0).
  Spilleren flyder op i dybt vand (svømmer). Ny boss-variant 'sea' (Havkæmpen). Kulissen 'fjord' fortsætter
  sundet ud til havet (`buildMountainBackdrop(..., fjord)`). Kæmper glider langs hjørner (x eller z alene), når
  en skrå bevægelse er spærret. Testet: 90 logik-tests (+7 i `tests/harbor.test.ts`).
- v1.0 (12.10.2026): **app (PWA)** – `public/manifest.webmanifest` (fuld skærm, liggende), pixel-ikoner i `public/`,
  service worker `dist/sw.js` genereres af `scripts/make-sw.mjs` (gemmer alle filer; siden net-først, resten cache-først;
  gamle caches slettes). `npm run build:app`. Knappen "Installér som app" i menuen (`beforeinstallprompt`; iPhone:
  vejledning). Én-fils-versionen (`build:single`) har ingen app-links/service worker (`appCapable` i main.ts).
  Hosting: GitHub Pages fra repoet Necipdg/klodskamp via GitHub Actions. Testet: `scripts/app-test.mjs` (13 tjek, bl.a. offline).
- Næste skridt: Necip prøver på sin telefon og prøvespiller. Mulige næste idéer: online multiplayer, flere våben.

## Stack og kommandoer

TypeScript + Vite 6 + Three.js 0.180 (samme opsætning som `Red bilen/`). Skrifter fra @fontsource
(Silkscreen + Barlow Condensed) bundtes med, så alt virker offline.

- `npm run dev`: udvikling · `npm run check`: typetjek · `npm test`: logik-tests (Node, ingen grafik)
- `npm run build:single` → kopiér `dist-single/index.html` til `spil.html` (dobbeltklik-versionen)
- `npm run build:app` → `dist/` med manifest, ikoner og service worker (app-versionen, GitHub Pages)
- `node scripts/app-test.mjs`: browsertest af app-versionen (kræver `npm run build:app` + `npx vite preview --port 4173`)
- `node scripts/ui-test.mjs`: browsertest (kræver `npx vite preview --port 4173`)
- `node scripts/poses.mjs` / `scripts/live.mjs`: skærmbilleder af udvalgte steder / en kamp med autopilot
- `node scripts/hunt-ui-test.mjs`: browsertest af Kæmpejagt og skift mellem spiltyperne
- `node scripts/mobile-test.mjs`: browsertest som telefon (liggende 844×390, touch med flere fingre)
- `node scripts/progress-ui-test.mjs`: browsertest af opgraderinger, sværhed, rekorder, pause ved app-skift (også touch)
- `node scripts/hunt-shots.mjs` / `scripts/giant-poses.mjs`: skærmbilleder af Kæmpejagt / kæmpens animationer
- `node scripts/types-shots.mjs [navne]`: skærmbilleder af kæmpetyperne (løber, kaster) i Bastionen
- `node scripts/valley-tour.mjs '[{"name":..,"pos":{..},"look":{..}}]' [baneId]`: skærmbilleder rundt på en bane (standard Ravnsdalen)

## Arkitektur

- `src/hunt/`: Kæmpejagt UDEN grafik, samme faste tidsskridt. `hunt.ts` (bølger, krog, gas, bevægelse,
  våben, sten, depoter, hændelser), `giant.ts` (kæmpens skelet, animation, hitbokse, opførsel, angreb),
  `giantNav.ts` (A* på gadegitteret med afstand til nærmeste hus – kæmper går aldrig gennem huse),
  `city.ts` (banen Bastionen + fælles `CityMap`-type), `valley.ts` (banen Ravnsdalen), `harbor.ts` (banen Saltvig), `maps.ts` (banevalg),
  `mill.ts` (vindmøllevinger som bevægelige ankerpunkter), `progress.ts` (sværhed, mønter, opgraderinger, point), `tf.ts` (stive transformationer + OBB-stråler – deles af hitbokse og tegning).
  Tal i `src/config/hunt.ts`.
- `src/core/`: al spillogik UDEN grafik, fast tidsskridt 1/120 s. `game.ts` (runder, bombe, våben, skade,
  økonomi, bygning, hændelser), `bot.ts` (adfærd), `nav.ts` (A* på søjlegitteret: fri/hop/skyd-væk/spærret),
  `map.ts` (banen tegnes som søjlekort + pynt: tage, vinduer, døre, bannere, balkoner), `world.ts`
  (voxels, nulstilling mellem runder), `physics.ts` (kasse-kollision), `ray.ts` (voxel-stråler).
- `src/render/`: Three.js. `textures.ts` (16×16 pixel-atlas tegnet i kode), `worldMesh.ts` (klumper à
  16×16 med AO), `characters.ts`/`skins.ts` (blokfigurer, 64×64 skins), `viewmodel.ts` (førstepersons-
  våben i eget rum oven på verden), `guns.ts`, `effects.ts`, `sky.ts`, `backdrop.ts`, `view.ts`. Kæmpejagt: `huntView.ts` (byen, sten, depoter,
  wire, støv), `giantView.ts` (kæmperne – hver kropsdel tegnes med PRÆCIS hitboksens transform). `backdrop.ts` har også
  `buildMountainBackdrop` (fjerne tinder af 4 m-blokke).
- `src/game/`: `audio.ts` (Web Audio, rumlig lyd + dæmpning bag mure), `input.ts`, `touch.ts` (touch-styring), `settings.ts`.
- `src/ui/`: HTML/CSS-brugerflade (`ui.ts`, `huntUi.ts`, `style.css`). `src/main.ts`: spiltype (`mode`),
  tilstande og ÉT rAF-loop. `teardown()` rydder ALT fra den kørende spiltype (kæmper, lyde, tidsur, HUD).

## Faste rammer

- Al tekst i spillet er på dansk. Spil-tal i `src/config/tuning.ts`, våben/økonomi/køb i `src/config/weapons.ts`.
- Bots må aldrig se eller skyde gennem vægge: `perceive()` kræver synsvinkel + frit udsyn, og udsynet
  tjekkes igen i selve skud-øjeblikket. Testet i `tests/bots.test.ts`.
- Faste vægge/gulve kan ikke ødelægges; kun trækasser, træplader (smutvejen), blade, plantekummer og
  sandsække (byggeblokke). Byggeforbud i spawn og på bombeområdet (+1 felt), højst 2 lag, ikke i spillere.
- Banen gendannes ved hver rundestart (`world.reset()`); `world.snapshot()` kaldes kun ved opbygning.
- Efter plantning skal bomben desarmeres, også selvom alle angribere er døde.
- Hændelser (`game.events` / `hunt.events`) er eneste vej fra kernen til lyd/effekter/UI – kernen kender ikke Three.js.
- Kæmpejagt: kæmpernes skade skal passe til det synlige angreb og må aldrig gå gennem bygninger – slag
  kræver frit udsyn fra kæmpens krop (over fødderne) OG fra skulder/bryst; sten er fysiske og stopper i mure.
  Begge varsles (rødt/gult "!" og glødende arm) før de rammer. Testet i `tests/hunt.test.ts`.
- Borgporten: kæmper med `target === 'gate'` går til `city.gate.attack` og slår (skade ved `giantSmash`, kun
  hvis hånden er ved porten). `aggroRange` og `aggroOnHit` i `config/hunt.ts` styrer, hvornår de skifter til spilleren.
- Kæmpetyper: kroppens mål kommer fra `giant.dims` (`giantDims(variant)`) – brug dem, ikke `GIANT_DIM` direkte.
  Løberens spring kræver frit udsyn i 2,5/6/10 m højde mellem start og landing (`leapClear`).
- Opgraderinger virker gennem getters på `Hunt` (`maxGas`, `hookRange`, `magSize()`, `reserveSize()`) – brug dem,
  ikke `HUNT.maxGas`/`HUNT_AMMO` direkte. Sværhed: `hunt.diff` (liv ved spawn, skade i `hurtPlayer`/`damageGate`,
  gang- og kastetempo i `giant.ts`). Sammenstød følger ikke sværheden.
- Dag/nat: `hunt.dayTime()` (0..antal bølger-1) → `GameView.applyDay()` med forudindstillinger i `DAY` (view.ts).
- Baner i Kæmpejagt: kæmper går kun på felter i `open` (gulvhøjde i `floor`, flodleje = G-1). Alt over 1 blok
  og op til 14 m over gulvet spærrer. Den store stenkæmpe (radius 4) skal kunne nå pladsen foran Borgporten
  fra alle fire pas – testet i `tests/valley.test.ts`.

## Test

Headless Chromium kører WebGL med ~1-2 fps (SwiftShader). Brug `window.__kk`: `start(team)`, `begin()`,
`fastForward(sek)`, `autopilot(on)`, `game`, `view`, `state()` – og til Kæmpejagt `startHunt()`, `hunt`,
`huntForward(sek)`, `freeze(on)` (stands simuleringen, men tegn videre – til skærmbilleder). Rigtig ydelse: F8 i spillet (ydelsestest),
F3/F9 viser FPS.
