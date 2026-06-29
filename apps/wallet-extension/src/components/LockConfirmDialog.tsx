import { Button } from "./ui/Button";
import { IconLock } from "./ui/icons";

type LockConfirmDialogProps = {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function LockConfirmDialog({ open, onCancel, onConfirm }: LockConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="wallet-dialog" role="alertdialog" aria-modal="true" aria-labelledby="lock-dialog-title">
      <button type="button" className="wallet-dialog__backdrop" onClick={onCancel} aria-label="Cancel" />
      <div className="wallet-dialog__card">
        <div className="wallet-dialog__icon" aria-hidden>
          <IconLock size={22} />
        </div>
        <h2 id="lock-dialog-title" className="wallet-dialog__title">
          Lock wallet?
        </h2>
        <p className="wallet-dialog__lead">
          Locking clears your unlocked session from memory. You will need your password to use Veilum again.
        </p>
        <ul className="wallet-dialog__list">
          <li>Shielded keys and balances stay encrypted on this device.</li>
          <li>Any transaction in progress may not complete — check Activity after unlocking.</li>
          <li>Make sure you have saved your recovery phrase before locking if you have not already.</li>
        </ul>
        <div className="wallet-dialog__actions">
          <Button variant="secondary" fullWidth onClick={onCancel}>
            Stay unlocked
          </Button>
          <Button variant="danger" fullWidth onClick={onConfirm}>
            Lock wallet
          </Button>
        </div>
      </div>
    </div>
  );
}
