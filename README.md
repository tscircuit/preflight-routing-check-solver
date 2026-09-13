# @tscircuit/preflight-routing-check-solver

[Open the solver debugger](https://preflight-routing-check-solver.vercel.app).

Incremental preflight analysis for Simple Route JSON, built on `@tscircuit/solver-utils`. This is a source-distributed GitHub package following the tscircuit handbook's algorithm repository template.

```ts
import { PreflightRoutingSolver } from "@tscircuit/preflight-routing-check-solver"

const solver = new PreflightRoutingSolver(simpleRouteJson)
while (!solver.solved && !solver.failed) solver.step()
const { diagnostics, measurements, skippedChecks } = solver.getOutput()
```

`solved` means analysis completed, including explicitly skipped checks. A nonempty `diagnostics` array reports supported obstructions; an empty array does not guarantee routability. Check `failed` before consuming a completed result.

## First checks

- Measurements: connection and obstacle counts, two-terminal Manhattan length in mm, and estimated trace area divided by board area across routing layers. Density is advisory; there is no probabilistic or density-based blocking threshold.
- Fixed-obstacle connectivity: a raster cell is blocked only when the entire cell is covered by a foreign obstacle. Circular obstacles use an inscribed square. Eight-neighbor paths and unrestricted layer changes deliberately relax physical routing. Terminal seeds include the complete pad contact envelope. Only a missing path in this optimistic model emits `fixed_obstacle_disconnect`.
- Same-net aliases are resolved through a connectivity map.

Geometry is in board/circuit world coordinates: millimeters, +X right, +Y up, with points translated in that frame. Layer names denote physical copper layers, not Y directions. Bounds, obstacle centers and terminal positions must use the same frame.

The initial connectivity check supports rectangular bounds, axis-aligned rectangular/circular obstacles and two-terminal on-board obligations. It skips outlines, rotated obstacles, copper pours, off-board connections, jumpers, and preloaded traces. These cases remain measurable but are not declared blocked. Clearance/via restrictions are not modeled. The default limits are 32,768 total grid cells, 256 connections, 2,000 obstacles and 0.25 mm cells; exceeding a limit skips connectivity analysis. Callers can stop between steps and report an incomplete analysis without declaring routing impossible. Rasterization yields per obstacle; traversal yields at most every 512 visited cells.

This initial solver deliberately favors missed obstructions over blocking a legal route. New factors should expose measurements first and add blocking diagnostics only with explicit modeling assumptions and repair/escape regressions.

## Development

```sh
bun install
bun test
bun run typecheck
bun run format:check
bun run start
bun run build:site
```

The Cosmos sidebar includes blocked-board, open-passage, alternate-layer and unsupported-outline fixtures. `visualize()` starts with the autorouter's `convertSrjToGraphicsObject`, retaining layer-colored obstacles, terminal markers, trace geometry and hover labels. It adds routing bounds, dashed connection requirements, magenta rings on blocked terminals, a legend, measurements and a final findings report. Pending and skipped checks are distinguished from completed checks; no-block results do not imply successful routing.

The fixture viewer supports Step, Solve, Pause, Reset, physical-layer selection, SVG downloads and structured output. Its responsive SVG report and optional canvas pan/zoom view use drawing-unit text sizes consistently with exported images. The graphics show input geometry and check findings, not newly routed copper or DRC signoff.

The tests cover a 16-obligation barrier, a matching open passage, another usable layer, a legal passage smaller than a grid cell, same-net aliases, terminal-pad attachment, unsupported inputs, work limits, deterministic stepping and input preservation.

## Regression corpus

`tests/fixtures/routing-corpus.json` contains 35 synthetic SRJ boards from the Pipeline9 experiment using capacity-autorouter 0.0.905. Thirteen outputs passed endpoint connectivity and geometry checks; these are labeled `previouslyRouted`. A false label means no validated route was obtained, not proof of impossibility. The initial check blocks four boards and preserves all thirteen validated controls (about 260 ms total for the corpus on the development machine). This small synthetic corpus is a regression set, not a calibrated success probability or a claim about production false-positive rates.
