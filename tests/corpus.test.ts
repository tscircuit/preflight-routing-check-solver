import { expect, test } from "bun:test"
import { PreflightRoutingSolver, type PreflightRoutingInput } from "lib"
import corpus from "./fixtures/routing-corpus.json"

test("retain previously routed controls from the 35-board Pipeline9 corpus", () => {
  let passingControls = 0,
    blocked = 0
  for (const fixture of corpus) {
    const solver = new PreflightRoutingSolver(
      fixture.input as PreflightRoutingInput,
    )
    solver.solve()
    expect(solver.failed).toBe(false)
    if (fixture.previouslyRouted) {
      passingControls++
      expect(solver.getOutput().diagnostics).toEqual([])
    }
    if (solver.getOutput().diagnostics.length) blocked++
  }
  expect(passingControls).toBe(13)
  expect(blocked).toBeGreaterThan(0)
  console.log({ fixtures: corpus.length, passingControls, blocked })
})
