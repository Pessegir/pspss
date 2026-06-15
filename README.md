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

## Play

Open **`index.html`** in any browser — one self-contained file, no server, no dependencies.

```sh
xdg-open index.html        # Linux
```

Two modes: **Tenure Track** (satire + real citations) and **Pure P-Hacker** (pure comedy). Plus an
optional **Preregistration** hard-mode.

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
