import clsx from "clsx";
import type { ShapeType } from "./types";

export const SHAPE_OPTIONS: { label: string; value: ShapeType }[] = [
  { label: "Rectangle", value: "rectangle" },
  { label: "Circle", value: "circle" },
  { label: "Ellipse", value: "ellipse" },
  { label: "Triangle", value: "triangle" },
  { label: "Diamond", value: "diamond" },
  { label: "Pentagon", value: "pentagon" },
  { label: "Hexagon", value: "hexagon" },
  { label: "Octagon", value: "octagon" },
  { label: "Star", value: "star" },
  { label: "Pill", value: "pill" },
  { label: "Arrow", value: "arrow" },
  { label: "Trapezoid", value: "trapezoid" },
];

export const getShapeClass = (type: ShapeType): string =>
  clsx("fm-shape-fill", {
    "fm-shape-rectangle": type === "rectangle",
    "fm-shape-circle": type === "circle",
    "fm-shape-ellipse": type === "ellipse",
    "fm-shape-triangle": type === "triangle",
    "fm-shape-diamond": type === "diamond",
    "fm-shape-pentagon": type === "pentagon",
    "fm-shape-hexagon": type === "hexagon",
    "fm-shape-octagon": type === "octagon",
    "fm-shape-star": type === "star",
    "fm-shape-pill": type === "pill",
    "fm-shape-arrow": type === "arrow",
    "fm-shape-trapezoid": type === "trapezoid",
  });
