import type { ShapeType } from "../../types";

export const PaletteShapeIcon = ({ shape }: { shape: ShapeType }) => (
  <div className="fm-shape-palette-svg-wrap" aria-hidden="true">
    <svg
      viewBox="0 0 100 100"
      className="fm-shape-palette-svg"
      focusable="false"
    >
      {shape === "rectangle" && (
        <rect
          x="10"
          y="18"
          width="80"
          height="64"
          rx="8"
          className="fm-shape-palette-path"
        />
      )}
      {shape === "circle" && (
        <circle cx="50" cy="50" r="34" className="fm-shape-palette-path" />
      )}
      {shape === "ellipse" && (
        <ellipse
          cx="50"
          cy="50"
          rx="38"
          ry="30"
          className="fm-shape-palette-path"
        />
      )}
      {shape === "triangle" && (
        <polygon points="50,10 12,86 88,86" className="fm-shape-palette-path" />
      )}
      {shape === "diamond" && (
        <polygon
          points="50,8 90,50 50,92 10,50"
          className="fm-shape-palette-path"
        />
      )}
      {shape === "pentagon" && (
        <polygon
          points="50,8 90,38 74,90 26,90 10,38"
          className="fm-shape-palette-path"
        />
      )}
      {shape === "hexagon" && (
        <polygon
          points="25,10 75,10 92,50 75,90 25,90 8,50"
          className="fm-shape-palette-path"
        />
      )}
      {shape === "octagon" && (
        <polygon
          points="28,8 72,8 92,28 92,72 72,92 28,92 8,72 8,28"
          className="fm-shape-palette-path"
        />
      )}
      {shape === "star" && (
        <polygon
          points="50,8 59,34 88,34 65,52 74,84 50,66 26,84 35,52 12,34 41,34"
          className="fm-shape-palette-path"
        />
      )}
      {shape === "pill" && (
        <rect
          x="8"
          y="30"
          width="84"
          height="40"
          rx="20"
          className="fm-shape-palette-path"
        />
      )}
      {shape === "arrow" && (
        <path
          d="M12 35h44V18l32 32-32 32V65H12z"
          className="fm-shape-palette-path"
        />
      )}
      {shape === "trapezoid" && (
        <polygon
          points="20,12 80,12 92,88 8,88"
          className="fm-shape-palette-path"
        />
      )}
    </svg>
  </div>
);
