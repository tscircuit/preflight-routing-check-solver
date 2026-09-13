import { useEffect, useReducer, useState } from "react"
import { getSvgFromGraphicsObject } from "graphics-debug"
import { InteractiveGraphicsCanvas } from "graphics-debug/react"
import { PreflightRoutingSolver, type PreflightRoutingInput } from "lib"

export function PreflightRoutingDebugger({
  input,
}: {
  input: PreflightRoutingInput
}) {
  const [solver, setSolver] = useState(() => new PreflightRoutingSolver(input))
  const [selectedLayer, setSelectedLayer] = useState("all")
  const [interactive, setInteractive] = useState(false)
  const [running, setRunning] = useState(false)
  const [iteration, update] = useReducer((n) => n + 1, 0)
  useEffect(() => {
    if (!running) return
    const frame = requestAnimationFrame(() => {
      const started = performance.now()
      while (
        !solver.solved &&
        !solver.failed &&
        performance.now() - started < 8
      )
        solver.step()
      update()
      if (solver.solved || solver.failed) setRunning(false)
    })
    return () => cancelAnimationFrame(frame)
  }, [solver, running, iteration])
  const graphics = solver.visualize()
  const onLayer = (object: { layer?: string }) =>
    selectedLayer === "all" ||
    !object.layer ||
    object.layer.replace(/^z/, "").split(",").includes(selectedLayer)
  const visibleGraphics = {
    ...graphics,
    points: graphics.points?.filter(onLayer),
    lines: graphics.lines?.filter(onLayer),
    rects: graphics.rects?.filter(onLayer),
    circles: graphics.circles?.filter(onLayer),
    polygons: graphics.polygons?.filter(onLayer),
  }
  const svg = getSvgFromGraphicsObject(visibleGraphics, {
    includeTextLabels: false,
    svgWidth: 1400,
    svgHeight: 950,
  })

  return (
    <main
      style={{
        fontFamily: "system-ui",
        background: "white",
        color: "#0f172a",
        padding: 16,
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <button
          disabled={running || solver.solved || solver.failed}
          onClick={() => {
            solver.step()
            update()
          }}
        >
          Step
        </button>
        <button
          disabled={running || solver.solved || solver.failed}
          onClick={() => setRunning(true)}
        >
          Solve
        </button>
        <button disabled={!running} onClick={() => setRunning(false)}>
          Pause
        </button>
        <button
          onClick={() => {
            setRunning(false)
            setSolver(new PreflightRoutingSolver(input))
          }}
        >
          Reset
        </button>
        <span>Iteration {solver.iterations}</span>
        <strong role="status">{graphics.title}</strong>
      </header>
      <p style={{ fontSize: 13, margin: "10px 0" }}>
        This check finds fixed-obstacle disconnections. It does not route copper
        or predict routing success.
      </p>
      <div
        style={{
          display: "flex",
          gap: 16,
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <label>
          View layer{" "}
          <select
            value={selectedLayer}
            onChange={(e) => setSelectedLayer(e.target.value)}
          >
            <option value="all">All layers</option>
            {Array.from({ length: input.layerCount }, (_, i) => (
              <option key={i} value={i}>
                {i === 0
                  ? "top"
                  : i === input.layerCount - 1
                    ? "bottom"
                    : `inner${i}`}
              </option>
            ))}
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={interactive}
            onChange={(e) => setInteractive(e.target.checked)}
          />{" "}
          Pan / zoom
        </label>
        <a
          download="preflight-routing.svg"
          href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
        >
          Download SVG
        </a>
      </div>
      {interactive ? (
        <InteractiveGraphicsCanvas
          graphics={visibleGraphics}
          height="80vh"
          showGrid={false}
          showLabelsByDefault={false}
          alwaysShowToolbar
        />
      ) : (
        <img
          alt={graphics.title}
          src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`}
          style={{ width: "100%", height: "auto" }}
        />
      )}
      <details>
        <summary>Structured check output</summary>
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {JSON.stringify(solver.getOutput(), null, 2)}
        </pre>
      </details>
    </main>
  )
}
