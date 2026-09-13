import type { PreflightRoutingInput } from "lib"

export const blockedBoard: PreflightRoutingInput = {
  layerCount: 2,
  minTraceWidth: 0.15,
  bounds: { minX: -5, maxX: 5, minY: -5, maxY: 5 },
  obstacles: [
    {
      type: "rect",
      center: { x: 0, y: 0 },
      width: 2,
      height: 12,
      layers: ["top", "bottom"],
      connectedTo: ["GND"],
      obstacleId: "wall",
    },
  ],
  connections: Array.from({ length: 16 }, (_, i) => ({
    name: `signal_${i}`,
    pointsToConnect: [
      { x: -3, y: -3.75 + i * 0.5, layer: "top", pcb_port_id: `left_${i}` },
      { x: 3, y: -3.75 + i * 0.5, layer: "top", pcb_port_id: `right_${i}` },
    ],
  })),
}
export const openBoard: PreflightRoutingInput = {
  ...blockedBoard,
  obstacles: [{ ...blockedBoard.obstacles[0], height: 5 }],
}
export const alternateLayerBoard: PreflightRoutingInput = {
  ...blockedBoard,
  obstacles: [{ ...blockedBoard.obstacles[0], layers: ["top"] }],
}
