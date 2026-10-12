# Prompts til Klodskamp

## 1. Oprindelig spilbeskrivelse (fra ChatGPT, 11.10.2026)

Du skal bygge et selvstændigt, spilbart 3D-spil, der kombinerer Minecrafts blokbaserede verden med Counter-Strikes taktiske skudkampe. Det skal køre i browseren på en computer med mus og tastatur.

Det er et selvstændigt spil med eget navn og original grafik. Brug Minecraft og Counter-Strike som inspiration til udtryk og spilmekanik, men brug ikke deres logoer, baner, lyde eller andre originale assets.

**Idéen**

Forestil dig en taktisk skudkamp i en verden bygget af blokke. Spilleren bevæger sig i førsteperson gennem en kompakt bane med bygninger, gange, åbne områder og dækning. To hold kæmper i korte runder, køber våben og forsøger at plante eller desarmere en bombe.

Spillet skal først og fremmest føles som et godt skydespil. Bygning og ødelæggelse skal skabe taktiske muligheder uden at gøre kampene kaotiske.

**Første spilbare version**

Byg en gennemført lokal prototype med én menneskelig spiller og bots: 3 mod 3, hvor spilleren har to bots på sit hold og møder tre modstandere. Online multiplayer er en senere udvidelse.

Prototypen skal indeholde:

1. **Førstepersonsstyring**
   - WASD til bevægelse, mus til at kigge og sigte, mellemrum til at hoppe.
   - Venstre museknap til at skyde, R til at genlade og taltaster til at skifte udstyr.
   - Pointer lock, ordentlig kollision og en pausemenu, som frigiver musen.
   - Behagelig og responsiv bevægelse med tydelig feedback ved træffere.

2. **Taktiske skudkampe**
   - Pistol og automatisk riffel med forskellige egenskaber.
   - Ammunition, genladning, skudkadence, rekyl og større spredning under bevægelse.
   - Liv, skade, død og tilskuertilstand indtil næste runde.
   - Vægge og dækning skal blokere skud.
   - Synligt våben, mundingsglimt og enkle lyde, så kampene føles levende.

3. **Rundebaseret bombemode**
   - To hold: angribere og forsvarere.
   - Én bombe og ét tydeligt markeret bombeområde i første version.
   - Angriberne vinder ved at få bomben til at eksplodere eller eliminere forsvarerne.
   - Forsvarerne vinder ved at desarmere bomben, lade rundetiden udløbe uden plantning eller eliminere angriberne, før bomben er plantet.
   - Efter plantning skal forsvarerne stadig desarmere bomben, selv hvis alle angribere er elimineret.
   - Plantning og desarmering kræver, at man holder interaktionsknappen nede i nogle sekunder tæt på målet.
   - Kort købsfase, rundetimer, tydelig rundevinder og automatisk start på næste runde.
   - Første hold til fem vundne runder vinder kampen.

4. **Enkel økonomi**
   - Startpenge og belønning efter runder.
   - En lille købsmenu til våben, ammunition og byggeblokke.
   - Køb er kun muligt i købsfasen.
   - Hold økonomien enkel og forståelig.

5. **Blokverden med begrænset bygning**
   - En original, kompakt bane med to alternative ruter til bombeområdet.
   - Et tydeligt voxeludtryk med blokbygninger, trækasser, sten, træ og grønne områder.
   - Banens vigtigste vægge og gulve er faste.
   - Udvalgt dækning kan ødelægges med skud.
   - Spilleren kan placere et begrænset antal blokke som midlertidig dækning.
   - Vis en forhåndsvisning af blokplacering, og afvis placering inde i spillere, faste objekter, spawnområder og bombeområdet.
   - Gendan banen mellem runder.
   - Undlad crafting, minedrift og en uendelig verden i første version.

6. **Bots, der kan gennemføre en runde**
   - Bots skal kunne bevæge sig rundt på banen, opdage modstandere gennem synslinjer, skyde og tage skade.
   - De må ikke se eller skyde gennem vægge.
   - Angribende bots skal kunne føre bomben frem og plante den; forsvarende bots skal kunne desarmere den.
   - Bomben skal kunne samles op, hvis bæreren bliver elimineret.
   - Bots skal kunne håndtere placerede blokke, eksempelvis ved at vælge en anden rute eller skyde den ødelæggelige dækning væk.
   - Brug gerne et enkelt waypoint-system og overskuelige adfærdstilstande.

**Visuel retning**

Skab et indbydende, stiliseret blokunivers med varme sandfarver, grønt, træ og tydelige holdfarver. Brug god belysning og skygger, så banen får dybde.

Interfacet skal være enkelt og læsbart: sigtekorn, liv, ammunition, penge, rundetid, holdscore og bombestatus. Vis en kort introduktion til styringen og tydelige beskeder om plantning, desarmering og rundens udfald.

Prioritér flydende gameplay, overskuelighed og en sammenhængende visuel stil.

**Sådan skal du arbejde**

Undersøg først den eksisterende projektmappe, og genbrug relevant opsætning. Hvis projektet er tomt, skal du vælge en enkel, passende teknisk løsning, eksempelvis TypeScript, Three.js og Vite.

Start med en kort implementeringsplan og gå derefter direkte i gang. Jeg ønsker et fungerende spil, ikke kun en beskrivelse, en flot menu eller en statisk demonstration.

Byg i denne rækkefølge:
1. Bane, førstepersonsstyring og kollision.
2. Våben, skud, skade og én modstander.
3. Hold, bots og en fuld runde med bombe.
4. Økonomi, køb, bygning og ødelæggelse.
5. Grafik, lyd, brugerflade og fejlrettelser.

Brug fornuftige standardvalg uden at spørge mig om alle detaljer. Hvis omfanget bliver for stort, skal du først sikre en komplet spilbar kamp og bagefter tilføje resten. Forklar tydeligt eventuelle mangler.

**Kontrollér resultatet**

Kør og afprøv spillet, og kontrollér konkret, at:
- Man kan starte og afslutte en kamp fra brugerfladen.
- Bevægelse, kollision, skud og genladning fungerer.
- Dækning blokerer skud, og bots respekterer synslinjer.
- Bomben kan plantes, eksplodere og desarmeres med korrekte udfald.
- Rundeskift nulstiller spillere, bombe og bane.
- Penge og køb fungerer uden negative beløb.
- Byggeblokke ikke kan placeres ulovligt.
- Kampens vinder vises, og man kan starte forfra.

Afslut med en kort forklaring på, hvordan jeg starter spillet, styringen, hvad du har afprøvet, og eventuelle kendte begrænsninger. Påstå ikke, at noget er testet, hvis du ikke har testet det.

## 2. Præcisering: kreativ retning og kvalitet (11.10.2026)

Dette er en præcisering af den oprindelige spilbeskrivelse. Behold grundidéen og funktionerne fra den første prompt, men lad nedenstående styre den kreative retning, det visuelle ambitionsniveau og rækkefølgen i arbejdet. Hvis noget strider mod den første prompt, gælder denne præcisering.

**1. Undersøg den konkrete reference**

Jeg er inspireret af Nick Saraevs “Attack on Titan TitanCraft”. Jeg har selv spillet det og synes, at grafikken og designet er meget godt lavet.

Spillet:
https://attack-on-titancraft.netlify.app/

Video om projektet:
https://www.youtube.com/watch?v=LD0NxqDcDiY

Åbn spillet med dit browserværktøj, start det, og undersøg selve gameplayet. Se især på:
- Blokverdenens proportioner, teksturer og detaljer.
- Belysning, skygger, farver og dybde.
- Figurer, animationer og bevægelse.
- Effekter, visuel feedback og brugerflade.
- Hvordan de to inspirationskilder føles som én sammenhængende spiloplevelse.

Beskriv kort, hvad du konkret observerer, og hvilke kvaliteter du vil overføre til vores spil. Skeln mellem det, du kan se, og dine egne designvalg.

Hvis du ikke kan åbne eller spille referencen, skal du fortælle mig det og bede om screenshots eller en kort gameplayoptagelse, før du fastlægger den visuelle retning. Gæt ikke på reference-spillets udseende.

**2. Vores spil: Minecraft møder Counter-Strike**

Vi laver et selvstændigt browserspil med eget navn, originalt banedesign og egne eller lovligt tilgængelige assets.

Spilleren skal straks tænke:
“Jeg spiller et taktisk Counter-Strike-lignende skydespil inde i en Minecraft-lignende verden.”

Minecraft-inspirationen skal være tydelig i kubiske omgivelser, blokbyggede huse, pixelerede overflader, kantede figurer og mulighederne for at placere og ødelægge udvalgte blokke.

Counter-Strike-inspirationen skal styre kampene: præcis førstepersonsskydning, våbenkøb, to hold, korte runder, én chance per runde og et bombemål, som kræver angreb eller forsvar.

De to dele skal hænge sammen i gameplayet. Eksempelvis skal man kunne:
- Skyde træblokke i stykker for at fjerne fjendens dækning.
- Placere begrænset dækning, mens en holdkammerat planter bomben.
- Bryde gennem en udvalgt væg for at åbne en alternativ angrebsvej.

Design banen omkring disse muligheder. Bevar faste strukturer og begrænsninger, så bygning og ødelæggelse ikke ødelægger banens balance eller gør bombemålet utilgængeligt.

**3. Grafik og design er hovedkrav**

Når jeg siger “prototype”, mener jeg en lille, gennemført spiloplevelse. Grafik, animationer, lyd og brugerflade er centrale dele af leverancen fra starten.

Mit mål er samme niveau af visuel omhu og sammenhæng som i reference-spillet. Du skal ikke kopiere dets indhold, men bruge det som konkret kvalitetsreference.

Skab én tydelig visuel identitet:
- Pixelerede teksturer med ensartet pixelskala og skarp gengivelse.
- Blokbyggede omgivelser med gennemtænkte proportioner.
- Sammenhængende materialer, farver og detaljer.
- God belysning, passende skygger og tydelig dybde.
- Modstandere og holdfarver, som er lette at aflæse.
- Et miljø, der føles designet og beboet.

Et muligt udgangspunkt er en solbeskinnet by med sandstensbygninger, gårdrum, smalle passager, trækasser, balkoner og grønne planter. Tilpas retningen efter din undersøgelse af referencen, og vælg én sammenhængende stil.

Miljødetaljerne skal understøtte stemningen og samtidig bevare klare sigtelinjer og overskuelige kampe.

**4. Våben, figurer og bevægelse**

Førstepersonsvåbnet fylder meget på skærmen og skal derfor prioriteres visuelt. Lav en veludført model med synlige hænder eller arme, passende proportioner og en stil, som passer til blokverdenen.

Tilføj:
- Animationer til skydning, genladning og våbenskift.
- Diskret bevægelse af våbnet, når spilleren går.
- Mundingsglimt, rekyl, træfeffekter og passende lyd.
- Korte materialetilpassede partikeleffekter, når blokke ødelægges.
- Genkendelige blokfigurer med holdfarver, taktisk udstyr og tydelige bevægelsesanimationer.

Hold kameraeffekter diskrete. Sigtning og bevægelse skal føles præcise og behagelige.

**5. En sammenhængende brugerflade**

Lav en gennemført startskærm, købsmenu, pausemenu og et diskret HUD. Typografi, ikoner, knapper og farver skal følge samme visuelle stil.

Spilleren skal hurtigt kunne aflæse:
- Liv og ammunition.
- Penge og valgt våben.
- Holdscore og rundetid.
- Bombens status.
- Fremskridt ved plantning og desarmering.

Giv tydelig feedback ved rundestart, sejr, nederlag og kampens afslutning. Vis styringen kort og forståeligt, så man hurtigt kan begynde at spille.

**6. Byg først en lille del i den ønskede kvalitet**

Undersøg den eksisterende projektmappe, og bevar relevant arbejde. Hvis noget allerede er implementeret fra den første prompt, skal du bygge videre på det.

Efter referenceundersøgelsen skal du give en kort plan og fortsætte med implementeringen.

Første milepæl er en lille, spilbar del af banen med:
- Gennemarbejdede teksturer, materialer og belysning.
- Førstepersonsstyring og korrekt kollision.
- Ét visuelt gennemført våben med skud og genladning.
- Én modstander.
- Udvalgte blokke, som kan ødelægges.
- Begrænset mulighed for at placere dækning.
- Grundlæggende lyd og HUD.

Denne del skal fastlægge kvalitetsstandarden for resten af spillet. Fortsæt derefter til den komplette lokale kamp med bots, bomberunder, økonomi og våbenkøb fra den første prompt.

Hvis omfanget bliver for stort, skal du reducere antallet af våben, banens størrelse og ekstra funktioner, før du sænker kvaliteten af kerneoplevelsen. Fortæl tydeligt, hvilke funktioner du eventuelt udsætter.

Online multiplayer er stadig en senere udvidelse.

**7. Grafik og ydelse skal fungere sammen**

Spillet skal køre flydende i browseren på en almindelig computer. Brug effektive løsninger til blokgeometri, teksturer, skygger og partikler.

Tilbyd en enkel indstilling for grafikkvalitet, hvis de visuelle effekter kræver det. Prioritér stabil bevægelse og responsiv skydning.

Vælg teknologien ud fra opgaven og den eksisterende projektopsætning. Implementeringen skal være overskuelig nok til, at spillet kan udvides senere.

**8. Kontrollér det faktiske resultat**

Åbn spillet i browseren og afprøv både udseende og gameplay. Kontrollér:
- Om den visuelle stil hænger sammen på tværs af bane, våben, figurer og menuer.
- Om teksturer og skygger vises korrekt.
- Om våben og figurer skærer gennem omgivelserne.
- Om modstandere og vigtig information er tydelige under kamp.
- Om bevægelse, animationer og effekter fungerer i praksis.
- Om bygning og ødelæggelse skaber brugbare taktiske muligheder.
- Om de funktionelle krav fra den første prompt stadig er opfyldt.

Brug screenshots til at vurdere komposition og visuel sammenhæng, og test bevægelse og kampe direkte i spillet. Ret tydelige fejl, før du afleverer.

Afslut med, hvordan jeg starter spillet, hvad du faktisk har testet, og hvilke begrænsninger der er tilbage. Påstå ikke, at resultatet matcher reference-spillets kvalitet, uden at have undersøgt og sammenlignet dem.

Målet er en lille, flot og sammenhængende spiloplevelse, hvor Minecrafts blokverden og Counter-Strikes taktiske kampe føles som ét spil.