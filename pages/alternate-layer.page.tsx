import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { PreflightRoutingSolver } from "lib"
import { alternateLayerBoard } from "tests/fixtures/boards"

export default (
  <GenericSolverDebugger
    createSolver={() => new PreflightRoutingSolver(alternateLayerBoard)}
  />
)
