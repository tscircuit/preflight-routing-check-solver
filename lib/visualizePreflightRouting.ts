import { convertSrjToGraphicsObject } from "@tscircuit/capacity-autorouter"
import type { GraphicsObject } from "graphics-debug"
import type { PreflightRoutingInput, PreflightRoutingOutput } from "./types"

/** Board-world points in mm: +X right, +Y up; layer names identify copper layers. */
export function visualizePreflightRouting(
  input: PreflightRoutingInput,
  output: PreflightRoutingOutput,
  state: {
    solved: boolean
    failed: boolean
    error: string | null
    completedConnections: number
  },
): GraphicsObject {
  const graphics: GraphicsObject = convertSrjToGraphicsObject(input)
  graphics.coordinateSystem = "cartesian"
  graphics.texts = []
  const { minX, maxX, minY, maxY } = input.bounds
  const geometryMaxY = Math.max(
    maxY,
    ...input.obstacles.map((o) => o.center.y + o.height / 2),
  )
  const scale = Math.max(maxX - minX, maxY - minY)
  const fontSize = scale * 0.032
  const lineHeight = fontSize * 1.65
  const blocked = new Map(output.diagnostics.map((d) => [d.connectionName, d]))
  const skipped = new Set(
    output.skippedChecks.flatMap((s) =>
      s.connectionName ? [s.connectionName] : [],
    ),
  )
  const globalSkip = output.skippedChecks.some(
    (s) => s.connectionName === undefined,
  )
  const checked = output.measurements.analyzed_connection_count ?? 0
  const status = state.failed
    ? "CHECK FAILED"
    : blocked.size
      ? `${blocked.size} BLOCKED CONNECTION${blocked.size === 1 ? "" : "S"}`
      : globalSkip
        ? "CHECK SKIPPED"
        : !state.solved
          ? "CHECK NOT COMPLETE"
          : skipped.size
            ? "CHECKS PARTIALLY SKIPPED"
            : "NO FIXED-OBSTACLE BLOCK FOUND"
  const statusColor =
    state.failed || blocked.size
      ? "#a21caf"
      : globalSkip || skipped.size || !state.solved
        ? "#92400e"
        : "#166534"
  graphics.title = `Routing preflight: ${status}`

  graphics.lines!.push({
    points: [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
      { x: minX, y: minY },
    ],
    strokeColor: "#334155",
    strokeWidth: scale * 0.009,
    label: "Routing bounds (mm)",
  })
  if (input.outline?.length)
    graphics.lines!.push({
      points: [...input.outline, input.outline[0]],
      strokeColor: "#0f172a",
      strokeWidth: scale * 0.012,
      label: "Board outline (connectivity check skipped)",
    })
  for (const [index, connection] of input.connections.entries()) {
    const diagnostic = blocked.get(connection.name)
    const connectionStatus = diagnostic
      ? "BLOCKED: fixed_obstacle_disconnect"
      : globalSkip || skipped.has(connection.name)
        ? "NOT CHECKED: unsupported input"
        : index < state.completedConnections
          ? "No fixed-obstacle block found"
          : "Not checked yet"
    for (const point of connection.pointsToConnect) {
      const graphicPoint = graphics.points!.find(
        (p) =>
          p.x === point.x &&
          p.y === point.y &&
          p.label?.split("\n")[0] === connection.name,
      )
      if (graphicPoint)
        graphicPoint.label += `\n${point.pcb_port_id ?? point.pointId ?? "terminal"}\n${connectionStatus}`
      if (diagnostic) {
        const radius = scale * 0.018
        graphics.circles!.push({
          center: point,
          radius,
          fill: "transparent",
          stroke: "#a21caf",
          label: `${connection.name}: ${connectionStatus}`,
        })
      }
    }
    if (connection.pointsToConnect.length !== 2) continue
    graphics.lines!.push({
      points: connection.pointsToConnect.map((p) => ({ x: p.x, y: p.y })),
      strokeColor: diagnostic ? "#a21caf" : "#64748b",
      strokeWidth: scale * (diagnostic ? 0.008 : 0.003),
      strokeDash: [scale * 0.02, scale * 0.02],
      label: `${connection.name}\n${connectionStatus}\nConnection requirement, not a routed trace`,
    })
  }

  const write = (
    x: number,
    y: number,
    text: string,
    color = "#334155",
    size = fontSize,
  ) => {
    graphics.texts!.push({
      x,
      y,
      text,
      color,
      fontSize: size,
      anchorSide: "top_left",
    })
  }
  write(minX, geometryMaxY + scale * 0.23, status, statusColor, fontSize * 1.45)
  write(
    minX,
    geometryMaxY + scale * 0.15,
    `${state.solved ? "Analysis complete" : state.failed ? "Analysis failed" : `${state.completedConnections}/${input.connections.length} connections complete`} | ${input.layerCount} copper layers | dimensions in mm`,
  )
  write(
    minX,
    geometryMaxY + scale * 0.08,
    "Can fixed obstacles disconnect the required terminals?",
  )

  let panelY = maxY
  const panelX = maxX + scale * 0.1
  const paragraph = (text: string, color = "#334155") => {
    let line = ""
    for (const word of text.split(/\s+/)) {
      if (line && (line + " " + word).length > 46) {
        write(panelX, panelY, line, color)
        panelY -= lineHeight
        line = ""
      }
      line += (line ? " " : "") + word
    }
    if (line) {
      write(panelX, panelY, line, color)
      panelY -= lineHeight
    }
    panelY -= lineHeight * 0.4
  }
  paragraph("FIXED-OBSTACLE CONNECTIVITY", "#0f172a")
  if (input.obstacles.length <= 4) {
    for (const [index, obstacle] of input.obstacles.entries())
      paragraph(
        `${obstacle.obstacleId ?? `Obstacle ${index + 1}`} occupies ${obstacle.layers.join(", ")}${obstacle.layers.length === 1 ? " only" : ""}.`,
      )
  }

  if (state.failed)
    paragraph(
      state.error ??
        "The check failed; no routability conclusion is available.",
      statusColor,
    )
  if (blocked.size) {
    paragraph(
      "No path remains even with optimistic layer changes and no clearance restrictions.",
      statusColor,
    )
    paragraph("ISSUE: fixed_obstacle_disconnect", statusColor)
    const names = [...blocked.keys()]
    paragraph(
      `Affected: ${names.slice(0, 16).join(", ")}${names.length > 16 ? `; ${names.length - 16} more in output diagnostics` : ""}`,
      statusColor,
    )
    paragraph(
      "Fix: move blocking geometry or provide an escape on another layer.",
    )
  } else if (state.solved && !globalSkip) {
    paragraph(
      `No disconnection found for ${checked} checked connections. This does not establish that the board can be routed.`,
      statusColor,
    )
  } else if (!state.solved && !state.failed) {
    paragraph(
      "Run Solve or Step to obtain a result. Unchecked connections are not passing checks.",
      statusColor,
    )
  }
  for (const skip of output.skippedChecks)
    paragraph(
      `SKIPPED${skip.connectionName ? ` ${skip.connectionName}` : ""}: ${skip.reason}`,
      "#92400e",
    )
  paragraph("MEASUREMENTS (not blocking thresholds)", "#0f172a")
  paragraph(
    `${input.connections.length} connections; ${input.obstacles.length} obstacles; ${checked} connectivity checks started.`,
  )
  const density = output.measurements.estimated_trace_density
  paragraph(
    density === undefined
      ? "Trace density: not measured yet."
      : `Estimated trace density: ${(density * 100).toFixed(2)} percent. Manhattan trace area / board area across layers.`,
  )
  paragraph(
    "MODEL: whole cells inside foreign obstacles are blocked. Vias are unrestricted; clearances are ignored.",
  )

  const legendY =
    Math.min(
      panelY,
      minY,
      ...input.obstacles.map((o) => o.center.y - o.height / 2),
    ) -
    scale * 0.07
  write(
    minX,
    legendY,
    "Dots = terminals; dashed lines = connection requirements (not copper).",
  )
  write(
    minX,
    legendY - lineHeight,
    "Magenta rings + dashes = blocked. Gray dashes carry no routing guarantee.",
  )
  write(
    minX,
    legendY - lineHeight * 2,
    "SRJ obstacles: red = top; blue = bottom; darker red = multiple layers.",
  )
  write(
    minX,
    legendY - lineHeight * 3,
    "Use layer controls and hover terminals / obstacles for names and layer details.",
  )
  return graphics
}
