import type { SimpleRouteJson } from "@tscircuit/capacity-autorouter"

export type PreflightRoutingInput = SimpleRouteJson
export type PreflightConnection = PreflightRoutingInput["connections"][number]
export type PreflightObstacle = PreflightRoutingInput["obstacles"][number]

export interface PreflightRoutingDiagnostic {
  code: string
  message: string
  connectionName: PreflightConnection["name"]
  pcbPortIds: string[]
  obstacleIds: string[]
}

export interface PreflightRoutingOutput {
  diagnostics: PreflightRoutingDiagnostic[]
  measurements: Record<string, number>
  skippedChecks: Array<{
    check: string
    reason: string
    connectionName?: string
  }>
}

export interface PreflightRoutingOptions {
  cellSize?: number
  maxGridCells?: number
  maxConnections?: number
  maxObstacles?: number
}
