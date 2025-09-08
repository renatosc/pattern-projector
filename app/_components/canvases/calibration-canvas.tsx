import React, {
  Dispatch,
  SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { CanvasState, drawPolygon, drawGrid } from "@/_lib/drawing";
import {
  getPerspectiveTransformFromPoints,
  transformPoint,
} from "@/_lib/geometry";
import { minIndex, sqrDist, sqrDistToLine } from "@/_lib/geometry";
import { Point } from "@/_lib/point";
import { DisplaySettings, strokeColor } from "@/_lib/display-settings";
import useProgArrowKeyPoints from "@/_hooks/use-prog-arrow-key-points";
import { useKeyDown } from "@/_hooks/use-key-down";
import { KeyCode } from "@/_lib/key-code";
import { PointAction } from "@/_reducers/pointsReducer";
import { FullScreenHandle } from "react-full-screen";
import Matrix from "ml-matrix";
import { getCalibrationContextUpdatedWithEvent } from "@/_lib/calibration-context";
import { GridPoint } from "@/_lib/enhanced-calibration-types";
import {
  generateInnerPoints,
  pointsToGridPoints,
  gridPointsToPoints,
  getAllGridPoints,
  updateInnerPointsPreservingAdjustments,
} from "@/_lib/enhanced-calibration-utils";

const maxPoints = 4; // One point per vertex in rectangle
const cornerMargin = 96;

export default function CalibrationCanvas({
  className,
  points,
  dispatch,
  width,
  height,
  isCalibrating,
  unitOfMeasure,
  displaySettings,
  corners,
  setCorners,
  fullScreenHandle,
  onGridDensityChange,
}: {
  className: string | undefined;
  points: Point[];
  dispatch: Dispatch<PointAction>;
  width: number;
  height: number;
  isCalibrating: boolean;
  unitOfMeasure: string;
  displaySettings: DisplaySettings;
  corners: Set<number>;
  setCorners: Dispatch<SetStateAction<Set<number>>>;
  fullScreenHandle: FullScreenHandle;
  onGridDensityChange?: (density: { rows: number; cols: number }) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoverCorners, setHoverCorners] = useState<Set<number>>(new Set());
  const [dragPoint, setDragPoint] = useState<Point | null>(null);
  const [hoveredInnerPointId, setHoveredInnerPointId] = useState<string | null>(
    null,
  );

  // Enhanced calibration state
  const [gridDensity, setGridDensity] = useState({ rows: 8, cols: 8 });
  const [innerPoints, setInnerPoints] = useState<GridPoint[][]>([]);
  const [selectedInnerPointId, setSelectedInnerPointId] = useState<
    string | null
  >(null);
  const [manuallyAdjustedIds, setManuallyAdjustedIds] = useState<Set<string>>(
    new Set(),
  );
  const [previousCorners, setPreviousCorners] = useState<GridPoint[]>([]);

  // Generate inner points when corners or grid density changes
  useEffect(() => {
    if (points.length === maxPoints) {
      const gridCorners = pointsToGridPoints(points);

      // Check if corners have changed (and we have previous corners)
      if (previousCorners.length === 4 && innerPoints.length > 0) {
        // Preserve manual adjustments when corners change
        const newInnerPoints = updateInnerPointsPreservingAdjustments(
          previousCorners,
          gridCorners,
          innerPoints,
          manuallyAdjustedIds,
          gridDensity,
        );
        setInnerPoints(newInnerPoints);
      } else {
        // Initial generation or grid density changed - regenerate all points
        const newInnerPoints = generateInnerPoints(gridCorners, gridDensity);
        setInnerPoints(newInnerPoints);
        // Clear manually adjusted IDs when grid density changes
        setManuallyAdjustedIds(new Set());
      }

      // Update previous corners for next comparison
      setPreviousCorners(gridCorners);
    }
  }, [points, gridDensity]);

  // Notify parent component of grid density changes
  useEffect(() => {
    if (onGridDensityChange) {
      onGridDensityChange(gridDensity);
    }
  }, [gridDensity, onGridDensityChange]);

  useEffect(() => {
    if (
      canvasRef !== null &&
      canvasRef.current !== null &&
      points &&
      points.length === maxPoints
    ) {
      /* All drawing is done in unitsOfMeasure, ptDensity = 1.0 */
      const perspectiveMatrix = getPerspectiveTransformFromPoints(
        points,
        width,
        height,
        1.0,
        false,
      );

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");

      if (ctx !== null) {
        ctx.canvas.width = window.innerWidth;
        ctx.canvas.height = window.innerHeight;
        const cs = new CanvasState(
          ctx,
          { x: 0, y: 0 },
          points,
          width,
          height,
          perspectiveMatrix,
          isCalibrating,
          corners,
          hoverCorners,
          unitOfMeasure,
          strokeColor(displaySettings.theme),
          displaySettings,
          false,
          Matrix.identity(3),
          false,
          false,
          null,
          null,
          null,
        );
        draw(
          cs,
          innerPoints,
          selectedInnerPointId,
          hoveredInnerPointId,
          displaySettings,
          gridDensity,
        );
      }
    }
  }, [
    points,
    width,
    height,
    isCalibrating,
    corners,
    hoverCorners,
    unitOfMeasure,
    displaySettings,
    innerPoints,
    selectedInnerPointId,
    hoveredInnerPointId,
  ]);

  function isNearCenter(p: Point): boolean {
    const sum = points.reduce(
      (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
      { x: 0, y: 0 },
    );
    const center = {
      x: sum.x / points.length,
      y: sum.y / points.length,
    };
    return sqrDist(center, p) < 4 * cornerMargin ** 2;
  }

  function selectCorners(p: Point): Set<number> {
    // Don't select corners if we're near an inner point
    const innerPoint = getNearbyInnerPoint(p);
    if (innerPoint) {
      return new Set(); // Let inner point selection take priority
    }

    // Existing corner selection logic
    const corner = getNearbyCorner(p);
    if (corner !== -1) {
      return new Set([corner]);
    }
    const edges = getNearbyEdge(p);
    if (edges.length) {
      return new Set(getNearbyEdge(p));
    }
    if (isNearCenter(p)) {
      return new Set([0, 1, 2, 3]);
    }
    return new Set();
  }

  function getNearbyInnerPoint(p: Point): GridPoint | null {
    for (const row of innerPoints) {
      for (const point of row) {
        if (sqrDist(point, p) < (cornerMargin / 2) ** 2) {
          return point;
        }
      }
    }
    return null;
  }

  function getNearbyEdge(p: Point): number[] {
    const distances = points.map((a, idx) =>
      sqrDistToLine([a, points[(idx + 1) % points.length]], p),
    );
    const edge = minIndex(distances);
    if (cornerMargin ** 2 > distances[edge]) {
      return [edge, edge === points.length - 1 ? 0 : edge + 1];
    }
    return [];
  }

  function getNearbyCorner(p: Point): number {
    const distances = points.map((a) => sqrDist(a, p));
    const corner = minIndex(distances);
    if (cornerMargin ** 2 > distances[corner]) {
      return corner;
    }
    return -1;
  }

  const handleKeyDown = useCallback(
    function (e: React.KeyboardEvent) {
      if (e.code === "Escape") {
        if (corners.size) {
          if (e.target instanceof HTMLElement) {
            e.target.blur();
          }
          setCorners(new Set());
        }
      }
    },
    [corners, setCorners],
  );

  useKeyDown(
    (e: KeyboardEvent) => {
      if (corners.size === 4 || corners.size === 0) {
        setCorners(new Set([0]));
      } else {
        const inc = e.shiftKey ? 3 : 1;
        setCorners(new Set(Array.from(corners).map((c) => (c + inc) % 4)));
      }
    },
    [KeyCode.Tab],
  );

  useProgArrowKeyPoints(
    dispatch,
    corners,
    isCalibrating,
    fullScreenHandle.active,
  );

  function handlePointerDown(e: React.PointerEvent) {
    const p = { x: e.clientX, y: e.clientY };

    // First check for inner point selection
    const innerPoint = getNearbyInnerPoint(p);
    if (innerPoint) {
      setDragPoint(p);
      setSelectedInnerPointId(innerPoint.id);
      setCorners(new Set());
      setHoverCorners(new Set());
      return;
    }

    // Then check for corner/edge selection (existing logic)
    const selectedCorners = selectCorners(p);
    if (selectedCorners.size) {
      setDragPoint(p);
      setCorners(selectedCorners);
      setHoverCorners(new Set());
      setSelectedInnerPointId(null);
    }
  }

  function handlePointerMove(e: React.PointerEvent) {
    const p = { x: e.clientX, y: e.clientY };
    if (dragPoint === null) {
      // Check for hover states
      const innerPoint = getNearbyInnerPoint(p);
      if (innerPoint) {
        setHoveredInnerPointId(innerPoint.id);
        setHoverCorners(new Set());
      } else {
        setHoveredInnerPointId(null);
        setHoverCorners(selectCorners(p));
      }
    } else if (selectedInnerPointId) {
      // Handle inner point dragging - update the specific intersection point
      const newInnerPoints = innerPoints.map((row) =>
        row.map((point) =>
          point.id === selectedInnerPointId
            ? { ...point, x: p.x, y: p.y }
            : point,
        ),
      );
      setInnerPoints(newInnerPoints);
      setDragPoint(p);

      // Mark this point as manually adjusted
      setManuallyAdjustedIds((prev) => new Set(prev).add(selectedInnerPointId));
    } else if (corners.size) {
      // Existing corner dragging logic - regenerate inner points when corners move
      const newPoints = [...points];
      let dx = p.x - dragPoint.x;
      let dy = p.y - dragPoint.y;
      if (corners.size === 2) {
        // axis constrained edges.
        if (hasTopEdge(corners) || hasBottomEdge(corners)) {
          dx = 0;
        } else {
          dy = 0;
        }
      }
      for (const corner of corners) {
        const currentPoint = newPoints[corner];
        newPoints[corner] = {
          x: currentPoint.x + dx,
          y: currentPoint.y + dy,
        };
      }
      setDragPoint(p);
      dispatch({ type: "set", points: newPoints });

      // Inner points will be updated by useEffect with preservation logic
    }
  }

  function handlePointerEnd(e: React.PointerEvent) {
    /* Nothing to do. This short circuit is required to prevent setting
     * the localStorage of the points to invalid values */
    if (dragPoint === null) return;

    localStorage.setItem(
      "calibrationContext",
      JSON.stringify(
        getCalibrationContextUpdatedWithEvent(e, fullScreenHandle.active),
      ),
    );

    // Only dispatch corner point changes, inner points are managed separately
    if (!selectedInnerPointId) {
      dispatch({ type: "set", points });
    }

    setDragPoint(null);
    setSelectedInnerPointId(null);
    setHoveredInnerPointId(null);
  }

  return (
    <canvas
      tabIndex={0}
      ref={canvasRef}
      className={`${className} outline-none`}
      onKeyDown={handleKeyDown}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerEnd}
      onPointerOut={handlePointerEnd}
      onPointerLeave={handlePointerEnd}
      onPointerMove={handlePointerMove}
      style={{
        pointerEvents: isCalibrating ? "auto" : "none",
        cursor: dragPoint
          ? "none"
          : hoveredInnerPointId || hoverCorners.size > 0
            ? "grab"
            : "default",
      }}
    />
  );
}

// Export utility functions for external use
export type { GridPoint } from "@/_lib/enhanced-calibration-types";
export {
  generateInnerPoints,
  pointsToGridPoints,
  gridPointsToPoints,
  getAllGridPoints,
  updateInnerPointsPreservingAdjustments,
} from "@/_lib/enhanced-calibration-utils";

function hasTopEdge(corners: Set<number>): boolean {
  return corners.has(0) && corners.has(1);
}

function hasBottomEdge(corners: Set<number>): boolean {
  return corners.has(2) && corners.has(3);
}

function hasLeftEdge(corners: Set<number>): boolean {
  return corners.has(0) && corners.has(3);
}

function hasRightEdge(corners: Set<number>): boolean {
  return corners.has(1) && corners.has(2);
}

function draw(
  cs: CanvasState,
  innerPoints?: GridPoint[][],
  selectedInnerPointId?: string | null,
  hoveredInnerPointId?: string | null,
  displaySettings?: DisplaySettings,
  gridDensity?: { rows: number; cols: number },
): void {
  const { ctx, isCalibrating } = cs;
  if (isCalibrating) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    drawCalibration(cs, innerPoints, gridDensity);

    // Draw inner grid points if available
    if (innerPoints && displaySettings) {
      drawInnerGridPoints(
        ctx,
        innerPoints,
        selectedInnerPointId || null,
        hoveredInnerPointId || null,
        displaySettings,
      );
    }
  } else if (cs.isConcave) {
    ctx.fillStyle = cs.errorFillPattern;
    drawPolygon(ctx, cs.points);
    ctx.fill();
  }
}

function drawCalibrationPoints(cs: CanvasState) {
  const { ctx, points, corners, hoverCorners, displaySettings } = cs;

  // Draw corner points (existing logic)
  points.forEach((point, index) => {
    ctx.beginPath();
    const oneCorner = corners.size === 1 && corners.has(index);
    const radius = oneCorner ? 20 : 12;
    ctx.strokeStyle = oneCorner
      ? "rgb(147, 51, 234)"
      : strokeColor(displaySettings.theme);
    if (hoverCorners.size === 1 && hoverCorners.has(index)) {
      ctx.setLineDash([4, 4]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
    ctx.lineWidth = 2;
    ctx.stroke();
  });
}

function drawInnerGridPoints(
  ctx: CanvasRenderingContext2D,
  innerPoints: GridPoint[][],
  selectedId: string | null,
  hoveredId: string | null,
  displaySettings: DisplaySettings,
) {
  // Draw inner grid points
  ctx.strokeStyle = strokeColor(displaySettings.theme);
  ctx.lineWidth = 1;

  innerPoints.forEach((row) => {
    row.forEach((point) => {
      ctx.beginPath();
      const isSelected = selectedId === point.id;
      const isHovered = hoveredId === point.id;
      const radius = isSelected ? 8 : isHovered ? 6 : 4;

      if (isSelected) {
        ctx.fillStyle = "rgb(255, 100, 100)"; // Red for selected
        ctx.strokeStyle = "rgb(200, 50, 50)";
        ctx.lineWidth = 2;
      } else if (isHovered) {
        ctx.fillStyle = "rgba(255, 255, 100, 0.9)"; // Brighter yellow for hover
        ctx.strokeStyle = strokeColor(displaySettings.theme);
        ctx.lineWidth = 2;
        ctx.setLineDash([2, 2]); // Dashed border for hover
      } else {
        ctx.fillStyle = "rgba(255, 255, 0, 0.8)"; // Standard yellow
        ctx.strokeStyle = strokeColor(displaySettings.theme);
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
      }

      ctx.arc(point.x, point.y, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();

      // Reset line dash
      ctx.setLineDash([]);
    });
  });
}

function drawEnhancedGrid(
  ctx: CanvasRenderingContext2D,
  corners: GridPoint[],
  innerPoints: GridPoint[][],
  gridDensity: { rows: number; cols: number },
  displaySettings: DisplaySettings,
) {
  // Safety check: ensure we have valid data before drawing
  if (
    !corners ||
    corners.length !== 4 ||
    !gridDensity ||
    gridDensity.rows < 2 ||
    gridDensity.cols < 2
  ) {
    return; // Skip drawing if invalid data
  }

  const allGridPoints = getAllGridPoints(corners, innerPoints, gridDensity);

  ctx.strokeStyle = strokeColor(displaySettings.theme);
  ctx.lineWidth = 1;
  ctx.setLineDash([]);

  // Draw horizontal grid lines
  for (let row = 0; row < gridDensity.rows; row++) {
    const rowPoints = allGridPoints[row];
    ctx.beginPath();
    ctx.moveTo(rowPoints[0].x, rowPoints[0].y);
    for (let col = 1; col < rowPoints.length; col++) {
      ctx.lineTo(rowPoints[col].x, rowPoints[col].y);
    }
    ctx.stroke();
  }

  // Draw vertical grid lines
  for (let col = 0; col < gridDensity.cols; col++) {
    ctx.beginPath();
    ctx.moveTo(allGridPoints[0][col].x, allGridPoints[0][col].y);
    for (let row = 1; row < gridDensity.rows; row++) {
      ctx.lineTo(allGridPoints[row][col].x, allGridPoints[row][col].y);
    }
    ctx.stroke();
  }
}

function drawCalibration(
  cs: CanvasState,
  innerPoints?: GridPoint[][],
  gridDensity?: { rows: number; cols: number },
): void {
  const {
    ctx,
    points,
    errorFillPattern,
    isConcave,
    corners,
    hoverCorners,
    width,
    height,
  } = cs;
  if (isConcave) {
    ctx.fillStyle = errorFillPattern;
    drawPolygon(ctx, points);
    ctx.fill();
  } else {
    ctx.lineWidth = 2;
    ctx.strokeStyle = strokeColor(cs.displaySettings.theme);
    ctx.save();
    for (let i = 0; i < points.length; i++) {
      const j = (i + 1) % points.length;
      const p1 = points[i];
      const p2 = points[j];
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      const isHovered = hoverCorners.has(i) && hoverCorners.has(j);
      if (isHovered) {
        ctx.setLineDash([4, 4]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
    }
    ctx.restore();

    function drawChevron(p: Point, angle: number) {
      const ctr = transformPoint(p, cs.perspective);
      ctx.save();
      ctx.translate(ctr.x, ctr.y);
      ctx.rotate(angle);
      const t = 20;
      const s = 10;
      ctx.moveTo(t, -t);
      ctx.lineTo(s, 0);
      ctx.lineTo(t, t);
      ctx.restore();
    }

    ctx.beginPath();
    if (hasTopEdge(corners)) {
      drawChevron({ x: width * 0.5, y: 0 }, Math.PI / 2);
    }
    if (hasBottomEdge(corners)) {
      drawChevron({ x: width * 0.5, y: height }, (Math.PI * 3) / 2);
    }
    if (hasLeftEdge(corners)) {
      drawChevron({ x: 0, y: height * 0.5 }, 0);
    }
    if (hasRightEdge(corners)) {
      drawChevron({ x: width, y: height * 0.5 }, Math.PI);
    }
    ctx.stroke();

    // Draw enhanced grid with proper intersections
    if (innerPoints && gridDensity && points && points.length === 4) {
      const gridCorners = pointsToGridPoints(points);
      drawEnhancedGrid(
        ctx,
        gridCorners,
        innerPoints,
        gridDensity,
        cs.displaySettings,
      );
    } else {
      drawGrid(cs, 0);
    }
  }

  drawCalibrationPoints(cs);
}
