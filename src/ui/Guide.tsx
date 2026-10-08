import { useMemo } from 'react';
import { tr } from '../i18n';
import { COGS } from '../game/content/cogs';
import { HEROES } from '../game/content/heroes';
import { RARITY_COLOR, TYPE_NAME, rollGun } from '../game/guns';
import { Rng } from '../game/rng';
import { t } from '../i18n';
import { CogCard, GunCard, Level } from './Cards';

/**
 * How to play: every control drawn with the same elements the game uses
 * (the sticks, the star, the swap button, the slots, the pickup card), so
 * what the guide shows is what the thumb finds. Shown as its own screen
 * from the title and inside the pause menu, through `GuideBody`.
 */

function Pips({ n, full }: { n: number; full: number }) {
  return (
    <div className="pips">
      {Array.from({ length: n }, (_, k) => (
        <i key={k} className={k < full ? 'full' : ''} />
      ))}
    </div>
  );
}

/** A thumbnail of the phone with the zones and buttons where they sit. */
function MiniPhone({ landscape }: { landscape: boolean }) {
  return (
    <div className={`mini ${landscape ? 'land' : ''}`} aria-hidden>
      <div className="zone l">
        <span>{tr('kävele', 'walk')}</span>
      </div>
      <div className="zone r">
        <span>{tr('ammu', 'fire')}</span>
      </div>
      <i className="mslot" />
      <i className="mslot two" />
      <i className="mpause" />
      <b className="mstar">★</b>
      <b className="mswap">⇄</b>
    </div>
  );
}

function Card({ title, demo, wide = false, children }: { title: string; demo: React.ReactNode; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={`gcard ${wide ? 'wide' : ''}`}>
      <div className="demo">{demo}</div>
      <div className="gtext">
        <h3>{title}</h3>
        <p>{children}</p>
      </div>
    </div>
  );
}

export function GuideBody() {
  // Example guns for the cards, from a fixed stream: the guide never touches a run's rng.
  const { held, found } = useMemo(() => {
    const rng = new Rng(1899);
    return { held: rollGun(rng, 1, 0, { type: 'scatter', maker: 'paukku' }), found: rollGun(rng, 4, 2, { type: 'rifle', maker: 'kipina' }) };
  }, []);
  const sweep = HEROES[0];
  const cog = COGS.find((c) => !c.super)!;
  return (
    <div className="guide">
      <Card
        wide
        title={tr('Puhelimella', 'On a phone')}
        demo={
          <div className="minis">
            <MiniPhone landscape={false} />
            <MiniPhone landscape />
          </div>
        }
      >
        {tr(
          'Vasen puolisko kävelee, oikea puolisko ampuu. Tähti on supervoima ja ⇄ sen vieressä vaihtaa asetta. Asetaskut ovat vasemmassa yläkulmassa. Peli toimii pysty- ja vaaka-asennossa.',
          'The left half walks, the right half fires. The star is your super and ⇄ beside it swaps guns. The gun slots are in the top left corner. Portrait and landscape both work.',
        )}
      </Card>
      <Card
        title={tr('Kävele', 'Walk')}
        demo={
          <div className="stick">
            <div style={{ transform: 'translate(calc(-50% + 14px), calc(-50% - 10px))' }} />
          </div>
        }
      >
        {tr('Laske vasen peukalo mihin tahansa vasemmalle puoliskolle ja vedä. Hahmo kävelee vedon suuntaan.', 'Put your left thumb anywhere on the left half and drag. The hero walks the way you drag.')}
      </Card>
      <Card
        title={tr('Ammu', 'Fire')}
        demo={
          <div className="stick aim">
            <div style={{ transform: 'translate(calc(-50% + 18px), calc(-50% - 4px))' }} />
          </div>
        }
      >
        {tr(
          'Oikea peukalo. Napautus ampuu lähintä näkyvää vihollista. Veto näyttää tähtäysviivan, ja laukaus lähtee kun nostat sormen.',
          'Right thumb. A tap fires at the nearest enemy you can see. A drag shows the aim line, and the shot leaves when you lift your finger.',
        )}
      </Card>
      <Card
        title={tr('Supervoima', 'The super')}
        demo={
          <div className="superbtn ready" style={{ ['--charge' as string]: '100%' }}>
            <span>★</span>
            <small>{t(sweep.superName)}</small>
            <Level n={1} />
          </div>
        }
      >
        {tr(
          'Tähtinappi täyttyy osumista. Kun se hehkuu ja pilli soi, napauta: supervoima tähtää itse parhaaseen kohteeseen. Syöksyn ja hypyn voi myös vetää haluamaasi suuntaan. Mitali on supervoiman taso.',
          'The star fills from hits. When it glows and the whistle blows, tap it: the super aims itself at the best target. The dash and the leap can also be dragged where you want. The medal is the level of the super.',
        )}
      </Card>
      <Card
        title={tr('Vaihda asetta', 'Swap guns')}
        demo={
          <div className="swapbtn" style={{ borderColor: RARITY_COLOR[found.rarity] }}>
            <span>⇄</span>
            <small style={{ color: RARITY_COLOR[found.rarity] }}>{t(TYPE_NAME[found.type])}</small>
            <Pips n={4} full={4} />
            <Level n={found.level} />
          </div>
        }
      >
        {tr(
          'Kun sinulla on kaksi asetta, ⇄ tähden vieressä vaihtaa asetta yhdellä napautuksella. Se näyttää aseen johon vaihdat ja sen ammukset. Myös asetaskua ylhäällä voi napauttaa.',
          'With two guns, ⇄ beside the star swaps guns with one tap. It shows the gun you swap to and its ammo. The gun slot at the top swaps on a tap too.',
        )}
      </Card>
      <Card
        wide
        title={tr('Ota ase lattialta', 'Take a gun from the floor')}
        demo={
          <div className="pickup">
            <GunCard g={found} vs={held} compact />
            <button className="btn primary take" tabIndex={-1}>
              {tr('Ota', 'Take')} <small>E</small>
            </button>
          </div>
        }
      >
        {tr(
          'Kun seisot aseen päällä, sen kortti nousee ruudun yläreunaan. Mitali on aseen taso: vihreä on korkeampi kuin kädessäsi oleva, punainen matalampi. Ota-nappi ottaa aseen. Kahdella aseella se vaihtaa kädessä olevan tilalle.',
          'When you stand on a gun, its card rises at the top of the screen. The medal is the level of the gun: green is higher than the gun in your hand, red is lower. The Take button takes it. With two guns it replaces the one in your hand.',
        )}
      </Card>
      <Card
        wide
        title={tr('Mitä ruutu näyttää', 'What the screen shows')}
        demo={
          <div className="hudmock">
            <div className="hudtop">
              <div className="floor">
                {tr('Kerros', 'Floor')} <b>3</b>
              </div>
              <div className="counts">
                <span className="coins">⚙ 12</span>
                <span className="kills">☠ 8</span>
                <span className="left">{tr('4 jäljellä', '4 left')}</span>
              </div>
            </div>
            <div className="slots">
              <div className="slot on" style={{ borderColor: RARITY_COLOR[held.rarity] }}>
                <div className="sname" style={{ color: RARITY_COLOR[held.rarity] }}>
                  {t(held.name)}
                </div>
                <Pips n={held.ammo} full={Math.max(1, held.ammo - 1)} />
                <Level n={held.level} />
              </div>
              <div className="slot" style={{ borderColor: RARITY_COLOR[found.rarity] }}>
                <div className="sname" style={{ color: RARITY_COLOR[found.rarity] }}>
                  {t(found.name)}
                </div>
                <Pips n={found.ammo} full={found.ammo} />
                <Level n={found.level} />
              </div>
            </div>
            <div className="icons">
              <span className="iconbtn">🔊</span>
              <span className="iconbtn">❚❚</span>
            </div>
          </div>
        }
      >
        {tr(
          'Ylhäällä kerros, rattaat (⚙), kaadot (☠) ja montako vihollista on jäljellä. Asetaskuissa ammukset ovat palkkeja, jotka täyttyvät itsestään, ja kirkas tasku on kädessä. ❚❚ pysäyttää pelin ja kaiutin hiljentää äänet.',
          'At the top: the floor, cogs (⚙), kills (☠) and how many enemies are left. In the gun slots the ammo is a row of bars that refill by themselves, and the bright slot is the gun in your hand. ❚❚ pauses the game and the speaker mutes the sound.',
        )}
      </Card>
      <Card wide title={tr('Hissi ja rattaat', 'The lift and the cogs')} demo={<CogCard c={cog} level={0} onPick={() => undefined} />}>
        {tr(
          'Kun viimeinen vihollinen kaatuu, hissi avautuu kentän yläpäässä. Astu siihen ja valitse yksi kolmesta rattaasta: pysyvä sääntömuutos loppukierrokselle. Joka viides kerros on pomo, ja pomon jälkeen valitaan kaksi.',
          'When the last enemy falls, the lift at the top of the floor opens. Step on it and pick one of three cogs: a rule change that lasts the rest of the run. Every fifth floor is a boss, and after a boss you pick two.',
        )}
      </Card>
      <Card
        wide
        title={tr('Näppäimistöllä', 'On a keyboard')}
        demo={
          <div className="keys">
            {[
              ['WASD', tr('kävele', 'walk')],
              [tr('hiiri', 'mouse'), tr('tähtää, klikki ampuu', 'aim, click fires')],
              [tr('väli', 'space'), tr('supervoima', 'super')],
              ['Q', tr('vaihda asetta', 'swap guns')],
              ['E', tr('ota ase', 'take a gun')],
              ['Esc', tr('tauko', 'pause')],
            ].map(([k, what]) => (
              <div key={k} className="key">
                <kbd>{k}</kbd>
                <span>{what}</span>
              </div>
            ))}
          </div>
        }
      >
        {tr(
          'Nuolinäppäimet kävelevät myös. Hiiren oikea nappi on supervoima, rulla vaihtaa asetta, ja 1 ja 2 valitsevat taskun.',
          'The arrow keys walk too. The right mouse button is the super, the scroll wheel swaps guns, and 1 and 2 pick a slot.',
        )}
      </Card>
    </div>
  );
}

export function GuideScreen({ onBack }: { onBack: () => void }) {
  return (
    <div className="screen" style={{ justifyContent: 'flex-start' }}>
      <h2>{tr('Näin pelataan', 'How to play')}</h2>
      <GuideBody />
      <button className="btn ghost" onClick={onBack}>
        {tr('Takaisin', 'Back')}
      </button>
    </div>
  );
}
