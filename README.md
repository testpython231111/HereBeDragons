# Here Be Dragons — kildekode (v3.2)

Et daglig geografispill: sju prompts, du skriver et land eller en by, flagget dukker opp når navnet er gjenkjent, og etter hvert svar lyser kartet opp med hvor alle andre svarte. Jo færre som valgte samme sted, jo lenger «off the beaten path» kommer du.

Kartet er tegnet som et gammelt sjøkart (etter Ortelius og Olaus Magnus): pergament, håndkolorerte land, skraverte kyster med vannlinjer, innsjøer og elver, ovalramme, kompassroser med kurslinjer, latinske havnavn og en tittelrull. Det er fortsatt geografisk riktig, og pyntene ligger bare i åpent hav, så ingen grenser blir dekket. Trykk på et land (eller en innsjø) på kartet for å se navnet; på resultatet står det også om landet passet prompten og hvor mange som valgte det. Lyden (fjærpenn, pergament, voksegl, lutt og skipsklokke) er syntetisert i nettleseren og kan slås av med klokken øverst.

Hele spillet er én HTML-fil, `build/here-be-dragons.html`, bygget fra filene under.

| Fil | Hva den gjør |
| --- | --- |
| `src/page.html` | Oppsett av siden: topplinje med fremdrift, kartflate, panelene (intro, spill, avsløring, oppsummering), ark for regler, statistikk og delingsbilde |
| `src/style.css` | Utseende: pergamenttema med blekk og madder-rødt, IM Fell English (overskrifter) + EB Garamond (tekst) |
| `src/engine.js` | Reglene: prompt-maler, automatisk validering, navnegjenkjenning (mange språk, skrivefeil), Maskinen (1 000 simulerte spillere), poeng, skjult plass med ledetråd (dragen), daglig plan. Kjører både i nettleseren og i Node |
| `src/app.js` | Spillflyten: skriving og flagg, nedtelling, avsløring med varmekart (canvas) og etiketter, oppsummering, deling (tekst og PNG), delt database på claude.ai, lyd (Web Audio) og trykk-for-navn på kartet |
| `data/` | Ferdigbygde data: `countries.json`, `cities.json` (10 591 steder), `flags.json` (236 flagg), `world.topo.json`, `schedule.json`, `flag_cov.json`, `antique.json` |
| `scripts/` | Datapipelinen som lager `data/` fra åpne kilder |
| `scripts/antique.js` | Lager `data/antique.json`: pyntene som SVG (tittelrull, kompassrose, segl, og galeonene, sjøormen og hvalen fra `ornaments.js`), hvor de og havnavnene står, og fargeleggingen med fem farger der naboland aldri får samme farge |
| `scripts/make_water.js` | Legger innsjøer, innlandshav og elver inn i `data/world.topo.json` uten å røre landene: 281 innsjøer fra Natural Earth 1:10m (alle med rang 0–3, de store med rang 4–5, store magasiner og noen kjente små) med engelske navn, og 359 elver fra 1:50m med rang 1–6 |
| `scripts/ornaments.js` | Tegningene av galeonen, sjøormen og hvalen: originale SVG-er i kobberstikk-stil (blekkstrek, skravering, få fargelag), hver sentrert om sitt eget punkt og vendt mot høyre |
| `scripts/test_clues.js` | Skriver ut dragens ledetråd for hver prompt de første dagene, og statistikk for hele planen |
| `test/run.js` | Spiller hele dagen i headless Chromium (mobil, kort mobil med tastatur, iPhone SE, desktop), tester skrivefeil, territorier, tidsavbrudd og omlasting, og lagrer skjermbilder |
| `test/perf.js` | Måler tiden per bilde i headless Chromium med 4× CPU-struping (intro, avsløring, zoom, dra, zoom ut) på mobil og desktop |

## Dragen og ledetråden

De fleste prompter skjuler ett sted, dragen. Under prompten står én kort rød linje, «🐉 Hidden place: in East Asia», laget automatisk fra det skjulte stedets egne data.

- **Slik lages ledetråden** (`E.makeClue`): spillet prøver først én opplysning om stedet (kontinent eller region, første bokstav, antall naboland, folketall, breddegrad, land, ved havet, hovedstad, Middelhavet, flaggfarge, språk, areal) og deretter par av opplysninger fra ulike familier. Den korteste ledetråden som lar mellom `CLUE_MIN` og `CLUE_MAX` (4–12) riktige svar passe, vinner; ved likt antall deler vinner den mest naturlige typen og et antall nær 6–8. Opplysninger som gjentar prompten, eller som alle riktige svar deler, brukes aldri. For byer telles bare byer fra Natural Earth-atlaset, altså steder man kan resonnere seg fram til.
- **Valg av skjult sted** (`E.pickJackpot`): det vanlige valget beholdes når det har en brukbar ledetråd; ellers prøves de andre kandidatene. Prompter med flere enn `CLUE_MAX_VALID` (600) riktige svar, og de sjeldne uten brukbar ledetråd, får ingen drage den dagen (`j` er `null` i `schedule.json`). Over hele planen på 400 dager får 95 % av promptene en drage.
- **Et veddemål**: `CHASE` (15 %) av Maskinen jakter på ledetråden og fordeler seg på stedene som passer, så de blir populære fra første spiller og faller gjerne til Backpacker eller Too Clever. Maskinen finner dragen i snitt i rundt 3,5 % av tilfellene.
- **Avsløringen** har tre utfall: du fant den (Off the Map, +1 500 km og dragen på flagget ditt på kartet), nesten («Your Burkina Faso matched the clue too», vanlig poengsum), eller du så bort fra den (som før). Ledetråden og hvor mange steder som passet står under.
- Regionene (`REGIONS` i `engine.js`) har bare land som klart hører til, så en ledetråd aldri henger på en omstridt definisjon. Kontinent i en ledetråd er der landet hovedsakelig ligger (Frankrike er i Europa), selv om kontinent-promptene er rausere.
- **Kontinent-promptene er rause**: Frankrike teller for Afrika (Réunion og Mayotte) og USA for Oseania (Hawaii). Maskinen gir likevel slike svar sjelden; før v3.2 toppet Frankrike «A country in Africa» og USA «A country in Oceania», med varmekart over Frankrike og USA. Land som bare passer gjennom en fjern del (Frankrike, Spania, USA, Chile, Nederland) får 4 % av vanlig vekt og blir aldri skjult sted. Russland for Asia og Tyrkia for Europa får halv vekt, andre land som krysser en kontinentgrense (Egypt, Kasakhstan, Kaukasus …) 20 %. Svarer du «France» på en Afrika-prompt, er det altså sjeldent og gir god poengsum, helt til ekte spillere hoper seg på det (da blir det Too Clever).

Endrer du reglene for ledetråder eller Maskinen, bygg planen på nytt (`node scripts/test_schedule.js`), siden valget av skjult sted avhenger av dem. `node scripts/test_clues.js 7` viser resultatet. I v3.2 er de skjulte stedene fra dag 3 valgt på nytt med den rettede Maskinen; dag 1 og 2 er beholdt slik de ble spilt (en full ombygging ville byttet dragen i siste prompt på dag 2).

## Bygge på nytt

Kildedataene lastes ned til `raw/` (ikke med i pakken).

```bash
# 1. pakker
mkdir -p raw/npm raw/ne raw/geo && cd raw/npm && npm init -y
npm install world-countries flag-icons i18n-iso-countries @resvg/resvg-js svgo topojson-server topojson-simplify topojson-client d3-geo d3@7.9.0 topojson@3.0.2
cd ../geo && npm init -y && npm install all-the-cities
cd ../.. && pip install shapely scipy numpy

# 2. Natural Earth (public domain) fra github.com/nvkelso/natural-earth-vector/geojson
#    ne_50m_admin_0_countries, ne_10m_admin_0_countries, ne_50m_admin_0_tiny_countries,
#    ne_10m_populated_places, ne_10m_coastline, ne_110m_coastline, ne_110m_land, ne_10m_lakes,
#    ne_50m_rivers_lake_centerlines  -> raw/ne/

# 3. data
node scripts/flag_colors.js raw/npm/node_modules/flag-icons/flags/4x3 "$PWD/raw/npm/node_modules/@resvg/resvg-js" data/flag_cov.json
node scripts/geonames_extract.js raw/geo raw/geo/geonames_extra.json
python3 -I scripts/build_data.py raw data
node scripts/flags_pack.js raw/npm data/countries.json data/flags.json
node scripts/make_topo.js raw/npm data 0.45 2e4
node scripts/make_water.js raw/npm raw data     # innsjøer og elver inn i topologien (landene røres ikke)
node scripts/test_schedule.js          # skriver data/schedule.json (400 dager, med skjult sted per prompt)
node scripts/test_clues.js 7           # valgfritt: ledetrådene for de sju første dagene + statistikk
node scripts/antique.js .              # skriver data/antique.json (pynt, havnavn, landfarger)

# 4. siden
node scripts/build_page.js . build/here-be-dragons.html

# 5. test (valgfritt; trenger Playwright og fontene fra @fontsource i raw/fonts)
node test/run.js build/here-be-dragons.html . /tmp/hbd-shots
node test/perf.js build/here-be-dragons.html . /tmp/hbd-perf 4
```

## Kartet og ytelse

Kartet tegnes i canvas (før: SVG med tusenvis av stier, klipping og vannlinjer som ble tegnet på nytt i hvert bilde mens du zoomet).

- **Bilder som glir.** Kartet er bilder stablet oppå hverandre: hele verden (tegnet én gang og gjenbrukt), utsnittet du står i, og blekket (alles svar, én gang for hele verden og én gang for utsnittet). Mens du zoomer eller drar, blir bildene bare flyttet og skalert, og det gjør grafikkbrikken nesten gratis. Kanter som kommer til syne, fylles av verdensbildet.
- **Tegnes ferdig i bakgrunnen.** Når du slipper, tegnes utsnittet skarpt på et skjult lerret, ett lag per bilde (hav og prikker, hver vannlinje, hver fargegruppe av land, linjene, rammen, pynten), og byttes inn når det er ferdig. En rask maskin tar flere lag per bilde og er ferdig på et par bilder; en treg telefon tar ett lag per bilde og hakker ikke. På en rask maskin tegnes også utsnittet et langt drag er på vei mot mens du drar.
- **Bare det som synes.** Kyster og grenser projiseres én gang. Hvert punkt er rangert etter hvor mye det betyr for formen (Douglas–Peucker), så hvert zoomnivå bruker bare punktene som synes på skjermen, og bare for landene og kystbitene som er i bildet. Helt utzoomet tegnes landene som fem fargegrupper i stedet for 239 enkeltland.
- **Blekket** blandes ikke med kartet under (å blande et helt lag koster i hvert bilde av en gest). Fargene er i stedet mørknet med papirfargen, og over land gir det nøyaktig samme utseende.
- Lagene ligger i denne rekkefølgen: hav med prikker, gradnett hver 15°, kurslinjer fra rosene, vannlinjer (fire ringer langs kysten), land med et bredt fargebånd innenfor grensen, innsjøer, grenser, kystlinje, ekvator, vendesirkler og polarsirkler, ovalramme, pynt og havnavn, tittelrull. Pynt og havnavn blekner bort mellom zoom 1,1 og 1,5 så de ikke kommer i veien for svarene.

- **Innsjøer og elver.** Innsjøene fylles med samme hav og prikker som sjøen og får tynne vannlinjer langs bredden når de er store på skjermen; innsjøer under tre piksler hoppes over. Elvene er blå-grå blekklinjer: de store (Amazonas, Nilen, Mississippi …) vises på hele verdenskartet, og flere kommer til jo nærmere du zoomer. Brede elver tegnes som en kanal mellom to blekklinjer.
- **Fargene.** Hvert land får én av fem farger (rosé, oker, grønn, blå, fiolett), aldri den samme som et land det grenser til, møtes i et hjørne med (Botswana og Zambia) eller ligger nærmere enn rundt 25 km over vann, pluss noen par over smale sund. `scripts/antique.js` sjekker dette ut fra kartets egne linjer og fargelegger med DSATUR; alle fem brukes omtrent like mye (48/48/48/48/47). Fyllet innenfor fargebåndet har lik lyshet for alle fem og er spredt jevnt rundt papirets tone (rosé, strå, oliven, gråblå, lilla), så to naboer skiller seg også midt inne i landet: det nærmeste paret har ΔE 7,5, mot 3,5 da fyllet bare var papir med litt av hver farge.
- **Trykk på kartet.** Et trykk testes mot de samme formene som tegnes: innsjøer først, så land, med noen pikslers slark så små øyer kan treffes. Navnet står på en liten pergamentlapp som følger kartet når du zoomer, og landet får en stiplet kant. Trykk igjen, eller på havet, for å fjerne den.

Målt med `test/perf.js`: 4× CPU-struping og programvare-tegning i headless Chromium, altså et verste tilfelle (ekte telefoner og PC-er tegner canvas med grafikkbrikken).

| Gest | v3 (SVG), median / dårligste bilde | v3.2 (canvas), median / dårligste bilde |
| --- | --- | --- |
| Zoom med hjulet, desktop | 100 ms / 467 ms | 16,7 ms / 83 ms |
| Dra kartet, desktop | 100 ms / 400 ms | 16,7 ms / 83 ms |
| Zoom ut, desktop | 183 ms / 633 ms | 16,7 ms / 33 ms |
| Zoom, mobil | 67 ms / 300 ms | 16,7 ms / 117 ms |
| Dra kartet, mobil | 50 ms / 133 ms | 16,7 ms / 83 ms |
| Avsløringen, dårligste bilde (desktop / mobil) | 967 ms / 900 ms | 117 ms / 183 ms |

16,7 ms per bilde er 60 bilder i sekundet.

## Lyd og bevegelse

- **Lyden lastes ikke ned.** Alt lages med Web Audio i det øyeblikket det trengs: fjærpenn når du skriver, en lutt-tone når navnet gjenkjennes, voksegl når du låser svaret, to bank i bordet for et ukjent navn, en klokke som tikker de siste fem sekundene, pergament som rulles ut og en skipsklokke når kartet vises, en skralle mens kilometerne telles, noen toner på lutt etter nivået (synkende for Lost, fire stigende for Uncharted), noe som rører seg i dypet, et horn og klokken for Off the Map, og en lutt-fanfare på oppsummeringen. Luttonene er Karplus–Strong-strenger og klokken er fem deltoner som klinger ut hver for seg; et lite rom (romklang) holder det hele sammen.
- Nettlesere tillater lyd først etter et trykk eller en tast, så det første trykket vekker lyden. Klokken øverst slår lyden av og på, og valget huskes (`hbd.sound` i localStorage).
- **Bevegelsene** bruker bare transform og opasitet, så grafikkbrikken gjør jobben: seglet presses på flagget når du låser, prompten skrives inn fra venstre, klokken slår de siste sekundene, kartet rulles ut før blekket sprer seg, nivåmerket stemples på, resultatet kommer frem linje for linje, flaggene spretter opp fra nålen, fremdriftsstreken fylles med blekk, totalen telles opp og skipet seiler langs skalaen på oppsummeringen, og arkene glir opp. Ingenting av dette kjører for den som har bedt om mindre bevegelse.

## Verdier du kan endre

- `src/engine.js`: `EPOCH` (dag 1 = 26.10.2026), `PROMPTS_PER_DAY` (7), `SECONDS` (20), `MACHINE` (1 000), `JACKPOT_KM` (1 500), `CLUE_MIN`/`CLUE_MAX` (4–12 steder som passer ledetråden), `CLUE_MAX_VALID` (600), `CHASE` (0,15), `REGIONS`, `TIERS`, `MILESTONES`, `FIRST_DAYS` (håndvalgte dager), `SLOTS` (hvor mange gyldige svar hver plass i rekkefølgen skal ha), `WEIGHT` (hvor ofte hver prompt-type kommer), `MAGNET_HINTS` (Maskinens «too clever»-favoritter), `FAME_BOOST` (kjente turistbyer som Natural Earth rangerer for lavt), `CITY_NICK` (kallenavn som NYC, Rio, Saigon).
- `src/app.js`: `SITE_URL` (havner i delingsteksten og på delingsbildet når spillet får egen adresse), `HEAT_ALPHA` (hvor sterkt ett svar lyser på kartet) og `RINGS` (vannlinjene: avstand fra kysten og styrke).
- `scripts/antique.js`: `ornaments` (hvor pynten står og hvor stor den er; `size` måles i enhetene i `unit`).

## Lisenser for data og biblioteker

Natural Earth (public domain), GeoNames via all-the-cities (CC BY 4.0: krever kreditering), world-countries (ODbL 1.0: krever kreditering og at avledede databaser deles på samme lisens), i18n-iso-countries (MIT), flag-icons (MIT), d3 (ISC), topojson (BSD-3), fontene EB Garamond og IM Fell English (SIL Open Font License), lastet fra Google Fonts.
