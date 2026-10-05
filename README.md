# Höyry

Tampere, 1899. Koneet tehtaan alla heräsivät eräänä yönä, ja nyt ne ampuvat
takaisin. Laskeudu työn läpi kerros kerrallaan, ota viholliselta ase jolla se
ampui sinua, ja mene syvemmälle kuin viime kerralla.

**Pelaa: https://vesahyp.github.io/hoyry/**. Toimii puhelimessa ja
selaimessa. Lisää kotinäytölle, niin se aukeaa koko ruudulle.

Peli on suomeksi ja englanniksi, kielen valitsee selain. *In English: the
game follows your browser's language.*

## Miten pelataan

**Puhelimella:** vasen peukalo kävelee. Oikealla peukalolla napautus ampuu
lähintä näkyvää vihollista, veto näyttää tähtäysviivan ja laukaisee kun
nostat sormen. Tähtinappi oikeassa reunassa on supervoima: se täyttyy
osumista, ja sama keltainen palkki näkyy hahmon yllä. Kun se on täynnä,
hahmon ympärillä hehkuu rengas ja pilli soi. Napautus tähtää itse:
supervoima osuu parhaaseen kohteeseen tai joukkoon, ja kultainen tähtäin
näyttää sen jo ennen napautusta. Syöksyn ja hypyn voi myös vetää, ja veto
lukittuu lähimpään viholliseen vedon suunnassa. Oma tähtäin on aina
kultainen ja pyöreä; vihollisen messinkinen katkoviiva on eri asia. Kun
sinulla on kaksi asetta, ⇄-nappi tähden vieressä vaihtaa asetta yhdellä
napautuksella, ja se näyttää aseen johon vaihdat. Myös vasemman yläkulman
asetaskua voi napauttaa. Jokaisen aseen **taso** (kerros jolta se putosi)
on messinkisessä mitalissa taskussa, ⇄-napissa ja maasta löytyvän aseen
kortissa: vihreä mitali on korkeampi kuin kädessäsi oleva, punainen matalampi.
Kortti-nappi ottaa aseen jonka päällä seisot.

**Näppäimistöllä:** WASD kävelee, hiiri tähtää ja ampuu klikillä (pidä
pohjassa). Välilyönti tai hiiren oikea nappi on supervoima. Q tai hiiren
rulla vaihtaa asetta, 1 ja 2 valitsevat taskun. E ottaa lattialla olevan
aseen. Esc pysäyttää pelin.

## Kierros

Kierros on laskeutuminen tehtaan läpi, kerros kerrallaan.

- **Kerros** on yksi areena, pari ruutua leveä. Viholliset tulevat kahdessa
  tai kolmessa aallossa. Viimeisen kaaduttua hissi avautuu.
- **Hissi** on ainoa tauko. Astu siihen ja valitse yksi kolmesta
  **rattaasta**: pysyvä sääntömuutos loppukierrokselle. Esimerkkejä: joka
  luoti pomppii seinästä, osumat sytyttävät palon, supervoima latautuu
  kolmanneksen nopeammin.
- **Joka viides kerros on pomo.** Jokainen pomo pudottaa aseen, joka on
  violetti tai parempi.
- **Kuolema päättää kierroksen.** Tulos on syvin kerros, sitten aika.

## Tulostaulu

Kun kierros päättyy toisessa kerroksessa tai syvemmällä, peli kysyy kolme
nimikirjainta kuin flipperi ja näyttää sijasi tänään, tällä viikolla, tässä
kuussa ja kaikkien aikojen listalla. Alkuvalikon **Tulostaulu** näyttää
kunkin listan 25 parasta; oma paras on korostettu, ja listan ulkopuolella
se näkyy sijoineen listan alla. Järjestys on kerros, sitten aika. Päivä
vaihtuu keskiyöllä Suomen aikaa, viikko maanantaina. Tulos tallentuu aina
myös laitteelle, vaikka verkkoa ei olisi.

## Aseet

Ase on **tyyppi** × **valmistaja** × **harvinaisuus**, ja nimi syntyy
kaikista kolmesta.

| Tyyppi | Laukaus |
|--------|---------|
| Revolveri | yksi nopea luoti, pitkä kantama |
| Haulikko | haulien viuhka, lyhyt kantama, armoton läheltä |
| Kivääri | pitkä ohut luoti, lävistää |
| Mörssäri | lentää seinien yli ja räjähtää maaliin |
| Höyrykeihäs | lyhyt kartio, osuu kaikkeen sisällään, polttaa höyryllä |
| Sirkkeli | levy, joka pomppii seinistä |

| Valmistaja | Sääntö |
|------------|--------|
| Paukku & Poika | iso vahinko, hidas, kaksi lipasta. Ei temppuja. |
| Kipinä | laukauksissa on alkuaine: tuli polttaa, sähkö hyppii, pakkanen hidastaa |
| Rattaanpää | jokainen laukaus on sarja |
| Heittola | kun ammukset loppuvat, ase heitetään. Se räjähtää ja käteen tulee uusi |
| Torpeedo | jokainen laukaus räjähtää |
| Kellosepät | kellokoneisto kääntää laukauksen kohti vihollista |

Harvinaisuus näkyy värinä ja nostaa vahinkoa ja osien määrää: **romu**
(harmaa), **tavallinen** (vihreä), **harvinainen** (sininen), **eepos**
(violetti), **legenda** (oranssi). Legendat ovat nimettyjä ja rikkovat yhden
säännön: **Kahvipannu** ampuu kuumaa kahvia joka parantaa sinua,
**Käkikello** ampuu joka kuudennella laukauksella käen joka ei luovuta,
**Mummon sateenvarjo** torjuu luodit edestäsi kun et ammu, **Kiuas** jättää
löylyn joka polttaa ja parantaa, **Tukkijätkä** pomppii seinistä kahdeksan
kertaa pysähtymättä viholliseen, **Höyryveturi** menee kaiken läpi ja jättää
palavan raiteen, **Voimalaitos** hyppää jokaisella osumalla kolmeen
viereiseen, **Leipälapio** hajoaa heitettynä kahdeksaksi pomppivaksi
palaksi.

Mitä vihollinen ampui sinua, sen saat kun se kaatuu.

## Sankarit

| Sankari | Aloitusase | Supervoima |
|---------|------------|------------|
| Nuohooja | haulikko (Paukku & Poika) | Nokisyöksy: syöksy kohteen läpi, osuu matkalla, noki räjähtää perillä ja jättää pilven |
| Konemestari | revolveri (Rattaanpää) | Tykkitorni: oma torni ampuu samalla aseella yhdeksän sekuntia |
| Ilmalaivuri | mörssäri (Torpeedo) | Ilmahyppy: hyppää suurimman joukon keskelle ja laskeutuu iskuun |
| Seppä | höyrykeihäs (Kipinä) | Alasin: loikka joukon keskelle, isku heittää viholliset kauas, sitten suoja |

## Tehdas

Viholliset näkevät ja väistävät, mutta tila itsessään on myös vastustaja.
**Rikkaruoho** lattiassa piilottaa sinut, kunnes ammut tai joku tulee
lähelle. **Laatikot** hajoavat muutamasta osumasta. **Tynnyrit** räjähtävät
ja sytyttävät vierekkäiset. **Höyryventtiilit** puhaltavat höyryä ajoittain
ja polttavat ihon. **Koski** lattiassa estää kävelyn muttei pysäytä luotia, joten
ammu sen yli.

Vihollisen luoti on iso ja hidas, ja askel sivuun väistää sen. **Kellosepät-
aseen laukaus** on messinkinen, tikittää lähtiessään, ja ampuja tähtää ensin
messinkisellä katkoviivalla. Se kaartaa perääsi, mutta kääntyy hitaasti,
lentää viimeisen matkan suoraan ja putoaa kantamansa päässä: askel sivuun
viime hetkellä riittää, ja oma luotisi rikkoo sen ilmassa. Kellosepät-ampujia
on kerralla vain yksi, eikä yhtään ennen kolmatta kerrosta.

## Kehittäjälle

Koodi ja arkkitehtuuri: [`CLAUDE.md`](./CLAUDE.md). Suunnittelu:
[`docs/design.md`](./docs/design.md).

Peli on itsenäinen: `npm ci && npm run build` tuottaa sivuston, joka pyörii
millä tahansa staattisella palvelimella. Kävijäseuranta (`infra/`) on
valinnainen lisä omaan AWS-tiliin; sen osoite annetaan käännöksen
ympäristössä, ks. `TRACKING.md`. Lisenssi: MIT (`LICENSE`), eli saat
käyttää, muokata ja jakaa vapaasti, ilman takuuta.

---

## In English

**Höyry** (Finnish for "steam") is a twin-stick looter shooter: Tampere,
1899, a mill town on the rapids where the machines woke up one night. Shoot
your way down through the works, floor by floor, taking the gun each enemy
shot you with.

**Play: https://vesahyp.github.io/hoyry/**

**Touch:** left thumb walks. Right thumb: tap fires at the nearest enemy you
can see, drag shows an aim line and fires on release. The star button on
the right edge is your super. Hits charge it, and the same yellow bar shows
over your hero; when it is full a ring glows round the hero and a whistle
blows. A tap aims it for you: the super goes for the best enemy or group
in reach, and a gold sight shows where before you tap. The dash and the
leap can also be dragged, and a drag locks onto the nearest enemy near
its line. Your own sight is always gold and round; the enemy's brass dashed
line is a different thing. With two guns, the ⇄ button beside the
star swaps with one tap and shows the gun you swap to. The gun slots at the
top left still swap on a tap too. Every gun's **level** (the floor it dropped
on) sits in a brass medal on its slot, on the ⇄ button and on the card of a
gun on the floor: a green medal is higher than the gun in your hand, a red
one lower. The card button takes the gun you are standing on.

**Keyboard:** WASD walks, the mouse aims and fires on click (hold to keep
firing). Space or right click is the super. Q or the scroll wheel swaps
guns, 1 and 2 pick a slot. E takes one off the floor. Esc pauses.

**The loop:** a floor is one arena with two or three waves of enemies. Kill
the last one and the lift opens, never before. Ride it and pick one of
three cogs, a permanent rule change for the rest of the run. Every fifth
floor is a boss, and every boss drops a purple gun or better. Death ends
the run; the score is the deepest floor, then the time.

**Leaderboard:** a run that ends on floor 2 or deeper asks for three
initials, like a pinball machine, and shows your rank for today, this week,
this month and all time. **Leaderboard** on the title screen lists the top
25 of each; your best is highlighted, and when it is off the list it shows
below with its rank. Ranked by floor, then time. The day changes at midnight
Finnish time, the week on Monday. The score is also kept on the device, with
or without a network.

**Guns** are a type (revolver, scattergun, rifle, mortar, steam lance,
sawblade) times a maker (Paukku & Poika for raw damage, Kipinä for an
element, Rattaanpää for bursts, Heittola for a thrown gun that explodes,
Torpeedo for a gun where every shot explodes, Kellosepät for homing shots)
times a rarity (grey, green, blue, purple, orange). Orange guns are named
and break a rule: the Coffee Pot heals you, the Cuckoo Clock's sixth shot
will not give up, Granny's Umbrella blocks shots while you hold your fire,
and four more.

**Enemy shots** are big and slow, and a sidestep beats them. A **clockwork
(Kellosepät) shot** is brass, ticks as it leaves the gun, and the gunner aims
first with a brass dashed line. It curves after you, but it turns slowly,
flies straight for the last stretch and drops at the end of its range: a late
sidestep dodges it, and one of your own bullets breaks it in the air. Only one
clockwork gunner at a time, and none before floor 3.

**Heroes:** the Sweep (scattergun, dashes through the target and bursts
into soot), the Engineer (revolver, drops a turret), the Aeronaut (mortar,
leaps onto a group and stomps), the Smith (steam lance, hops in, slams and
shields).

**The works fight back too:** weeds hide you until you fire, crates break,
barrels explode and chain, steam vents scald on a timer, and the rapids
block walking but not a bullet fired over them.
