import { Point } from "@/_lib/point";
import { GridPoint, EnhancedPointAction } from "@/_lib/enhanced-calibration-types";

// Bilinear interpolation to calculate inner point positions
export function interpolateBilinear(
  tl: number,
  tr: number,
  bl: number,
  br: number,
  u: number,
  v: number
): number {
  return tl * (1 - u) * (1 - v) +
         tr * u * (1 - v) +
         bl * (1 - u) * v +
         br * u * v;
}

// Generate inner grid points based on corners - positioned at actual grid line intersections
export function generateInnerPoints(
  corners: GridPoint[],
  gridDensity: { rows: number; cols: number }
): GridPoint[][] {
  const [tl, tr, br, bl] = corners;
  const points: GridPoint[][] = [];

  // Generate points only at grid line intersections (excluding corners)
  for (let row = 1; row < gridDensity.rows - 1; row++) {
    const rowPoints: GridPoint[] = [];
    for (let col = 1; col < gridDensity.cols - 1; col++) {
      // Calculate normalized position (0 to 1) within the grid
      const u = col / (gridDensity.cols - 1); // horizontal position
      const v = row / (gridDensity.rows - 1); // vertical position

      // Use bilinear interpolation to find intersection of row and column lines
      const x = interpolateBilinear(tl.x, tr.x, bl.x, br.x, u, v);
      const y = interpolateBilinear(tl.y, tr.y, bl.y, br.y, u, v);

      rowPoints.push({
        x,
        y,
        id: `grid-${row}-${col}`,
        isCorner: false
      });
    }
    points.push(rowPoints);
  }

  return points;
}

// Get all grid points including corners and intersections for drawing grid lines
export function getAllGridPoints(
  corners: GridPoint[],
  innerPoints: GridPoint[][],
  gridDensity: { rows: number; cols: number }
): GridPoint[][] {
  const [tl, tr, br, bl] = corners;
  const allPoints: GridPoint[][] = [];

  for (let row = 0; row < gridDensity.rows; row++) {
    const rowPoints: GridPoint[] = [];
    for (let col = 0; col < gridDensity.cols; col++) {
      if (row === 0 && col === 0) {
        rowPoints.push(tl); // Top-left corner
      } else if (row === 0 && col === gridDensity.cols - 1) {
        rowPoints.push(tr); // Top-right corner
      } else if (row === gridDensity.rows - 1 && col === 0) {
        rowPoints.push(bl); // Bottom-left corner
      } else if (row === gridDensity.rows - 1 && col === gridDensity.cols - 1) {
        rowPoints.push(br); // Bottom-right corner
      } else if (row === 0 || row === gridDensity.rows - 1 || col === 0 || col === gridDensity.cols - 1) {
        // Edge points - calculate using interpolation
        const u = col / (gridDensity.cols - 1);
        const v = row / (gridDensity.rows - 1);
        const x = interpolateBilinear(tl.x, tr.x, bl.x, br.x, u, v);
        const y = interpolateBilinear(tl.y, tr.y, bl.y, br.y, u, v);
        rowPoints.push({
          x, y,
          id: `edge-${row}-${col}`,
          isCorner: false
        });
      } else {
        // Inner intersection points
        rowPoints.push(innerPoints[row - 1][col - 1]);
      }
    }
    allPoints.push(rowPoints);
  }

  return allPoints;
}

// Convert legacy Point[] to GridPoint[]
export function pointsToGridPoints(points: Point[]): GridPoint[] {
  return points.map((point, index) => ({
    ...point,
    id: `corner-${index}`,
    isCorner: true
  }));
}

// Convert GridPoint[] back to Point[] for compatibility
export function gridPointsToPoints(gridPoints: GridPoint[]): Point[] {
  return gridPoints.map(({ x, y }) => ({ x, y }));
}
