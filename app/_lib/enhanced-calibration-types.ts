import { Point } from "./point";

export interface GridPoint extends Point {
  id: string;
  isCorner: boolean;
}

export interface EnhancedCalibrationState {
  corners: GridPoint[]; // 4 corner points
  innerPoints: GridPoint[][]; // Grid intersection points (rows x cols)
  gridDensity: { rows: number; cols: number };
  selectedPointId: string | null;
}

export interface EnhancedPointAction {
  type: "setCorners" | "setInnerPoints" | "setGridDensity" | "selectPoint";
  corners?: GridPoint[];
  innerPoints?: GridPoint[][];
  gridDensity?: { rows: number; cols: number };
  selectedPointId?: string | null;
}
