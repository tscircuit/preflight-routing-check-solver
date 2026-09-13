import { visualizePreflightRouting } from "./visualizePreflightRouting"
import { BaseSolver } from "@tscircuit/solver-utils"
import { ConnectivityMap } from "circuit-json-to-connectivity-map"
import type { GraphicsObject } from "graphics-debug"
import type {
  PreflightConnection,
  PreflightObstacle,
  PreflightRoutingInput,
  PreflightRoutingOptions,
  PreflightRoutingOutput,
  PreflightRoutingDiagnostic,
} from "./types"

export class PreflightRoutingSolver extends BaseSolver {
  private output: PreflightRoutingOutput = {
    diagnostics: [],
    measurements: {},
    skippedChecks: [],
  }
  private connectivity = new ConnectivityMap({})
  private connectionIndex = 0
  private activeCheck?: Generator<void, PreflightRoutingDiagnostic | undefined>
  private layers: string[] = []
  private nx = 0
  private ny = 0
  private dx = 0
  private dy = 0
  private cellCount = 0
  private visitedCells = 0
  private options: Required<PreflightRoutingOptions>

  constructor(
    private input: PreflightRoutingInput,
    options: PreflightRoutingOptions = {},
  ) {
    super()
    this.options = {
      cellSize: 0.25,
      maxGridCells: 32768,
      maxConnections: 256,
      maxObstacles: 2000,
      ...options,
    }
    for (const value of Object.values(this.options)) {
      if (!Number.isFinite(value) || value <= 0)
        throw new Error("Preflight limits must be positive finite numbers")
    }
  }

  override _setup() {
    const { bounds, connections, obstacles, layerCount } = this.input
    const width = bounds.maxX - bounds.minX
    const height = bounds.maxY - bounds.minY
    if (
      ![width, height, this.input.minTraceWidth].every(
        (v) => Number.isFinite(v) && v > 0,
      ) ||
      ![1, 2, 4, 6, 8, 10].includes(layerCount)
    ) {
      this.skip("Invalid board dimensions, trace width, or layer count")
      return
    }
    this.layers =
      layerCount === 1
        ? ["top"]
        : [
            "top",
            ...Array.from(
              { length: layerCount - 2 },
              (_, i) => `inner${i + 1}`,
            ),
            "bottom",
          ]
    const estimatedLength = connections.reduce((sum, connection) => {
      if (connection.pointsToConnect.length !== 2) return sum
      const [a, b] = connection.pointsToConnect
      return sum + Math.abs(a.x - b.x) + Math.abs(a.y - b.y)
    }, 0)
    if (!Number.isFinite(estimatedLength)) {
      this.skip("Nonfinite terminal coordinates")
      return
    }
    this.output.measurements = {
      connection_count: connections.length,
      obstacle_count: obstacles.length,
      estimated_manhattan_length_mm: estimatedLength,
      estimated_trace_density:
        (estimatedLength * this.input.minTraceWidth) /
        (width * height * layerCount),
      measured_connection_count: connections.filter(
        (c) => c.pointsToConnect.length === 2,
      ).length,
      analyzed_connection_count: 0,
    }
    if (
      connections.length > this.options.maxConnections ||
      obstacles.length > this.options.maxObstacles
    ) {
      this.skip("Input exceeds analysis limits")
      return
    }
    const unsupported =
      this.input.outline ||
      this.input.allowJumpers ||
      this.input.jumpers?.length ||
      this.input.traces?.length ||
      obstacles.some(
        (o) =>
          o.ccwRotationDegrees ||
          o.isCopperPour ||
          o.offBoardConnectsTo?.length ||
          !["rect", "circle"].includes(o.shape ?? o.type ?? ""),
      )
    if (unsupported) {
      this.skip(
        "Outline, rotated obstacles, pours, off-board connections, jumpers, or preloaded copper are not supported",
      )
      return
    }
    if (
      obstacles.some(
        (o) =>
          ![o.width, o.height, o.center.x, o.center.y].every(Number.isFinite) ||
          o.width < 0 ||
          o.height < 0 ||
          o.layers.some((l) => !this.layers.includes(l)),
      )
    ) {
      this.skip("Unsupported obstacle geometry or layers")
      return
    }
    this.nx = Math.ceil(width / this.options.cellSize)
    this.ny = Math.ceil(height / this.options.cellSize)
    this.cellCount = this.nx * this.ny
    if (this.cellCount * layerCount > this.options.maxGridCells) {
      this.skip("Grid exceeds analysis limits")
      return
    }
    this.dx = width / this.nx
    this.dy = height / this.ny
    Object.assign(this.output.measurements, {
      grid_cell_count: this.cellCount * layerCount,
      grid_cell_width_mm: this.dx,
      grid_cell_height_mm: this.dy,
    })
    for (const connection of connections) {
      this.connectivity.addConnections([
        [
          connection.name,
          connection.rootConnectionName,
          connection.netConnectionName,
          connection.__netConnectionName,
          ...(connection.mergedConnectionNames ?? []),
          ...(connection.__rootConnectionNames ?? []),
          ...connection.pointsToConnect.flatMap((p) => [
            p.pcb_port_id,
            p.pointId,
          ]),
        ].filter((v): v is string => typeof v === "string"),
      ])
    }
    for (const obstacle of obstacles)
      this.connectivity.addConnections([obstacle.connectedTo])
  }

  private skip(reason: string, connectionName?: string) {
    this.output.skippedChecks.push({
      check: "fixed_obstacle_connectivity",
      reason,
      connectionName,
    })
    if (connectionName === undefined) this.solved = true
  }

  private owns(obstacle: PreflightObstacle, connection: PreflightConnection) {
    return obstacle.connectedTo.some((id) =>
      this.connectivity.areIdsConnected(id, connection.name),
    )
  }

  private *checkConnection(
    connection: PreflightConnection,
  ): Generator<void, PreflightRoutingDiagnostic | undefined> {
    const { bounds, obstacles } = this.input
    if (connection.pointsToConnect.length !== 2 || connection.isOffBoard) {
      this.skip(
        "Only on-board two-terminal connections are supported",
        connection.name,
      )
      return
    }
    const pointLayers = (p: PreflightConnection["pointsToConnect"][number]) =>
      p.layers ?? (p.layer ? [p.layer] : [])
    if (
      connection.pointsToConnect.some(
        (p) =>
          p.x < bounds.minX ||
          p.x > bounds.maxX ||
          p.y < bounds.minY ||
          p.y > bounds.maxY ||
          !pointLayers(p).length ||
          pointLayers(p).some((l) => !this.layers.includes(l)),
      )
    ) {
      this.skip(
        "Terminal outside bounds or unsupported terminal layers",
        connection.name,
      )
      return
    }
    const blocked = new Uint8Array(this.cellCount * this.layers.length)
    const obstacleIds: string[] = []
    for (const obstacle of obstacles) {
      if (this.owns(obstacle, connection)) continue
      const w =
        (obstacle.shape ?? obstacle.type) === "circle"
          ? Math.min(obstacle.width, obstacle.height) / Math.SQRT2
          : obstacle.width
      const h =
        (obstacle.shape ?? obstacle.type) === "circle" ? w : obstacle.height
      const x0 = obstacle.center.x - w / 2,
        x1 = obstacle.center.x + w / 2
      const y0 = obstacle.center.y - h / 2,
        y1 = obstacle.center.y + h / 2
      // Only wholly covered cells are removed. Clearances and trace width are
      // deliberately ignored, so this graph admits more paths than copper can.
      const ix0 = Math.max(0, Math.ceil((x0 - bounds.minX) / this.dx))
      const ix1 = Math.min(
        this.nx - 1,
        Math.floor((x1 - bounds.minX) / this.dx) - 1,
      )
      const iy0 = Math.max(0, Math.ceil((y0 - bounds.minY) / this.dy))
      const iy1 = Math.min(
        this.ny - 1,
        Math.floor((y1 - bounds.minY) / this.dy) - 1,
      )
      for (const layer of obstacle.layers) {
        const offset = this.layers.indexOf(layer) * this.cellCount
        for (let y = iy0; y <= iy1; y++)
          for (let x = ix0; x <= ix1; x++) blocked[offset + y * this.nx + x] = 1
      }
      if (ix0 <= ix1 && iy0 <= iy1 && obstacle.obstacleId)
        obstacleIds.push(obstacle.obstacleId)
      yield
    }
    const seeds = (p: PreflightConnection["pointsToConnect"][number]) => {
      const result = new Set<number>()
      const addRect = (
        minX: number,
        maxX: number,
        minY: number,
        maxY: number,
        layers: string[],
      ) => {
        const ix0 = Math.max(0, Math.ceil((minX - bounds.minX) / this.dx) - 1)
        const ix1 = Math.min(
          this.nx - 1,
          Math.floor((maxX - bounds.minX) / this.dx),
        )
        const iy0 = Math.max(0, Math.ceil((minY - bounds.minY) / this.dy) - 1)
        const iy1 = Math.min(
          this.ny - 1,
          Math.floor((maxY - bounds.minY) / this.dy),
        )
        for (const layer of layers)
          for (let y = iy0; y <= iy1; y++)
            for (let x = ix0; x <= ix1; x++)
              result.add(
                this.layers.indexOf(layer) * this.cellCount + y * this.nx + x,
              )
      }
      addRect(p.x, p.x, p.y, p.y, pointLayers(p))
      for (const obstacle of obstacles) {
        if (
          !this.owns(obstacle, connection) ||
          Math.abs(obstacle.center.x - p.x) > obstacle.width / 2 ||
          Math.abs(obstacle.center.y - p.y) > obstacle.height / 2 ||
          !obstacle.layers.some((l) => pointLayers(p).includes(l))
        )
          continue
        // Include the whole terminal pad and wire contact envelope as possible
        // attachment points, rather than requiring escape from the pad center.
        const radius =
          Math.max(
            this.input.minTraceWidth,
            connection.nominalTraceWidth ?? 0,
          ) / 2
        addRect(
          obstacle.center.x - obstacle.width / 2 - radius,
          obstacle.center.x + obstacle.width / 2 + radius,
          obstacle.center.y - obstacle.height / 2 - radius,
          obstacle.center.y + obstacle.height / 2 + radius,
          obstacle.layers,
        )
      }
      return result
    }
    const starts = seeds(connection.pointsToConnect[0])
    const targets = seeds(connection.pointsToConnect[1])
    const seen = new Uint8Array(blocked.length)
    const queue = new Int32Array(blocked.length)
    let head = 0,
      tail = 0
    for (const start of starts)
      if (!blocked[start]) {
        seen[start] = 1
        queue[tail++] = start
      }
    this.output.measurements.analyzed_connection_count++
    while (head < tail) {
      const end = Math.min(head + 512, tail)
      while (head < end) {
        const v = queue[head++]
        if (targets.has(v)) return
        const z = Math.floor(v / this.cellCount),
          cell = v % this.cellCount,
          x = cell % this.nx,
          y = Math.floor(cell / this.nx)
        const enqueue = (next: number) => {
          if (!seen[next] && !blocked[next]) {
            seen[next] = 1
            queue[tail++] = next
          }
        }
        for (let oy = -1; oy <= 1; oy++)
          for (let ox = -1; ox <= 1; ox++) {
            const xx = x + ox,
              yy = y + oy
            if (xx >= 0 && xx < this.nx && yy >= 0 && yy < this.ny)
              enqueue(z * this.cellCount + yy * this.nx + xx)
          }
        // Unrestricted layer changes deliberately relax via placement rules.
        for (let zz = 0; zz < this.layers.length; zz++)
          enqueue(zz * this.cellCount + cell)
      }
      this.visitedCells = tail
      yield
    }
    return {
      code: "fixed_obstacle_disconnect",
      connectionName: connection.name,
      message: `No path for ${connection.name} through the relaxed fixed-obstacle grid. Move the blocking geometry or provide an escape on another layer.`,
      pcbPortIds: connection.pointsToConnect.flatMap((p) =>
        p.pcb_port_id ? [p.pcb_port_id] : [],
      ),
      obstacleIds: [...new Set(obstacleIds)],
    }
  }

  override _step() {
    if (this.connectionIndex >= this.input.connections.length) {
      this.solved = true
      return
    }
    this.activeCheck ??= this.checkConnection(
      this.input.connections[this.connectionIndex],
    )
    const next = this.activeCheck.next()
    if (next.done) {
      if (next.value) this.output.diagnostics.push(next.value)
      this.connectionIndex++
      this.activeCheck = undefined
    }
    this.stats = {
      ...this.output.measurements,
      visited_cells: this.visitedCells,
      completed_connections: this.connectionIndex,
      diagnostics: this.output.diagnostics.length,
    }
  }

  computeProgress() {
    return this.solved
      ? 1
      : this.connectionIndex / Math.max(1, this.input.connections.length)
  }
  override getConstructorParams() {
    return [this.input, this.options]
  }
  override getOutput(): PreflightRoutingOutput {
    return this.output
  }

  override visualize(): GraphicsObject {
    return visualizePreflightRouting(this.input, this.output, {
      solved: this.solved,
      failed: this.failed,
      error: this.error,
      completedConnections: this.connectionIndex,
    })
  }
}
