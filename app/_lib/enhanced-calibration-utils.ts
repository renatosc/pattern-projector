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
  // Validate inputs
  if (!corners || corners.length !== 4) {
    throw new Error("getAllGridPoints requires exactly 4 corner points");
  }

  if (!gridDensity || gridDensity.rows < 2 || gridDensity.cols < 2) {
    throw new Error("getAllGridPoints requires grid density of at least 2x2");
  }

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
        // Inner intersection points - check if they exist
        const innerRowIndex = row - 1;
        const innerColIndex = col - 1;

        if (innerPoints[innerRowIndex] && innerPoints[innerRowIndex][innerColIndex]) {
          rowPoints.push(innerPoints[innerRowIndex][innerColIndex]);
        } else {
          // Fallback: generate point if inner point doesn't exist
          const u = col / (gridDensity.cols - 1);
          const v = row / (gridDensity.rows - 1);
          const x = interpolateBilinear(tl.x, tr.x, bl.x, br.x, u, v);
          const y = interpolateBilinear(tl.y, tr.y, bl.y, br.y, u, v);
          rowPoints.push({
            x, y,
            id: `grid-${row}-${col}`,
            isCorner: false
          });
        }
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

// Track which inner points have been manually adjusted
export interface InnerPointState {
  point: GridPoint;
  isManuallyAdjusted: boolean;
  originalGridPosition: { row: number; col: number }; // For reference
}

// Update inner points while preserving manual adjustments when corners change
export function updateInnerPointsPreservingAdjustments(
  oldCorners: GridPoint[],
  newCorners: GridPoint[],
  currentInnerPoints: GridPoint[][],
  manuallyAdjustedIds: Set<string>,
  gridDensity: { rows: number; cols: number }
): GridPoint[][] {
  // Validate inputs
  if (!oldCorners || oldCorners.length !== 4 || !newCorners || newCorners.length !== 4) {
    // If corners are invalid, regenerate all points
    return generateInnerPoints(newCorners || [], gridDensity);
  }

  if (!currentInnerPoints || currentInnerPoints.length === 0) {
    // If no current inner points, generate new ones
    return generateInnerPoints(newCorners, gridDensity);
  }

  const newInnerPoints: GridPoint[][] = [];

  // Calculate transformation between old and new corners
  const transformation = calculateGridTransformation(oldCorners, newCorners);

  for (let row = 1; row < gridDensity.rows - 1; row++) {
    const rowPoints: GridPoint[] = [];
    for (let col = 1; col < gridDensity.cols - 1; col++) {
      const currentPoint = currentInnerPoints[row - 1]?.[col - 1];

      if (currentPoint && manuallyAdjustedIds.has(currentPoint.id)) {
        // Apply transformation to manually adjusted points
        const transformedPoint = applyTransformationToPoint(currentPoint, transformation);
        rowPoints.push(transformedPoint);
      } else {
        // Generate new point using bilinear interpolation
        const u = col / (gridDensity.cols - 1);
        const v = row / (gridDensity.rows - 1);
        const [tl, tr, br, bl] = newCorners;
        const x = interpolateBilinear(tl.x, tr.x, bl.x, br.x, u, v);
        const y = interpolateBilinear(tl.y, tr.y, bl.y, br.y, u, v);

        rowPoints.push({
          x,
          y,
          id: `grid-${row}-${col}`,
          isCorner: false
        });
      }
    }
    newInnerPoints.push(rowPoints);
  }

  return newInnerPoints;
}

// Calculate transformation matrix between old and new corner positions
function calculateGridTransformation(oldCorners: GridPoint[], newCorners: GridPoint[]) {
  // For now, use a simple approach: calculate the change in each corner
  // and apply proportional transformation to inner points
  const cornerChanges = oldCorners.map((oldCorner, i) => ({
    dx: newCorners[i].x - oldCorner.x,
    dy: newCorners[i].y - oldCorner.y,
  }));

  return { cornerChanges, oldCorners, newCorners };
}

// Apply transformation to a point based on its position relative to corners
function applyTransformationToPoint(
  point: GridPoint,
  transformation: { cornerChanges: { dx: number; dy: number }[]; oldCorners: GridPoint[]; newCorners: GridPoint[] }
): GridPoint {
  const { cornerChanges, oldCorners, newCorners } = transformation;

  // Calculate the point's position relative to the old corner rectangle
  const [tl, tr, br, bl] = oldCorners;

  // Use barycentric coordinates to find how the point should move
  // Simple approach: weighted average of corner movements based on distance
  let totalWeight = 0;
  let weightedDx = 0;
  let weightedDy = 0;

  oldCorners.forEach((corner, i) => {
    const distance = Math.sqrt((point.x - corner.x) ** 2 + (point.y - corner.y) ** 2);
    const weight = distance > 0 ? 1 / distance : 1000; // Avoid division by zero

    totalWeight += weight;
    weightedDx += cornerChanges[i].dx * weight;
    weightedDy += cornerChanges[i].dy * weight;
  });

  const avgDx = totalWeight > 0 ? weightedDx / totalWeight : 0;
  const avgDy = totalWeight > 0 ? weightedDy / totalWeight : 0;

  return {
    ...point,
    x: point.x + avgDx,
    y: point.y + avgDy,
  };
}
