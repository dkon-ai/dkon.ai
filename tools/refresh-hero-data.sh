#!/usr/bin/env bash
# Refresh the hero's tree: ORB's orb module (from the orb worktree) and the graph (from ORB's live server), sanitized for a public page.
#   tools/refresh-hero-data.sh [orb-worktree] [graph-url]
# Defaults: ~/dkonstudios/worktrees/orb/dev/orb and http://127.0.0.1:8911/graph (ORB's server on WINTERMUTE).
# The graph keeps shape only: positions to 0.1, charge, weight, threads, month rings, and births floored to the day (the growth
# beat needs them). No words, no authors. Writes static/hero/orb/{orb.js,vendor/,graph.json,SOURCE.txt}.
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
src="${1:-$HOME/dkonstudios/worktrees/orb/dev/orb}"
url="${2:-http://127.0.0.1:8911/graph}"
dst="$here/static/hero/orb"
mkdir -p "$dst/vendor"
cp "$src/orb.js" "$dst/orb.js"
cp "$src/vendor/three.module.js" "$src/vendor/three.core.js" "$dst/vendor/"
tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
curl -sSf -m 20 "$url" -o "$tmp"
python3 - "$tmp" "$dst/graph.json" <<'PY'
import json, sys
g = json.load(open(sys.argv[1]))
out = {'meta': {'counts': g['meta']['counts'], 'capacity': g['meta']['capacity'],
                'source': 'ORB /graph, sanitized for a public page: no authors, positions to 0.1, births to the day'},
       'n': g['n'], 'pos': [round(v, 1) for v in g['pos']], 'charge': g['charge'], 'w': [round(v, 2) for v in g['w']],
       'born': [b - (b % 86400) for b in g['born']], 'lines': g['lines'], 'rings': g['rings']}
json.dump(out, open(sys.argv[2], 'w'), separators=(',', ':'))
print(f"graph.json: {out['n']} leaves, {len(out['rings'])} month rings")
PY
sha="$(git -C "$src" rev-parse --short HEAD 2>/dev/null || echo unknown)"
printf "orb.js and vendor/ copied from the orb worktree @ %s (%s), %s.\ngraph.json is ORB's GET /graph, sanitized for a public page: no authors, positions to 0.1, births to the day.\nthree.js is MIT, (c) 2010-2026 three.js authors.\n" "$sha" "$src" "$(date -Is)" > "$dst/SOURCE.txt"
echo "orb module @ $sha"
