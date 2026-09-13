import { PreflightRoutingDebugger } from "./components/PreflightRoutingDebugger"
import { blockedBoard } from "tests/fixtures/boards"

export default (
  <PreflightRoutingDebugger
    input={{
      ...blockedBoard,
      outline: [
        { x: -5, y: -5 },
        { x: 5, y: -5 },
        { x: 5, y: 5 },
        { x: -5, y: 5 },
      ],
    }}
  />
)
