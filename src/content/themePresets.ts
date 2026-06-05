import type { ThemeConfig } from "antd";

export const THEME_MODES = [
  "system",
  "light",
  "dark",
  "monokai",
  "dracula",
  "nord",
  "gruvbox-dark",
  "catppuccin-mocha",
  "tokyo-night",
  "solarized-dark",
  "one-dark",
  "everforest-dark",
  "rose-pine",
  "github-light",
  "solarized-light",
  "nord-light",
  "catppuccin-latte",
] as const;

export type ThemeMode = (typeof THEME_MODES)[number];
export type ThemeAppearance = "light" | "dark";

type ThemeTokenOverrides = NonNullable<ThemeConfig["token"]>;

export type ThemePreset = {
  label: string;
  appearance: ThemeAppearance;
  accent: string;
  token: ThemeTokenOverrides;
};

const buildToken = (
  colorPrimary: string,
  colorBgBase: string,
  colorTextBase: string,
  extras?: Partial<ThemeTokenOverrides>,
): ThemeTokenOverrides => ({
  colorPrimary,
  colorInfo: extras?.colorInfo ?? colorPrimary,
  colorSuccess: extras?.colorSuccess ?? colorPrimary,
  colorWarning: extras?.colorWarning ?? "#faad14",
  colorError: extras?.colorError ?? "#ff4d4f",
  colorBgBase,
  colorTextBase,
  borderRadius: extras?.borderRadius ?? 10,
  fontSize: extras?.fontSize ?? 13,
  ...(extras ?? {}),
});

export const THEME_PRESETS: Record<
  Exclude<ThemeMode, "system">,
  ThemePreset
> = {
  light: {
    label: "Light",
    appearance: "light",
    accent: "#1677ff",
    token: buildToken("#1677ff", "#ffffff", "#141414"),
  },
  dark: {
    label: "Dark",
    appearance: "dark",
    accent: "#1677ff",
    token: buildToken("#1677ff", "#141414", "#f5f5f5"),
  },
  monokai: {
    label: "Monokai",
    appearance: "dark",
    accent: "#a6e22e",
    token: buildToken("#a6e22e", "#272822", "#f8f8f2", {
      colorInfo: "#66d9ef",
      colorSuccess: "#a6e22e",
      colorWarning: "#fd971f",
      colorError: "#f92672",
    }),
  },
  dracula: {
    label: "Dracula",
    appearance: "dark",
    accent: "#bd93f9",
    token: buildToken("#bd93f9", "#282a36", "#f8f8f2", {
      colorInfo: "#8be9fd",
      colorSuccess: "#50fa7b",
      colorWarning: "#ffb86c",
      colorError: "#ff5555",
    }),
  },
  nord: {
    label: "Nord",
    appearance: "dark",
    accent: "#88c0d0",
    token: buildToken("#88c0d0", "#2e3440", "#eceff4", {
      colorInfo: "#81a1c1",
      colorSuccess: "#a3be8c",
      colorWarning: "#ebcb8b",
      colorError: "#bf616a",
    }),
  },
  "gruvbox-dark": {
    label: "Gruvbox Dark",
    appearance: "dark",
    accent: "#d79921",
    token: buildToken("#d79921", "#282828", "#ebdbb2", {
      colorInfo: "#458588",
      colorSuccess: "#98971a",
      colorWarning: "#d79921",
      colorError: "#cc241d",
    }),
  },
  "catppuccin-mocha": {
    label: "Catppuccin Mocha",
    appearance: "dark",
    accent: "#cba6f7",
    token: buildToken("#cba6f7", "#1e1e2e", "#cdd6f4", {
      colorInfo: "#89dceb",
      colorSuccess: "#a6e3a1",
      colorWarning: "#f9e2af",
      colorError: "#f38ba8",
    }),
  },
  "tokyo-night": {
    label: "Tokyo Night",
    appearance: "dark",
    accent: "#7aa2f7",
    token: buildToken("#7aa2f7", "#1a1b26", "#c0caf5", {
      colorInfo: "#7dcfff",
      colorSuccess: "#9ece6a",
      colorWarning: "#e0af68",
      colorError: "#f7768e",
    }),
  },
  "solarized-dark": {
    label: "Solarized Dark",
    appearance: "dark",
    accent: "#2aa198",
    token: buildToken("#2aa198", "#002b36", "#93a1a1", {
      colorInfo: "#268bd2",
      colorSuccess: "#859900",
      colorWarning: "#b58900",
      colorError: "#dc322f",
    }),
  },
  "one-dark": {
    label: "One Dark",
    appearance: "dark",
    accent: "#61afef",
    token: buildToken("#61afef", "#282c34", "#abb2bf", {
      colorInfo: "#56b6c2",
      colorSuccess: "#98c379",
      colorWarning: "#e5c07b",
      colorError: "#e06c75",
    }),
  },
  "everforest-dark": {
    label: "Everforest Dark",
    appearance: "dark",
    accent: "#a7c080",
    token: buildToken("#a7c080", "#2d353b", "#d3c6aa", {
      colorInfo: "#7fbbb3",
      colorSuccess: "#a7c080",
      colorWarning: "#dbbc7f",
      colorError: "#e67e80",
    }),
  },
  "rose-pine": {
    label: "Ros\u00e9 Pine",
    appearance: "dark",
    accent: "#c4a7e7",
    token: buildToken("#c4a7e7", "#191724", "#e0def4", {
      colorInfo: "#9ccfd8",
      colorSuccess: "#31748f",
      colorWarning: "#f6c177",
      colorError: "#eb6f92",
    }),
  },
  "github-light": {
    label: "GitHub Light",
    appearance: "light",
    accent: "#0969da",
    token: buildToken("#0969da", "#ffffff", "#1f2328", {
      colorInfo: "#0969da",
      colorSuccess: "#1a7f37",
      colorWarning: "#9a6700",
      colorError: "#cf222e",
    }),
  },
  "solarized-light": {
    label: "Solarized Light",
    appearance: "light",
    accent: "#268bd2",
    token: buildToken("#268bd2", "#fdf6e3", "#657b83", {
      colorInfo: "#2aa198",
      colorSuccess: "#859900",
      colorWarning: "#b58900",
      colorError: "#dc322f",
    }),
  },
  "nord-light": {
    label: "Nord Light",
    appearance: "light",
    accent: "#5e81ac",
    token: buildToken("#5e81ac", "#eceff4", "#2e3440", {
      colorInfo: "#81a1c1",
      colorSuccess: "#a3be8c",
      colorWarning: "#d08770",
      colorError: "#bf616a",
    }),
  },
  "catppuccin-latte": {
    label: "Catppuccin Latte",
    appearance: "light",
    accent: "#8839ef",
    token: buildToken("#8839ef", "#eff1f5", "#4c4f69", {
      colorInfo: "#1e66f5",
      colorSuccess: "#40a02b",
      colorWarning: "#df8e1d",
      colorError: "#d20f39",
    }),
  },
};

export const THEME_SELECT_OPTIONS = [
  {
    label: "Core",
    options: [
      { value: "system", label: "System" },
      { value: "light", label: "Light" },
      { value: "dark", label: "Dark" },
    ],
  },
  {
    label: "Dark Presets",
    options: [
      { value: "monokai", label: "Monokai" },
      { value: "dracula", label: "Dracula" },
      { value: "nord", label: "Nord" },
      { value: "gruvbox-dark", label: "Gruvbox Dark" },
      { value: "catppuccin-mocha", label: "Catppuccin Mocha" },
      { value: "tokyo-night", label: "Tokyo Night" },
      { value: "solarized-dark", label: "Solarized Dark" },
      { value: "one-dark", label: "One Dark" },
      { value: "everforest-dark", label: "Everforest Dark" },
      { value: "rose-pine", label: "Ros\u00e9 Pine" },
    ],
  },
  {
    label: "Light Presets",
    options: [
      { value: "github-light", label: "GitHub Light" },
      { value: "solarized-light", label: "Solarized Light" },
      { value: "nord-light", label: "Nord Light" },
      { value: "catppuccin-latte", label: "Catppuccin Latte" },
    ],
  },
] as const;

export const isThemeMode = (value: unknown): value is ThemeMode =>
  typeof value === "string" &&
  (THEME_MODES as readonly string[]).includes(value);

export const resolveThemeMode = (
  mode: ThemeMode,
  prefersDark: boolean,
): Exclude<ThemeMode, "system"> =>
  mode === "system" ? (prefersDark ? "dark" : "light") : mode;

export const getResolvedThemePreset = (
  mode: ThemeMode,
  prefersDark: boolean,
) => {
  const resolvedMode = resolveThemeMode(mode, prefersDark);
  return {
    mode: resolvedMode,
    ...THEME_PRESETS[resolvedMode],
  };
};
