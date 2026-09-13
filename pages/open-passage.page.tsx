import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { PreflightRoutingSolver } from "lib"
import { openBoard } from "tests/fixtures/boards"

export default (
  <GenericSolverDebugger
    createSolver={() => new PreflightRoutingSolver(openBoard)}
  />
)
