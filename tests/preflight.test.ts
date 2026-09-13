import { expect, test } from "bun:test"
import { PreflightRoutingSolver } from "lib"
import { blockedBoard, openBoard, alternateLayerBoard } from "./fixtures/boards"

const run = (input: typeof blockedBoard) => {
  const s = new PreflightRoutingSolver(input)
  s.solve()
  expect(s.failed).toBe(false)
  expect(s.solved).toBe(true)
  return s.getOutput()
}

test("all-layer barrier reports each blocked obligation and terminal IDs", () => {
  const result = run(blockedBoard)
  expect(result.diagnostics).toHaveLength(16)
  expect(result.diagnostics[0]).toMatchObject({
    code: "fixed_obstacle_disconnect",
    connectionName: "signal_0",
    pcbPortIds: ["left_0", "right_0"],
    obstacleIds: ["wall"],
  })
  expect(result.measurements.analyzed_connection_count).toBe(16)
})

test("same trace count and density can have an open passage or another layer", () => {
  const blocked = run(blockedBoard)
  for (const input of [openBoard, alternateLayerBoard]) {
    const result = run(input)
    expect(result.diagnostics).toEqual([])
    expect(result.measurements.estimated_trace_density).toBe(
      blocked.measurements.estimated_trace_density,
    )
  }
})

test("a sub-cell legal passage is kept open by optimistic rasterization", () => {
  const result = run({
    ...blockedBoard,
    obstacles: [
      { ...blockedBoard.obstacles[0], center: { x: 0, y: -3 }, height: 5.9 },
      { ...blockedBoard.obstacles[0], center: { x: 0, y: 3 }, height: 5.9 },
    ],
  })
  expect(result.diagnostics).toEqual([])
})

test("foreign obstacle aliases on the same net do not block escape", () => {
  const result = run({
    ...blockedBoard,
    connections: [
      { ...blockedBoard.connections[0], rootConnectionName: "net_alias" },
    ],
    obstacles: [{ ...blockedBoard.obstacles[0], connectedTo: ["net_alias"] }],
  })
  expect(result.diagnostics).toEqual([])
})

test("terminal attachment uses the whole pad instead of its center", () => {
  const connection = {
    name: "signal",
    pointsToConnect: [
      { x: -0.5, y: 0, layer: "top", pcb_port_id: "p1" },
      { x: 3, y: 0, layer: "top" },
    ],
  }
  const result = run({
    ...blockedBoard,
    connections: [connection],
    obstacles: [
      blockedBoard.obstacles[0],
      {
        type: "rect",
        center: { x: 0, y: 0 },
        width: 4,
        height: 1,
        layers: ["top"],
        connectedTo: ["p1"],
      },
    ],
  })
  expect(result.diagnostics).toEqual([])
})

test("unsupported geometry and exhausted resource limits are unknown, not blockers", () => {
  for (const input of [
    {
      ...blockedBoard,
      outline: [
        { x: -5, y: -5 },
        { x: 5, y: 5 },
      ],
    },
    { ...blockedBoard, allowJumpers: true },
    {
      ...blockedBoard,
      obstacles: [{ ...blockedBoard.obstacles[0], ccwRotationDegrees: 45 }],
    },
    {
      ...blockedBoard,
      traces: [
        {
          type: "pcb_trace" as const,
          pcb_trace_id: "t",
          connection_name: "signal",
          route: [],
        },
      ],
    },
  ]) {
    const result = run(input)
    expect(result.diagnostics).toEqual([])
    expect(result.skippedChecks.length).toBeGreaterThan(0)
  }
  const solver = new PreflightRoutingSolver(blockedBoard, { maxGridCells: 10 })
  solver.solve()
  expect(solver.getOutput().diagnostics).toEqual([])
  expect(solver.getOutput().skippedChecks[0].reason).toBe(
    "Grid exceeds analysis limits",
  )
})

test("stepping is deterministic and preserves reusable constructor input", () => {
  const input = structuredClone(blockedBoard)
  const before = structuredClone(input)
  const solver = new PreflightRoutingSolver(input)
  solver.step()
  expect(solver.solved).toBe(false)
  expect(solver.getOutput().diagnostics).toEqual([])
  while (!solver.solved && !solver.failed) solver.step()
  expect(solver.getOutput()).toEqual(run(blockedBoard))
  expect(input).toEqual(before)
  expect(solver.getConstructorParams()[0]).toEqual(before)
  expect(solver.visualize().lines?.length).toBe(16)
})
