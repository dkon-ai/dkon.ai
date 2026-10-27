# Embossed icon plates for the dkon.ai hero (EMBOSS, Mon Oct 26 2026, 23:14)

Four marks, the fine weight (30 design px, like the reference's ridges): **rings** (growth rings with a radial check), **knot** (an interlaced trefoil), **lens** (a biconvex lens, three rays meeting at a focus), **tree** (the tree in the orb: leaves as nodes inside a ring).
My pick for the three cards: rings, knot, tree. Lens is the alternate.

## Files (1024 x 1024 PNG, card-ready: the edge is one exact colour)
- `card-<mark>-paper.png`: the north star. White relief on paper grey, cream-gold light on the bevels. **Card colour #c5c5c5** (197,197,197) exactly, edge to edge.
- `card-<mark>-slate.png`: ours. The mark carved into slate, embers in the groove floor, gold on the walls. **Card colour #2b3036** (43,48,54) exactly.
- `card-<mark>-<style>.base.png`: the same plate with no gold light (the "cards rise empty" beat).
- `card-<mark>-<style>.gold.png`: the gold light ALONE on black. Lay it over the base with `mix-blend-mode: plus-lighter` (additive; `screen` is close) and animate a mask across it to get the reference's beat: gold light tracing the embossed icon.
- `<mark>.svg`: the vector mark (fill none, stroke #000, round caps), if a page wants to draw it itself.

## Coming next
- Sweep clips (the gold light arriving and travelling the rims), 4 s, per mark: `sweep-<mark>-paper.mp4`.
- Krea 2 material passes (photoreal plastic and paper) once the ComfyUI runs land: same names with `-krea`.

---
Copied into the hero by HERO (2026-10-26T23:16:19-06:00): card-<mark>-<sky>.{base,gold}.png resized to 640 px WebP as <mark>-<sky>-<layer>.webp.
