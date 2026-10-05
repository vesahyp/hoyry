# Roadmap

Forward-looking only. Shipped items are deleted; git history is the record.
The design is in `docs/design.md`.

## Next

- Keep playtesting by hand on a phone (`?floor=N` skips to the floor in
  question). The first playtest found floors 6 to 8 unfair; the gauntlet
  (`make gauntlet`) now guards them. Tune what feels wrong with
  `make deaths` and `make balance` beside it.
- The bot no longer kites the last enemies of a floor, and the sweep and
  the aeronaut now die a little earlier in its runs. Check after the
  playtest whether that is the bot or the game.
- The bot's Aeronaut clears the Boiler King on floor 5 only about half
  the time (`make deaths FLOORS=5 RUNS=16 HERO=ilmalaivuri`: the killing
  hit is the charge), and did so before the thrown guns and the super
  levels too. Decide by hand whether the King's charge is dodgeable with a
  mortar in hand, or whether the Aeronaut needs a step more speed.

- An enemy that throws gunk back: a tar-flask lobber from floor 5 or so,
  whose pool slows the hero. Its lob telegraphs like the mortar crew's
  (the red landing circle) and the pool must read as the enemy's: darker,
  red-lipped, never the player's brown tar. Build it only after the
  player's thrown guns have been played by hand.

## Later

- The workshop: coins buy small permanent ranks between runs (Räkkä's
  Tapion pöytä, as a workbench).
- A vending machine on the lift: spend coins on a gun or a reroll.
- Co-op on one phone, as in Räkkä.
- itch.io and Newgrounds: the portal kit from Räkkä (`docs/portals.md`
  there): a relative-path build, the iframe check, English store images,
  the leaderboard read through the CloudFront cache, two beacons a run.
- More orange guns, a fifth hero, and a boss pattern per floor theme.
