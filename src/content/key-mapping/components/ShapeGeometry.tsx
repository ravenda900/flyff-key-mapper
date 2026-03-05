import type { MouseEvent as ReactMouseEvent } from "react";
import type { ShapeType } from "../../types";

export const ShapeGeometry = ({
  shape,
  className,
  onMouseDown,
  onContextMenu,
  onClick,
}: {
  shape: ShapeType;
  className: string;
  onMouseDown?: (event: ReactMouseEvent<SVGElement>) => void;
  onContextMenu?: (event: ReactMouseEvent<SVGElement>) => void;
  onClick?: (event: ReactMouseEvent<SVGElement>) => void;
}) => {
  if (shape === "rectangle") {
    return (
      <rect
        x="2"
        y="2"
        width="96"
        height="96"
        rx="6"
        className={className}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onClick={onClick}
      />
    );
  }
  if (shape === "circle") {
    return (
      <circle
        cx="50"
        cy="50"
        r="48"
        className={className}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onClick={onClick}
      />
    );
  }
  if (shape === "ellipse") {
    return (
      <ellipse
        cx="50"
        cy="50"
        rx="48"
        ry="42"
        className={className}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onClick={onClick}
      />
    );
  }
  if (shape === "triangle") {
    return (
      <polygon
        points="50,2 2,98 98,98"
        className={className}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onClick={onClick}
      />
    );
  }
  if (shape === "diamond") {
    return (
      <polygon
        points="50,2 98,50 50,98 2,50"
        className={className}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onClick={onClick}
      />
    );
  }
  if (shape === "pentagon") {
    return (
      <polygon
        points="50,2 95,36 78,98 22,98 5,36"
        className={className}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onClick={onClick}
      />
    );
  }
  if (shape === "hexagon") {
    return (
      <polygon
        points="25,2 75,2 98,50 75,98 25,98 2,50"
        className={className}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onClick={onClick}
      />
    );
  }
  if (shape === "octagon") {
    return (
      <polygon
        points="30,2 70,2 98,30 98,70 70,98 30,98 2,70 2,30"
        className={className}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onClick={onClick}
      />
    );
  }
  if (shape === "star") {
    return (
      <polygon
        points="50,2 61,35 98,35 68,57 79,91 50,70 21,91 32,57 2,35 39,35"
        className={className}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onClick={onClick}
      />
    );
  }
  if (shape === "pill") {
    return (
      <rect
        x="2"
        y="22"
        width="96"
        height="56"
        rx="28"
        className={className}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onClick={onClick}
      />
    );
  }
  if (shape === "arrow") {
    return (
      <polygon
        points="2,35 58,35 58,15 98,50 58,85 58,65 2,65"
        className={className}
        onMouseDown={onMouseDown}
        onContextMenu={onContextMenu}
        onClick={onClick}
      />
    );
  }

  return (
    <polygon
      points="15,2 85,2 98,98 2,98"
      className={className}
      onMouseDown={onMouseDown}
      onContextMenu={onContextMenu}
      onClick={onClick}
    />
  );
};
