# Höyry: dev, checks, screenshots. The game deploys from GitHub Actions on
# every push to master; infra/ here is the analytics pixel host (and,
# later, the site itself), the one thing this Makefile deploys.
#
#   make dev           # vite dev server
#   make build         # production build -> dist/
#   make preview       # build, then serve it locally
#   make check         # typecheck + build + sim-check + gauntlet + super-check + pickup-check + gauntlet-check, what a commit needs green
#   make balance       # bot runs, one line per run (FLOORS ?= 10 RUNS ?= 2 HERO ?= START ?= a gun type to start with)
#   make deaths        # what hurts the hero, floor by floor, over bot runs (same knobs)
#   make gauntlet      # the human profile of the bot plays floors FROM..TO (6..8) from a typical build; fails under 60 % clears (START=veturi@5 carries that gun instead)
#   make gauntlet-check # one such run on an emulated iPhone at real speed, on video (shots/gauntlet/); must clear 6, 7 and 8
#   make supers        # each super in bot fights, then the lab (FLOORS RUNS HERO as above)
#   make shots-setup   # once: install Playwright
#   make shots         # phone screenshots into shots/
#   make shots-en      # the same in English, into shots/en/
#   make ui-shots      # the slots at several gun levels, the pickup card and each hero's super aim, portrait and landscape, into shots/ui/
#   make thrown-shots  # each thrown gun landing and its pool, into shots/thrown/
#   make boss-shots    # every boss mid-fight, into shots/bosses/
#   make touch-check   # taps through the menus on an emulated phone
#   make pickup-check  # a gun pickup on an emulated iPhone: the card slides in and flies to its slot without a jump
#   make super-check   # each hero's super, tapped in a fight on an emulated iPhone, hits
#   make board-check   # the leaderboard end to end (BASE=https://... checks the live game)
#   make plan          # terraform plan for infra/: the pixel host and the records API
#   make apply         # terraform apply, then make env
#   make env           # write .env.local from the Terraform outputs
#   make outputs       # show terraform outputs (pixel_url, records_api, board_url)
#   make deploy-pixel  # upload t.gif to the pixel bucket
#
# AWS profile: default credential chain; pass PROFILE=name to override.

PROFILE ?=
PROF     = $(if $(PROFILE),AWS_PROFILE=$(PROFILE) ,)
AWS      = $(PROF)aws
TF       = $(PROF)terraform -chdir=infra

.PHONY: env board-check pause-check touch-check ui-shots thrown-shots boss-shots super-check pickup-check supers deaths gauntlet gauntlet-check dev build preview check balance shots-setup shots shots-en plan apply outputs deploy-pixel

dev:
	npm run dev

build:
	npm run build

preview: build
	npm run preview

check:
	npm run typecheck
	npm run build
	npm run sim-check
	npm run gauntlet
	$(MAKE) super-check
	$(MAKE) pickup-check
	$(MAKE) gauntlet-check

FLOORS ?= 10
RUNS ?= 2
HERO ?=
START ?=
balance:
	npm run balance -- $(FLOORS) $(RUNS) $(HERO) $(START)

supers:
	npm run supers -- $(FLOORS) $(RUNS) $(HERO)

deaths:
	npm run deaths -- $(FLOORS) $(RUNS) $(HERO)

FROM ?= 6
TO ?= 8
gauntlet:
	npm run gauntlet -- $(FROM) $(TO) $(RUNS) $(HERO) $(START)

shots-setup:
	npm install --no-save playwright && npx playwright install chromium

shots:
	node scripts/shots.mjs

pause-check:
	node scripts/pause-check.mjs

touch-check:
	node scripts/touch-check.mjs

super-check:
	node scripts/super-check.mjs

pickup-check:
	node scripts/pickup-check.mjs

gauntlet-check:
	node scripts/gauntlet-check.mjs

BASE ?=
board-check:
	node scripts/board-check.mjs $(BASE)

shots-en:
	node scripts/shots.mjs en

ui-shots:
	node scripts/ui-shots.mjs

thrown-shots:
	node scripts/thrown-shots.mjs

boss-shots:
	node scripts/boss-shots.mjs

plan:
	$(TF) init
	$(TF) plan -out=tfplan

apply:
	$(TF) apply tfplan
	$(MAKE) env

outputs:
	@$(TF) output

# The back end for builds on this machine, written from the Terraform
# outputs. Gitignored (*.local): a clone without it builds a game with no
# tracker and no global records, which is what a fork should get. The
# Pages deploy reads the same values from GitHub repository variables.
env:
	@{ for o in pixel_url records_api board_url; do \
	     printf 'VITE_%s=%s\n' "$$(echo $$o | tr a-z A-Z)" "$$($(TF) output -raw $$o)"; done; } > .env.local
	@cat .env.local

# The pixel must never cache: every beacon has to reach the origin so the
# request (and its query string) lands in the CloudFront access logs.
deploy-pixel:
	@BUCKET=$$($(TF) output -raw bucket_name); \
	DIST=$$($(TF) output -raw distribution_id); \
	echo "→ uploading t.gif to s3://$$BUCKET (no-store)"; \
	$(AWS) s3 cp public/t.gif "s3://$$BUCKET/t.gif" \
	  --cache-control "no-store" --content-type "image/gif"; \
	$(AWS) cloudfront create-invalidation --distribution-id "$$DIST" --paths "/t.gif" >/dev/null; \
	echo "✓ pixel live at $$($(TF) output -raw pixel_url)"
