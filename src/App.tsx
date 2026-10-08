import { useEffect, useState } from 'react';
import type { HeroDef } from './game/content/heroes';
import { Game, type RunSummary } from './ui/Game';
import { Title, Select, Death, RecordsScreen } from './ui/Screens';
import { GuideScreen } from './ui/Guide';
import { loadRecords, saveRun, type Records } from './records';
import { UpdateBanner } from './ui/Update';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { BUILD, BUILD_NAME } from './version';
import { lang, setLang, t } from './i18n';

type Screen = { kind: 'title' } | { kind: 'select'; training: boolean } | { kind: 'records' } | { kind: 'guide' } | { kind: 'run'; hero: HeroDef; seed: number; training: boolean } | { kind: 'dead'; r: RunSummary; rank: number; heroBest: boolean };

export default function App() {
  return (
    <ErrorBoundary>
      <Screens />
    </ErrorBoundary>
  );
}

function Screens() {
  const [screen, setScreen] = useState<Screen>({ kind: 'title' });
  const [records, setRecords] = useState<Records>(() => loadRecords());
  const [, setLangState] = useState(lang);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen.kind]);

  const start = (hero: HeroDef, training = false) => {
    const asked = Number(new URLSearchParams(location.search).get('seed'));
    setScreen({ kind: 'run', hero, seed: asked || (Date.now() ^ (Math.random() * 1e9)) >>> 0, training });
  };

  let body;
  switch (screen.kind) {
    case 'title':
      body = (
        <Title
          records={records}
          onPlay={() => setScreen({ kind: 'select', training: false })}
          onTrain={() => setScreen({ kind: 'select', training: true })}
          onRecords={() => setScreen({ kind: 'records' })}
          onGuide={() => setScreen({ kind: 'guide' })}
          onLang={(l) => {
            setLang(l);
            setLangState(l);
          }}
        />
      );
      break;
    case 'select':
      body = <Select records={records} training={screen.training} onPick={(h) => start(h, screen.training)} onBack={() => setScreen({ kind: 'title' })} />;
      break;
    case 'records':
      body = <RecordsScreen records={records} onBack={() => setScreen({ kind: 'title' })} />;
      break;
    case 'guide':
      body = <GuideScreen onBack={() => setScreen({ kind: 'title' })} />;
      break;
    case 'run':
      body = (
        <Game
          key={screen.seed}
          heroes={[screen.hero]}
          seed={screen.seed}
          training={screen.training}
          onQuit={() => setScreen(screen.training ? { kind: 'title' } : { kind: 'select', training: false })}
          onRestart={() => start(screen.hero)}
          onEnd={(r) => {
            // A practice run (?floor=N) is not a record, here or on the board.
            if (r.practice) {
              setScreen({ kind: 'dead', r, rank: -1, heroBest: false });
              return;
            }
            const best = [...r.guns].sort((a, b) => b.rarity - a.rarity)[0];
            const saved = saveRun({
              hero: r.hero.id,
              floor: r.floor,
              time: r.time,
              kills: r.kills,
              coins: r.coins,
              bestGun: best ? t(best.name) : '',
              bestRarity: r.bestRarity,
              date: new Date().toISOString(),
            });
            setRecords(saved.records);
            setScreen({ kind: 'dead', r, rank: saved.rank, heroBest: saved.heroBest });
          }}
        />
      );
      break;
    case 'dead':
      body = <Death r={screen.r} rank={screen.rank} heroBest={screen.heroBest} onAgain={() => start(screen.r.hero)} onMenu={() => setScreen({ kind: 'select', training: false })} />;
      break;
  }
  return (
    <>
      {body}
      {screen.kind !== 'run' && <UpdateBanner />}
      {screen.kind === 'title' && (
        <div className="build">
          {BUILD_NAME} · {BUILD}
        </div>
      )}
    </>
  );
}
