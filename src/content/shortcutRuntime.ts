const MOUSE_WHEEL_TOKENS = new Set([
  "left click",
  "double left click",
  "right click",
  "double right click",
  "wheel up",
  "wheel down",
]);

export const isMouseWheelShortcutToken = (token: string): boolean => {
  return MOUSE_WHEEL_TOKENS.has(token.trim().toLowerCase());
};

export const shouldHandleGlobalDialogShortcut = (options: {
  isInputTarget: boolean;
  isToggleDialogShortcutFieldFocused: boolean;
}): boolean => {
  return !options.isInputTarget && !options.isToggleDialogShortcutFieldFocused;
};
