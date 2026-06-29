import { Button } from "./ui/Button";

export function ResetVaultDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div className="vault-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="reset-vault-title">
      <div className="vault-dialog">
        <h2 id="reset-vault-title" className="vault-dialog__title">
          Reset wallet?
        </h2>
        <p className="vault-dialog__lead">
          This removes the encrypted wallet from this device. You will need your recovery phrase or
          secret key to restore access.
        </p>
        <div className="vault-dialog__actions">
          <Button variant="secondary" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={onConfirm}>
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
