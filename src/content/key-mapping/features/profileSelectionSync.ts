export type KeyTriggerSelectionSyncResult = {
  normalizedProfileId: string;
  shouldNotify: boolean;
  nextMapping: Record<string, string> | null;
};

type KeyTriggerSelectionSyncInput = {
  currentMapping?: Record<string, string>;
  tabName: string;
  nextProfileId: string | null;
};

export const syncKeyTriggerCharacterProfileSelection = ({
  currentMapping,
  tabName,
  nextProfileId,
}: KeyTriggerSelectionSyncInput): KeyTriggerSelectionSyncResult => {
  const normalizedProfileId = nextProfileId ?? "";
  const previousProfileId = currentMapping?.[tabName] ?? "";

  if (previousProfileId === normalizedProfileId) {
    return {
      normalizedProfileId,
      shouldNotify: false,
      nextMapping: null,
    };
  }

  return {
    normalizedProfileId,
    shouldNotify: true,
    nextMapping: {
      ...currentMapping,
      [tabName]: normalizedProfileId,
    },
  };
};
