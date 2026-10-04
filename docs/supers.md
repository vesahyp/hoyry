# Supers: auto-aim and the Sweep tune (2026-10-04)

The specials were hard to aim by hand on a phone. A tap now aims each
super (`src/game/supers.ts`, `planSuper`): the dash at the line through the
most enemies, the leap and the Smith's hop onto the biggest group in reach,
the turret toward the group. A gold sight shows the target while the super
is charged. A drag still aims the dash and the leap (they are also
escapes) and snaps to the nearest enemy within 34 degrees of the drag. With
nothing in reach, the dash and the leap go toward the nearest enemy and the
Smith slams where he stands. A super's own hits no longer charge the next
super.

The Sweep's Soot Dash was the weakest special: short (197 px), narrow, and
with nothing at the end of it. It now runs through its target and 50 px
past it (120 to 300 px), is wider, and bursts into soot where it ends.

| Soot Dash | before | after |
|---|---|---|
| length | 197 px, fixed | target + 50 px, 120 to 300 px |
| speed | 820 px/s | 900 px/s |
| hit width (beside the body) | 14 px | 22 px |
| contact damage | 55 | 60 |
| end burst | none | 40 in 90 px |
| soot cloud | 90 px, 4 s, at the end | 100 px, 4 s, at the end |
| charge | 520 damage dealt, as every hero | the same |

Damage scales by 1 + 0.15 per floor past the first, as before.

## Measured

`make supers FLOORS=10 RUNS=8` reproduces both tables. "In a fight" is the
bot, pressing the super when it is charged and an enemy is within 220 px,
with the gun held silent while the super's window runs; damage is shown at
floor-1 scale and is capped by the enemies' health. The bot dies on the
floor 5 boss in most runs, so these are floors 1 to 5 mostly.

In a fight, before and after:

| hero | uses per fight-minute | uses that hit nothing | hits per use | damage per use |
|---|---|---|---|---|
| Sweep (dash) | 6.0 → 5.3 | 11% → 4% | 1.8 → 1.8 | 40 → 56 |
| Engineer (turret) | 3.6 → 3.6 | 3% → 0% | 3.9 → 2.6 | 103 → 72 |
| Aeronaut (leap) | 6.8 → 4.8 | 6% → 0% | 2.6 → 3.6 | 63 → 84 |
| Smith (slam) | 9.1 → 7.3 | 58% → 9% | 0.8 → 2.2 | 22 → 63 |

The lab: an open room on floor 1, dummies that neither die nor walk, one
tap. Dummies hit / damage, before → after:

| hero | pack of 5 at 150 px | line of 4 | ring of 6 at 170 px | one at 100 px | one at 280 px | one near, pack far |
|---|---|---|---|---|---|---|
| Sweep | 4/5 220 → 5/5 488 | 3/4 165 → 4/4 348 | 1 55 → 1 100 | 55 → 100 | 0 → 100 | 1/5 55 → 4/5 400 |
| Engineer | 5/5 492 → same | 3/4 492 → same | 6/6 492 → same | 309 → same | 103 → 126 | 4/5 492 → same |
| Aeronaut | 5/5 350 → same | 4/4 238 → 217 | 1 70 → same | 70 → same | 70 → same | 1/5 70 → 4/5 280 |
| Smith | 0/5 0 → 5/5 300 | 1/4 42 → 4/4 222 | 0 → 1 60 | 42 → same | 0 → 0 | 1/5 42 → 4/5 186 |

The Sweep goes from the weakest tap to the strongest burst on a group, at
the same charge cost; the Engineer's turret still deals the most over its
nine seconds. The turret's lower fight numbers are not explained by the
lab, which is unchanged; the runs differ after the first super, so read
them as noise until a playtest says otherwise. The Smith's slam is the
biggest change: it used to fire on empty floor more than half the time.
