import { expect, test } from "bun:test"
import { convertSrjToGraphicsObject } from "@tscircuit/capacity-autorouter"
import { PreflightRoutingSolver } from "lib"
import { blockedBoard, alternateLayerBoard } from "./fixtures/boards"

test("visualization preserves SRJ layer geometry and distinguishes pending, blocked, clear and skipped checks", () => {
  const solver = new PreflightRoutingSolver(blockedBoard)
  const pending = solver.visualize()
  expect(pending.rects).toEqual(convertSrjToGraphicsObject(blockedBoard).rects)
  expect(pending.points).toHaveLength(32)
  expect(pending.title).toContain("NOT COMPLETE")
  expect(
    pending.lines?.filter((l) => l.strokeColor === "#a21caf"),
  ).toHaveLength(0)
  solver.solve()
  const final = solver.visualize()
  expect(final.title).toContain("16 BLOCKED CONNECTIONS")
  expect(final.circles?.filter((c) => c.stroke === "#a21caf")).toHaveLength(32)
  expect(
    final.texts?.some((t) => t.text.includes("fixed_obstacle_disconnect")),
  ).toBe(true)
  expect(
    final.lines?.filter((l) => l.label?.includes("Connection requirement")),
  ).toHaveLength(16)
  expect(final.points?.every((p) => p.label?.includes("BLOCKED"))).toBe(true)
  const alternate = new PreflightRoutingSolver(alternateLayerBoard)
  alternate.solve()
  expect(alternate.visualize().title).toContain("NO FIXED-OBSTACLE BLOCK FOUND")
  expect(alternate.visualize().circles).toHaveLength(0)
  const skipped = new PreflightRoutingSolver({
    ...blockedBoard,
    outline: [
      { x: -5, y: -5 },
      { x: 5, y: -5 },
      { x: 5, y: 5 },
      { x: -5, y: 5 },
    ],
  })
  skipped.solve()
  expect(skipped.visualize().title).toContain("CHECK SKIPPED")
  expect(
    skipped.visualize().texts?.some((t) => t.text.includes("SKIPPED")),
  ).toBe(true)
  expect(
    skipped.visualize().points?.every((p) => p.label?.includes("NOT CHECKED")),
  ).toBe(true)
})
