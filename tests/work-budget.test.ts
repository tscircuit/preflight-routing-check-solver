import { expect, test } from "bun:test"
import { PreflightRoutingSolver, type PreflightRoutingInput } from "lib"

function denseBoard(blocked: boolean): PreflightRoutingInput {
  const obstacles: PreflightRoutingInput["obstacles"] = Array.from(
    { length: 600 },
    (_, i) => ({
      type: "rect",
      center: {
        x: -4.8 + (i % 30) * 0.32,
        y: -4.8 + Math.floor(i / 30) * 0.48,
      },
      width: 0.05,
      height: 0.05,
      layers: ["top", "bottom"],
      connectedTo: [`foreign_${i}`],
      obstacleId: `obstacle_${i}`,
    }),
  )
  if (blocked) {
    obstacles[0] = {
      type: "rect",
      center: { x: 0, y: 0 },
      width: 2,
      height: 12,
      layers: ["top", "bottom"],
      connectedTo: ["GND"],
      obstacleId: "wall",
    }
  }
  return {
    layerCount: 2,
    minTraceWidth: 0.15,
    bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
    obstacles,
    connections: Array.from({ length: 200 }, (_, i) => ({
      name: `signal_${i}`,
      pointsToConnect: [
        { x: -3, y: -4 + i * 0.04, layer: "top" },
        { x: 3, y: -4 + i * 0.04, layer: "top" },
      ],
    })),
  }
}

for (const blocked of [false, true]) {
  test(`completes all supported connections on a ${blocked ? "blocked" : "clear"} dense board`, () => {
    const input = denseBoard(blocked)
    const before = structuredClone(input)
    const solver = new PreflightRoutingSolver(input)
    solver.step()
    expect(solver.solved).toBe(false)
    expect(solver.failed).toBe(false)
    solver.solve()

    expect(solver.error).toBeNull()
    expect(solver.failed).toBe(false)
    expect(solver.solved).toBe(true)
    expect(solver.computeProgress()).toBe(1)
    const output = solver.getOutput()
    expect(output.skippedChecks).toEqual([])
    expect(output.measurements.analyzed_connection_count).toBe(200)
    expect(output.diagnostics.map((d) => d.connectionName)).toEqual(
      blocked ? input.connections.map((c) => c.name) : [],
    )
    if (blocked) {
      expect(
        output.diagnostics.every((d) => d.obstacleIds.includes("wall")),
      ).toBe(true)
    }
    expect(input).toEqual(before)
  })
}

test("callers can still impose a smaller iteration budget", () => {
  const solver = new PreflightRoutingSolver(denseBoard(false))
  solver.MAX_ITERATIONS = 10
  solver.solve()
  expect(solver.failed).toBe(true)
  expect(solver.solved).toBe(false)
  expect(solver.iterations).toBe(10)
  expect(solver.getOutput().measurements.analyzed_connection_count).toBe(0)
})

test("a narrow traversal frontier can finish at the supported grid limit", () => {
  const solver = new PreflightRoutingSolver({
    layerCount: 1,
    minTraceWidth: 0.15,
    bounds: { minX: 0, maxX: 8192, minY: 0, maxY: 0.25 },
    obstacles: [],
    connections: Array.from({ length: 4 }, (_, i) => ({
      name: `signal_${i}`,
      pointsToConnect: [
        { x: 0.125, y: 0.125, layer: "top" },
        { x: 8191.875, y: 0.125, layer: "top" },
      ],
    })),
  })
  solver.solve()
  expect(solver.failed).toBe(false)
  expect(solver.solved).toBe(true)
  expect(solver.getOutput()).toMatchObject({
    diagnostics: [],
    skippedChecks: [],
    measurements: {
      grid_cell_count: 32768,
      analyzed_connection_count: 4,
    },
  })
})
