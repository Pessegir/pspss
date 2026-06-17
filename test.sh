#!/usr/bin/env bash
# Run the full PSPSS test suite + rebuild.
set -e
node build.js
for t in stats.test lmm.test bayes.test knowledge.test levels.verify ui.smoke bundle.smoke; do
  echo "=== $t ==="
  node "src/$t.js" >/tmp/pspss_$t.log 2>&1 && tail -1 /tmp/pspss_$t.log || { echo "FAILED:"; cat /tmp/pspss_$t.log; exit 1; }
done
echo "All suites passed."
