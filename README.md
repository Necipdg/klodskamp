# Klodskamp

Blokspil i browseren med to spiltyper, der vælges på startskærmen:

- **Taktisk kamp:** 3 mod 3 med bots på banen **Sandgården**. Angriberne skal plante bomben på
  bombeområdet A, forsvarerne skal forhindre det – eller desarmere den. Første hold til 5 vundne runder vinder.
- **Kæmpejagt** (v0.3–v1.1): alene eller op til 4 sammen mod bølger af kæmper. Sving dig mellem tårne, træer, master og tage med en
  krog, brug gas til at booste og bremse, og skyd den glødende krystal i kæmpernes nakke. Tjen mønter og køb
  opgraderinger mellem bølgerne. Tre sværhedsgrader og en rekordliste. Tre baner: eventyrdalen
  **Ravnsdalen** (standard, 5 bølger), havnebyen **Saltvig** (5 bølger) og murbyen **Bastionen** (3 bølger).

## Start spillet

- **Som app (ny i v1.0):** åbn **https://necipdg.github.io/klodskamp/** og tryk **Installér som app** på startskærmen.
  - *Android / computer (Chrome, Edge):* browserens egen installér-dialog kommer frem.
  - *iPhone / iPad (Safari):* tryk på **Del** (⬆︎) → **Føj til hjemmeskærm**.
  - Appen får sit eget ikon, kører i fuld skærm (liggende) og virker uden internet, når den først er åbnet én gang.
    Nye versioner hentes automatisk næste gang appen åbnes med internet. Rekorder og indstillinger gemmes på telefonen.
- **Dobbeltklik:** `spil.html` åbner i din browser – virker også uden internet.
- **Udvikling:** `npm install` og derefter `npm run dev`. `npm run build:app` bygger app-versionen i `dist/`.
  Hvert push til `main` på GitHub bygger og udgiver appen automatisk (`.github/workflows/pages.yml`).

## Tal sammen (ny i v1.3)

- **Stemmechat:** tryk **🎤 Tal sammen** i lobbyen (eller **V** / 🎤-knappen under spillet). Første gang spørger
  telefonen om lov til mikrofonen. Man taler med alle, der også har slået det til. Tryk 🎤 igen for at slå sin
  mikrofon fra (🔇). Holdlisten viser 🔊 ved den, der taler. **Brug høretelefoner** – så undgår I ekko.
- **Hurtige beskeder:** **T** (eller 💬) og vælg: *Hjælp mig!*, *Kæmpe her!*, *Kom herhen* (viser hvor du er på
  radaren), *Pas på!*, *Godt skud!*, *Skal vi opgradere?*. Beskeden ses hos alle under holdlisten.

## Ny åbning og skyd med hele højre side (ny i v1.2)

- Spillet åbner med en titelskærm: kæmpen rejser sig bag bjergene i solnedgangen, og logoet falder ned klods for
  klods. Tryk for at spille (på telefonen går spillet samtidig i fuld skærm). På højkant vises samme scene med en
  drejende telefon.
- **Telefon, højre side:** standard er *Kun kig* (fra v1.3.1): træk for at kigge og sigte, skyd med SKYD. Med *Auto-skyd*
  skyder du i Kæmpejagt af dig selv, så længe sigtekornet er rødt på en kæmpe. Indstillinger → Højre side (touch): *Auto-skyd*, *Kig + skyd*
  (skyder hele tiden, mens fingeren er på højre side) eller *Kun kig* (skyd med SKYD-knappen).

## Skarpere billede på telefonen (ny i v1.1.1)

- **Indstillinger → Skarphed**: *Auto* (standard) tegner så skarpt som telefonen kan nå med jævn billedhastighed og går
  selv et trin ned, hvis det hakker. *Lav/Mellem/Høj* låser skarpheden. Grafik (Lav/Mellem/Høj) styrer nu kun
  skygger, skyer og synsvidde. Tryk F3/"Vis FPS" for at se den aktuelle skarphed.
- **Skyd og sigt med samme tommelfinger**: hold SKYD (eller KROG) og træk – knapperne er mærket med ✥.

## Spil sammen (ny i v1.1)

Kæmpejagt for 2–4 spillere på samme hold – fx hele familien på hver sin telefon, tablet eller computer.

1. Værten vælger **Kæmpejagt → Spil sammen**, skriver sit navn og vælger bane og sværhed → **Opret rum**.
2. Spillet viser en kode (fx `K5JXM`) og et link. Tryk **WhatsApp**, **Del …** eller **Kopiér link** og send det.
3. De andre trykker på linket, skriver deres navn og trykker **Gå ind**. De dukker op i værtens liste.
4. Værten trykker **Start jagten**. Man kan også komme med midt i en jagt ved at åbne linket.

- Mønter og opgraderinger er **fælles**: alle kan købe i menuen mellem bølgerne, og alle får niveauet.
- Bliver man slået ud, er man **tilbage efter 10 sekunder** ved startpunktet. Jagten er først tabt, hvis porten
  falder, eller **alle** er nede på samme tid. Kæmperne har 30 % mere liv for hver ekstra spiller.
- Tiden står ikke stille i pausen eller opgraderingsmenuen, når man spiller sammen.
- Øverst til venstre under radaren står holdet med liv; medspillerne ses som pile på radaren og med navn over hovedet.
- Teknik: telefonerne forbindes **direkte** med hinanden (WebRTC via PeerJS). PeerJS' gratis server bruges kun til
  at finde hinanden; der er ingen konto og intet der gemmes. Værten kører kæmperne og sender en opdatering 15 gange
  i sekundet; hver spiller styrer selv sin egen figur. Alle skal være på nettet.
- Begrænsninger: på nogle mobilnet (især hvis begge er på 4G/5G hos visse selskaber) kan den direkte forbindelse
  ikke oprettes – så hjælper det at være på wifi. Lægger værten telefonen væk, går spillet i stå for alle, indtil
  værten er tilbage. Virker ikke i én-fils-versionen `spil.html` (kun på hjemmesiden/appen).

## Saltvig – havnebyen i fjorden (ny i v0.9)

En havneby inderst i en fjord på 192×192 m med skovklædte bjerge omkring. Fjorden fortsætter ud mellem
bjergene til det åbne hav.

- **Rådhuset** på torvet er målet: kæmperne slår **Rådhusporten** i stykker. Falder den, er byen tabt.
  Du starter oppe på Rådhusets tag med udsigt over torvet og havnen. Klokketårnet er et godt ankerpunkt.
- **Havnen**: kaj med lygter og pullerter, høje **pakhuse** med gavlene mod vandet og hejsebjælker, to
  **havnekraner**, tre **træbrygger** og tre **skibe** med master, rær og sejl. Masterne er gode
  ankerpunkter for krogen, og man kan lande på dækket.
- **Kirken** med højt spir, et **søfort** på en klippeø, **fyrtårnet** ved sundet, en **fiskerlandsby** på
  stranden mod øst og en **vindmølle** på vestbakken. 6 forsyningsdepoter (bl.a. på Rådhusets tag og på vestbryggen).
- **Kæmperne kommer også fra havet**: de vader ind gennem sundet og op gennem bugten (dybt vand – kun
  hovedet og overkroppen er over vandet). Resten kommer gennem passene mod vest, øst og syd.
- **Svømning**: falder du i dybt vand, flyder du op og svømmer langsomt. Brug krogen for at komme op igen.
- **Fem bølger** fra eftermiddag til nat. I sidste bølge stiger **Havkæmpen** op af fjorden: mørk og
  tangdækket med glødende turkis revner, koralhorn og rurer. Den vader ind gennem sundet.

## Nye kæmpetyper (ny i v0.8)

- **Løberkæmpen** (lys, tynd, lange ben): løber dobbelt så hurtigt som en almindelig kæmpe og hurtigere end dig
  til fods. Når du står på åben grund 11–34 m væk, sætter den sig på hug (orange **!**, "SPRING!") og springer.
  En **orange ring** på jorden viser, hvor den lander – kom ud af ringen. Lige efter landingen rejser den sig
  langsomt op: det er tid til at ramme nakken. Den springer aldrig gennem huse og jager altid dig (ikke porten).
- **Kasteren** (bred, mosgrøn, sæk med klippeblokke på ryggen): går langsomt, bliver stående på afstand, når den kan se
  dig, og kaster store klippeblokke dobbelt så tit som de andre. Blokkene splintres ved nedslaget (skade i et lille
  område – aldrig gennem mure). I Ravnsdalen **bombarderer den Borgporten** på afstand, så den skal fældes hurtigt.
- Begge baner har løbere og kastere med i bølgerne. Første gang en ny type dukker op, forklarer et banner den.
  På radaren er løberen en orange rombe og kasteren en lilla firkant.

## Opgraderinger, sværhed og rekorder (ny i v0.7)

- **Mønter:** lerkæmpe 60 ◆, løber 70 ◆, kaster 90 ◆, stenkæmpe 120 ◆, Bjergkæmpen og Havkæmpen 250 ◆, +4 ◆ pr. træf i nakken og +40 ◆ for hver
  klaret bølge. Mønterne står i bølge-panelet øverst.
- **Opgraderinger** købes i pausen mellem bølgerne: tryk **B** (på telefonen: knappen **OPGRADÉR**). Tiden står
  stille, mens menuen er åben, og "Start bølgen nu" springer resten af pausen over. Hver har 3 niveauer:
  - Større gastank: +25 gas pr. niveau og hurtigere opfyldning
  - Stærkere krog: +12 m rækkevidde og 15 % hurtigere træk/spoling pr. niveau
  - Skarpere kugler: +15 % skade pr. niveau
  - Rustning: 12 % mindre skade pr. niveau
  - Store magasiner: +35 % patroner og 15 % hurtigere genladning pr. niveau
  - I Ravnsdalen og Saltvig også: **Reparér porten** (+25 % liv til Borgporten/Rådhusporten, 90 ◆)
- **Sværhed** (vælges på startskærmen): **Let** (svagere og langsommere kæmper, mindre skade), **Normal** og
  **Svær** (mere liv, hårdere slag, hurtigere kæmper og kast, mere skade på porten). Point ganges med 0,6 / 1 / 1,6.
- **Point:** lerkæmpe 500, løber 700, kaster 800, stenkæmpe 1000, Bjergkæmpen 2500, nakketræf 25, klaret bølge 300 × bølgens nummer.
  Ved sejr: bonus for portens liv, dit liv og tiden.
- **Rekordlisten:** de 5 bedste pr. bane og sværhed gemmes i browseren og vises på slutskærmen og startskærmen.

## Spil på mobil og tablet (ny i v0.6, forbedret i v0.7)

Åbn spillets link på telefonen og vend den vandret (spillet beder om det på højkant). Touch-knapperne slår
til af sig selv på telefoner og tablets – under Indstillinger kan de sættes til Auto, Til eller Fra.

- **Venstre side:** sæt tommelfingeren et sted og træk – en styrepind dukker op, hvor du rører.
- **Højre side:** træk for at kigge og sigte. Du kan også trække, mens du holder SKYD (eller KROG) nede.
- **Kæmpejagt:** SKYD, KROG (hold), BOOST (hop / gas i luften), BREMS, SPOL, ↻ genlad, ⇄ skift våben.
- **Taktisk kamp:** SKYD, HOP, HUK, BRUG (hold: plant/desarmér), KØB (i købsfasen), TAVLE, ↻ og ⇄.
- **II** øverst til højre = pause.
- På telefoner starter grafikken på **Lav** (ingen skygger, kortere synsvidde) for en jævn billedhastighed.
  Android-telefoner går i fuld skærm, når spillet starter. iPhone understøtter ikke fuld skærm i browseren.
- **Nyt i v0.7:** spillet pauser og slukker lyden, når du skifter app eller låser telefonen. Under Indstillinger:
  **Knapstørrelse** (Små/Normale/Store), **Vibration** (Android) og **Vis FPS**. I pausemenuen kan **Mål ydelse**
  måle, hvor mange billeder i sekundet telefonen klarer.

## Styring – taktisk kamp

| Tast | Funktion |
|---|---|
| W A S D | Gå · Shift = gå lydløst · C = hug |
| Mus | Kig og sigt · venstre knap = skyd / placér blok |
| Mellemrum | Hop (én blok højt) |
| R | Genlad |
| 1 2 3 4 5 / musehjul | Riffel/maskinpistol · pistol · kniv · byggeblokke · bombe |
| E (hold) | Plant bomben (på A) / desarmér den |
| B | Købsmenu (kun i købsfasen) |
| G | Smid bomben |
| Tab | Resultattavle |
| Esc | Pause |
| F3 / F9 · F8 | Vis billedhastighed · ydelsestest (i Kæmpejagt med mindst 4 kæmper i billedet) |

## Styring – Kæmpejagt

| Tast | Funktion |
|---|---|
| Højre mus (hold) | Skyd krogen ud og hæng i wiren · slip for at løsne den |
| Shift | Spol wiren hurtigt ind (bruger gas) |
| Mellemrum | Hop · i luften: hold for gas-boost i sigteretningen |
| G (hold) | Bremse-dyser: bremser farten og tager en hård landing (bruger gas) |
| W A S D | Løb · i luften: styr · i wiren: sving og pump farten op |
| Venstre mus | Skyd · R genlad · 1/2 (eller Q/musehjul) riffel/pistol |
| B | Opgraderinger (mellem bølgerne) · 1–6 køber · Enter = start bølgen nu |
| Esc | Pause |

Krogen rækker 70 m (op til 106 m med opgraderinger); under sigtekornet står afstanden (rød "FOR LANGT", når den ikke når).

## Kæmpejagt

### Ravnsdalen (ny i v0.4)

En dal på 208×208 m omkranset af bjerge med sne på toppene. Kæmperne kommer ind gennem fire pas.
Man starter oven på Borgporten med udsigt op ad rampen til borgen.

- **Kongeborgen** på en klippe midt i dalen: ringmur, fire hjørnetårne med skifertage, et 44 m højt borgtårn
  og et porthus. En rampe fører ned til **Borgporten**.
- **Byen** syd for borgen: bindingsværkshuse, et torv med springvand og boder, gyder til kamp fra jorden.
- **Floden** gennem hele dalen med et **vandfald** ud over vestklippen og en **stenbro**. Kæmperne vader
  over floden og bliver langsommere. Man kan selv vade i vandet, og det plasker.
- **Kæmpeskoven** mod nordøst: træer på 22–30 m og en ældgammel eg på cirka 40 m. Man kan svinge sig fra
  stamme til stamme.
- **Ruinerne** mod nordvest: tempelfundament med søjler og murrester. Ved nordpasset står **Den gamle port**,
  en kæmpebue som kæmperne kommer ind under.
- **Markerne** mod vest med korn og tre **vindmøller**. Vingerne drejer, og krogen kan sidde i dem, så man
  bliver båret rundt.
- **Fyrtårnet** højt oppe på østbjerget med en drejende lysstråle, en lille landsby og en frugtplantage.
- 6 forsyningsdepoter: borggården, torvet, skovlysningen, tempelruinen, gården og landsbyen.

**Ny i v0.5 – Forsvar Borgporten, dag og nat, Bjergkæmpen**

- **Borgporten** har liv (bjælken under bølge-tælleren). Kæmperne går efter porten og slår huller i den.
  Falder den, er dalen tabt. Kæmper vender sig mod dig, hvis du kommer tæt på, eller når du skyder på
  dem – så du kan lokke dem væk. Porten repareres lidt i pausen mellem bølgerne.
- **Fem bølger**, og dagen går: formiddag, middag, eftermiddag, solnedgang og nat. Om natten er der
  stjerner og måne, fakler ved porte og huse, oplyste vinduer, fyrtårnets lysstråle, glødende kæmpeøjne og
  fårekyllinger i stedet for fugle.
- **Bjergkæmpen** (cirka 22 m) vågner i sidste bølge og kommer gennem Den gamle port: mørk basalt med
  glødende revner, store horn, mos og små graner på skuldrene.

### Bastionen

- **Bastionen:** 104×104 m murby med 18 m høj bymur, fire porte hvor kæmperne bryder ind, brede gader og
  en stor plads med et klokketårn (pejlemærke), en katedral med spir mod nord, fire vagttårne, en park,
  flade tage at lande på og smalle gyder til kamp fra jorden.
- **Kæmperne** er bygget af kasser (ben, krop, hoved, arme), og hitboksene følger præcis de animerede dele.
  De går kun ad gader, der er brede nok – aldrig gennem huse. Tunge skridt med lyd, støv og rystelser,
  rødt blink ved træf, rystelse ved meget skade på kort tid, knæfald ved skud mod benene, og et fald
  forover med smuldren og støv, når de dør.
- **Angreb med varsel:** et slag med armen (rødt **!** og glødende arm i ca. 1 s før) og et stenkast mod
  spillere i luften eller på tage (gult **!**). Slaget og stenen rammer aldrig gennem bygninger.
- **Svagt punkt:** den glødende krystal i nakken tager 4× skade og giver gyldent træf-tegn og en klar lyd.
- **Bølger:** 1 kæmpe → 2 kæmper + en løber → en stor stenkæmpe + en kaster + en løber. 9 sekunders pause mellem bølgerne.
- **Forsyninger:** grønne lyssøjler på pladsen og på tre flade tage giver fuld ammo og gas og +30 liv
  (fyldes op igen efter 18 s).
- **Man kan ikke vinde ved at svæve:** gassen slipper op, og kæmperne kaster sten mod alt i luften.

## Indhold – taktisk kamp

- Våben: P-9 pistol (gratis), MK-30 maskinpistol ($1250), AR-12 stormriffel ($2700), kniv. Rekyl, spredning
  (mere når man løber eller er i luften), skudkadence, genladning, hovedskud og skudsikker vest ($650).
- Økonomi: $800 ved start, $3250 for vundet runde, $2600 for tabt, $300 pr. drab/plantning/desarmering.
- Bygning: sandsække ($200 for 4, højst 8) som midlertidig dækning. Trækasser, træplader og sandsække kan
  skydes i stykker – smutvejen fra Tunnelen til forsvarergangen er tilmuret og kan skydes op.
- Grafikkvalitet (Lav/Mellem/Høj), musefølsomhed, synsfelt og lydstyrke under Indstillinger.
