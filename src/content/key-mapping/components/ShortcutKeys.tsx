import { Fragment } from "react";

type MouseTokenSpec = {
  region: "left" | "right" | "wheel";
  double?: boolean;
  wheelDir?: "up" | "down";
};

const parseMouseToken = (token: string): MouseTokenSpec | null => {
  const normalized = token.trim().toLowerCase().replace(/\s+/g, " ");

  if (normalized === "left click") {
    return { region: "left" };
  }

  if (normalized === "right click") {
    return { region: "right" };
  }

  if (normalized === "double left click") {
    return { region: "left", double: true };
  }

  if (normalized === "double right click") {
    return { region: "right", double: true };
  }

  if (normalized === "wheel up") {
    return { region: "wheel", wheelDir: "up" };
  }

  if (normalized === "wheel down") {
    return { region: "wheel", wheelDir: "down" };
  }

  return null;
};

const MouseShortcutToken = ({
  token,
  spec,
}: {
  token: string;
  spec: MouseTokenSpec;
}) => (
  <span className="fm-mouse-shortcut" aria-label={token} title={token}>
    <span className="fm-mouse-shortcut-icon-stack" aria-hidden="true">
      {Array.from({ length: spec.double ? 2 : 1 }).map((_, index) => (
        <span className="fm-mouse-shortcut-icon" key={`${token}-${index}`}>
          <svg
            viewBox="0 0 284 511.24"
            className="fm-mouse-shortcut-svg"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              className="fm-mouse-body"
              fillRule="evenodd"
              clipRule="evenodd"
              d="M125.1 494.24h33.8c29.72 0 56.74-12.17 76.34-31.76 19.59-19.59 31.76-46.62 31.76-76.34V270.52l-.73.03H17v115.59c0 29.72 12.17 56.75 31.76 76.34 19.59 19.59 46.62 31.76 76.34 31.76zM150.5 125.63c4.76 1.43 9.02 4.04 12.45 7.46 5.37 5.37 8.72 12.8 8.72 20.94v37.14c0 8.13-3.36 15.56-8.73 20.93a29.867 29.867 0 0 1-12.44 7.47v33.98h115.77l.73.03v-54.23c0-29.72-12.17-56.75-31.76-76.34-19.6-19.59-46.62-31.76-76.34-31.76h-8.4zM133.5 219.56c-4.73-1.43-8.98-4.03-12.41-7.45-5.4-5.37-8.75-12.78-8.75-20.94v-37.14c0-8.16 3.34-15.58 8.71-20.95a29.86 29.86 0 0 1 12.45-7.46V91.25h-8.4c-29.72 0-56.75 12.17-76.34 31.76C29.17 142.6 17 169.63 17 199.35v54.2h116.5zM158.9 511.24h-33.8c-34.41 0-65.69-14.07-88.36-36.74C14.07 451.84 0 420.55 0 386.14V199.35c0-34.41 14.07-65.69 36.74-88.36s53.95-36.74 88.36-36.74h33.8c34.42 0 65.7 14.08 88.36 36.74 22.67 22.67 36.74 53.95 36.74 88.36v186.79c0 34.41-14.07 65.7-36.74 88.36-22.66 22.66-53.94 36.74-88.36 36.74z"
            />
            <rect
              x="38"
              y="118"
              width="96"
              height="108"
              rx="34"
              className={`fm-mouse-region ${spec.region === "left" ? "is-active" : ""}`}
            />
            <rect
              x="150"
              y="118"
              width="96"
              height="108"
              rx="34"
              className={`fm-mouse-region ${spec.region === "right" ? "is-active" : ""}`}
            />
            <path
              className={`fm-mouse-wheel ${spec.region === "wheel" ? "is-active" : ""}`}
              fillRule="evenodd"
              clipRule="evenodd"
              d="M142 133.52h.01c11.28 0 20.51 9.29 20.51 20.52v37.13c0 11.23-9.28 20.52-20.51 20.52H142c-11.23 0-20.52-9.24-20.52-20.52v-37.13c0-11.29 9.24-20.52 20.52-20.52z"
            />
          </svg>
        </span>
      ))}
    </span>
    {spec.wheelDir && (
      <span className="fm-mouse-side-arrow" aria-hidden="true">
        {spec.wheelDir === "up" ? "↑" : "↓"}
      </span>
    )}
  </span>
);

export const ShortcutKeys = ({ combo }: { combo: string }) => {
  const parts = combo
    .split("+")
    .map((part) => part.trim())
    .filter(Boolean);

  return (
    <span className="fm-shortcut-kbd-group" aria-label={`Shortcut ${combo}`}>
      {parts.map((part, index) => (
        <Fragment key={`${part}-${index}`}>
          {(() => {
            const mouseSpec = parseMouseToken(part);
            if (mouseSpec) {
              return <MouseShortcutToken token={part} spec={mouseSpec} />;
            }

            return <kbd className="fm-kbd">{part}</kbd>;
          })()}
          {index < parts.length - 1 && (
            <span className="fm-shortcut-plus">+</span>
          )}
        </Fragment>
      ))}
    </span>
  );
};
