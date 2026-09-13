import { GenericSolverDebugger } from "@tscircuit/solver-utils/react"
import { PreflightRoutingSolver } from "lib"
import { blockedBoard } from "tests/fixtures/boards"

export default (
  <GenericSolverDebugger
    createSolver={() => new PreflightRoutingSolver(blockedBoard)}
  />
)
