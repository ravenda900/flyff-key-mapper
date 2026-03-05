import { Button, Input, Modal, Space, Typography } from "antd";

type Props = {
  overlayVisible: boolean;
  profileNameDialogOpen: boolean;
  profileNameDialogMode: "create" | "rename" | "import";
  profileNameInput: string;
  profileNameError: string;
  setProfileNameInput: (value: string) => void;
  clearProfileNameError: () => void;
  onClose: () => void;
  onSave: () => void;
};

export const ProfileNameModal = ({
  overlayVisible,
  profileNameDialogOpen,
  profileNameDialogMode,
  profileNameInput,
  profileNameError,
  setProfileNameInput,
  clearProfileNameError,
  onClose,
  onSave,
}: Props) => (
  <Modal
    title={
      profileNameDialogMode === "create"
        ? "Create Profile"
        : profileNameDialogMode === "rename"
          ? "Rename Profile"
          : "Import Profile Name"
    }
    rootClassName="fm-ltr-modal"
    open={overlayVisible && profileNameDialogOpen}
    onCancel={onClose}
    footer={
      <Space style={{ width: "100%", justifyContent: "flex-end" }}>
        <Button onClick={onClose}>Cancel</Button>
        <Button type="primary" onClick={onSave}>
          {profileNameDialogMode === "create" ? "Create" : "Save"}
        </Button>
      </Space>
    }
  >
    <Space
      direction="vertical"
      size={8}
      className="fm-w-full"
      style={{ width: "100%", display: "flex" }}
    >
      <Input
        className="fm-w-full"
        style={{ width: "100%" }}
        value={profileNameInput}
        onChange={(event) => {
          setProfileNameInput(event.target.value);
          if (profileNameError) {
            clearProfileNameError();
          }
        }}
        placeholder="Enter profile name"
        autoFocus
      />
      {profileNameError && (
        <Typography.Text type="danger">{profileNameError}</Typography.Text>
      )}
    </Space>
  </Modal>
);
