# PSPSS — Design

A satirical puzzle game about p-hacking and the replication crisis. You are an academic under
"publish or perish" pressure; each level hands you data that is **not** a win, and you torture it to
significance in the **fewest moves** using real Questionable Research Practices (QRPs). It is golf,
but the ball is scientific integrity.

## Pillars

1. **The stats are real.** Every p-value / Bayes factor comes from a genuine engine
   (`stats.js`, `lmm.js`, `bayes.js`). Diagnostics are meaningful; minimal solutions are discoverable.
2. **Fewest moves = the puzzle.** Each level has a *par*; beating it rewards *elegant* p-hacking.
3. **Every tool is a real QRP** with a euphemistic label and an honest tooltip (with citations in
   Tenure Track mode).

## Scoring triangle

- **Moves vs Par** — the score (drives stars).
- **Researcher Degrees of Freedom** — the move counter, a real term (Simmons et al. 2011).
- **Suspicion** — egregious/numerous manipulations raise retraction risk; gates fabrication and
  drives the Replication Crisis epilogue.

## Two modes

**Tenure Track** (satire + real citations; Suspicion, Preregistration hard-mode, Replication
epilogue active) and **Pure P-Hacker** (citations off, Reviewer 2 cranked up). A content/flag layer,
not separate mechanics.

## Paradigm-agnostic metric

`analyze()` → `finalize()` returns `metricKind` (`p`|`bf`), `metricValue`, `goalText`, `win`. The UI
never hardcodes "p", so the Bayes factor (C3) slots in without engine surgery. `win` = metric crosses
`winThreshold` AND effect in the predicted direction.

## Campaigns

- **C1 — Publish or Perish (8):** outlier, skew, confound (ANCOVA), optional stopping, hidden
  subgroup, multiverse of outcomes, wrong-direction (HARK), honest-null trap. Full toolbox shown;
  pick the QRP that matches the flaw.
- **C2 — The Methods Section (9):** abuse the *analysis*. Pseudoreplication vs mixed model; wrong
  test (Student vs Welch); drop random slopes (Barr 2013); median split (MacCallum 2002); collider
  control (Montgomery 2018); Simpson's paradox; specification search (Steegen 2016); outcome
  switching; honest-LMM trap. **Every level offers the full analysis menu** — only the flaw-matching
  analysis wins; the rest are proven non-winning decoys, so you must diagnose from the figures.
- **C3 — In Bayes We Trust (8):** metric = JZS Bayes factor (Rouder 2009). Prior width, optional
  stopping, one-sided priors, BF₀₁ relabelling, "robustness" prior-shopping, a capstone needing two
  stacked nudges, and a default-prior trap.

Campaigns unlock in order (gated by clearing the previous one).

## Sharper twists

- **Preregistration hard-mode:** commit one analysis before seeing diagnostics; it usually stays
  non-significant and the game congratulates your integrity while your career dies.
- **Replication Crisis epilogue:** high-suspicion papers fail to replicate years later.

## Architecture / build / test

See `CLAUDE.md`. Modular `src/` (UMD IIFEs, Node + browser) → `node build.js` → one self-contained
`index.html`. Real linear algebra (Cholesky/Nelder-Mead for LMM) and numerical integration (JZS BF)
are verified against known anchors (cluster-means equivalence; the BayesFactor `sleep` example).
`levels.verify.js` proves every level is non-winnable raw, solvable at par, with decoys that don't
win.
