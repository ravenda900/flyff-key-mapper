import { Input, Modal, Space, Typography } from "antd";

type ImportAnalysis = {
  isValidJson: boolean;
  hasImportData: boolean;
  profileCount: number;
  keyTriggerProfileCount: number;
  parseError: string;
};

type Props = {
  overlayVisible: boolean;
  importOpen: boolean;
  isTransformingShape: boolean;
  canImportNow: boolean;
  importAnalysis: ImportAnalysis;
  importText: string;
  setImportText: (value: string) => void;
  applyImport: () => void;
  onClose: () => void;
};

export const ImportMappingsModal = ({
  overlayVisible,
  importOpen,
  isTransformingShape,
  canImportNow,
  importAnalysis,
  importText,
  setImportText,
  applyImport,
  onClose,
}: Props) => (
  <Modal
    title="Import shared mappings"
    rootClassName="fm-ltr-modal fm-import-mappings-modal"
    open={overlayVisible && importOpen && !isTransformingShape}
    zIndex={2147483647}
    onOk={applyImport}
    width={760}
    bodyStyle={{ paddingTop: 8 }}
    onCancel={onClose}
    okText="Import"
    cancelText="Close"
    okButtonProps={{ disabled: !canImportNow }}
    footer={(_, { OkBtn, CancelBtn }) => (
      <Space style={{ width: "100%", justifyContent: "flex-end" }}>
        <OkBtn />
        <CancelBtn />
      </Space>
    )}
  >
    <div
      className="fm-w-full"
      style={{ display: "flex", flexDirection: "column", gap: 8 }}
    >
      <Typography.Text
        type={importAnalysis.hasImportData ? "secondary" : "danger"}
      >
        {importAnalysis.isValidJson
          ? importAnalysis.hasImportData
            ? [
                importAnalysis.profileCount > 0 &&
                  `${importAnalysis.profileCount} key-mapper profile${importAnalysis.profileCount > 1 ? "s" : ""}`,
                importAnalysis.keyTriggerProfileCount > 0 &&
                  `${importAnalysis.keyTriggerProfileCount} key-trigger profile${importAnalysis.keyTriggerProfileCount > 1 ? "s" : ""}`,
              ]
                .filter(Boolean)
                .join(" and ") + " detected in import JSON."
            : "No importable data found in JSON."
          : importAnalysis.parseError}
      </Typography.Text>
      <Input.TextArea
        className="fm-w-full"
        rows={14}
        value={importText}
        onChange={(event) => setImportText(event.target.value)}
        placeholder="Paste JSON copied from Copy Share JSON"
        style={{ minHeight: 260, width: "100%", display: "block" }}
      />
    </div>
  </Modal>
);
