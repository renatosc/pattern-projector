import React from "react";

interface GridControlsProps {
  gridDensity: { rows: number; cols: number };
  onGridDensityChange: (density: { rows: number; cols: number }) => void;
  onReset: () => void;
}

export default function GridControls({
  gridDensity,
  onGridDensityChange,
  onReset,
}: GridControlsProps) {
  return (
    <div className="bg-white dark:bg-gray-800 p-4 rounded shadow-lg">
      <h3 className="text-lg font-medium mb-3">Grid Settings</h3>

      <div className="space-y-3">
        <div>
          <label className="block text-sm font-medium mb-2">
            Grid Density: {gridDensity.rows} × {gridDensity.cols}
          </label>
          <input
            type="range"
            min="5"
            max="15"
            value={gridDensity.rows}
            onChange={(e) => {
              const value = Number(e.target.value);
              onGridDensityChange({ rows: value, cols: value });
            }}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>5×5</span>
            <span>15×15</span>
          </div>
        </div>

        <button
          onClick={onReset}
          className="w-full px-3 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm"
        >
          Reset Grid
        </button>

        <div className="text-xs text-gray-600 space-y-1">
          <p>
            •{" "}
            <span className="inline-block w-3 h-3 bg-red-500 rounded-full"></span>{" "}
            Corner points (drag to adjust shape)
          </p>
          <p>
            •{" "}
            <span className="inline-block w-2 h-2 bg-yellow-400 rounded-full"></span>{" "}
            Grid intersections (drag for fine adjustments)
          </p>
        </div>
      </div>
    </div>
  );
}
