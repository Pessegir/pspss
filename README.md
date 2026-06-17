# PSPSS — *Probably Significant Statistical Software*

A satirical puzzle game about p-hacking and the replication crisis. Each "study" is rigged so the
honest analysis fails; you torture it to significance in the fewest moves by applying real
Questionable Research Practices with euphemistic names. The statistics under the hood are **real**
(t-tests, Mann-Whitney, Wilcoxon, ANCOVA, genuine REML **linear mixed models**, and JZS **Bayes
factors**). When you p-hack you perform the exact manipulations that inflate false positives in the
real literature — that's the joke, and the lesson.

- **Campaign 1 — Publish or Perish:** classic data-torturing QRPs.
- **Campaign 2 — The Methods Section:** abuse the *analysis itself*. Every level presents the full
  analysis menu (wrong tests, pseudoreplication, mixed-model mis-specification, median splits,
  collider control, Simpson's paradox, specification search) and only the analysis that matches the
  flaw actually works — you have to diagnose it from the figures and pick correctly.
- **Campaign 3 — In Bayes We Trust:** no more p-values; the metric is the **Bayes factor**, abused
  via prior width, one-sided priors, optional stopping, and BF₀₁ relabelling.

Campaigns unlock in order. See [DESIGN.md](DESIGN.md) for the full design.

## Learn while you cheat

The game is built to *teach*, not just amuse — for undergrads, grads, and working researchers:

- **Post-level Debrief** — after every study it names the QRP you used, why it misleads, the real
  citation, the honest alternative, and the **truth reveal**: did you find a real effect by an
  invalid route, or manufacture a **false positive**? Shown with **Cohen's d + 95% CI** (so a tiny
  p-value with a zero-spanning CI is exposed for what it is).
- **Methods Codex** — a browsable glossary of every QRP with real cases (Bem ESP, Simpson's paradox,
  pseudoreplication, OSC reproducibility…) and antidotes (preregistration, Welch, mixed models, the
  multiverse).
- **Sandbox Lab** — drag sliders for n / effect / SD / prior and watch p (or the Bayes factor) react
  live. Pure intuition-building.
- **Spot the QRP** — identify the malpractices in realistic fabricated abstracts.
- **Career Dashboard + achievements** — publications, retractions, replication rate, and unlockable
  titles.

Difficulty is deliberately uniform and hard — no easy mode. Being a good researcher isn't the same
as being good at p-hacking; the game rewards the hack precisely so the debrief can indict it.

## Play

Open **`index.html`** in any browser — one self-contained file, no server, no dependencies.

```sh
xdg-open index.html        # Linux
```

Two modes: **Tenure Track** (satire + real citations) and **Pure P-Hacker** (pure comedy). Plus an
optional **Preregistration** hard-mode.

Campaigns unlock in order. To jump ahead (lecturers / playtesters): the **🔓 Reviewer 2 backdoor**
link on the start screen unlocks everything if you whisper the magic, marginally-significant
phrase — **`trending toward significance`** (it also accepts `marginally significant`, `p<0.05`,
`p=0.051`, `reviewer2`, `just one more participant`). It doesn't fake your stars, and you can re-lock.

## Screenshots

| | |
|---|---|
| ![Campaign map](screenshots/01-campaign-map.png) **Campaign map** — three gated campaigns + Codex / Sandbox / Quiz / Dashboard. | ![Playing a level](screenshots/02-playing-a-level.png) **Playing a level** — SPSS-parody UI: data view, output with effect size + CI, the QRP menu. |
| ![Diagnostic figure](screenshots/03-diagnostic-figure.png) **Diagnostic figures** — real SVG plots to read the flaw (here, the confound scatter). | ![Debrief](screenshots/04-debrief-false-positive.png) **The Debrief** — the truth reveal: false positive vs. real-but-invalid, with citation + antidote. |
| ![Methods Codex](screenshots/05-methods-codex.png) **Methods Codex** — every QRP, its harm, a real case, and the fix. | ![Sandbox Lab](screenshots/06-sandbox-lab.png) **Sandbox Lab** — drag n / effect / SD / prior; watch p or BF react live. |
| ![Spot the QRP](screenshots/07-spot-the-qrp.png) **Spot the QRP** — find the malpractice in realistic abstracts. | ![Career dashboard](screenshots/08-career-dashboard.png) **Career Dashboard** — publications, retractions, replication rate, achievements. |
| ![Bayesian level](screenshots/09-bayesian-level.png) **Campaign 3 (Bayesian)** — the metric becomes the Bayes factor; prior-hack it. | ![House rule](screenshots/10-house-rule.png) **House rule** — some finales demand p < .001. |
| ![Publication](screenshots/11-publication-win.png) **Publication** — significance secured, in an absurd journal. | ![Replication crisis](screenshots/12-replication-crisis.png) **Replication crisis** — years later, your hacked findings evaporate. |
| ![Reviewer 2 backdoor](screenshots/13-backdoor.png) **Reviewer 2 backdoor** — the unlock prompt for lecturers/playtesters. | ![Unlocked](screenshots/14-unlocked-map.png) **Unlocked** — all campaigns open, no faked progress. |

## Develop

Source is modular in `src/`; `index.html` is generated.

```sh
node build.js   # bundle src/*.js + style.css + shell.html -> index.html
./test.sh       # rebuild + run the full test suite
```

Everything runs on bare `node` (no npm). Module/bundle order is in `build.js`.

## Test

```sh
node src/stats.test.js      # stats engine vs hand-derived / known reference values
node src/lmm.test.js        # linear mixed model vs the cluster-means equivalence
node src/bayes.test.js      # Bayes factors: dual-integration + the sleep-data anchor
node src/levels.verify.js   # every level: non-winning raw, solvable at par, only intended option wins
node src/ui.smoke.js        # drives the real ui.js through a DOM shim (require path)
node src/bundle.smoke.js    # runs the built index.html the way a browser does (global path)
```

`src/tune-seeds*.js` search for per-level RNG seeds; re-run only after changing a data generator,
then bake the seeds back into the level and re-run `levels.verify.js`.
