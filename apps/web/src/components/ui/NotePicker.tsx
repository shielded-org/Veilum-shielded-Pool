import type { DecryptedNote } from "../../lib/types";
import { groupUnspentNotesByToken, tokenKey } from "../../lib/note-groups";
import { useTokenRegistry } from "../../hooks/use-token-registry";
import { formatStableUsd } from "../../lib/utils";

type NotePickerProps = {
  notes: DecryptedNote[];
  value: string;
  onChange: (tokenKey: string) => void;
  emptyMessage?: string;
};

export function NotePicker({ notes, value, onChange, emptyMessage }: NotePickerProps) {
  const registry = useTokenRegistry();
  const groups = groupUnspentNotesByToken(notes);

  if (groups.length === 0) {
    return <p className="empty-inline">{emptyMessage ?? "No available notes."}</p>;
  }

  const selected = value || tokenKey(groups[0].token);

  return (
    <div className="note-picker" role="listbox" aria-label="Select token balance">
      {groups.map((group) => {
        const symbol = registry?.symbolForField(group.token) ?? "—";
        const key = tokenKey(group.token);
        const active = key === selected;
        const meta =
          group.noteCount > 1
            ? `Private balance · ${group.noteCount} notes`
            : "Private balance";

        return (
          <button
            key={key}
            type="button"
            role="option"
            aria-selected={active}
            className={`note-picker__option${active ? " note-picker__option--active" : ""}`}
            onClick={() => onChange(key)}
          >
            <span className="note-picker__main">
              <span className="note-picker__symbol">{symbol}</span>
              <span className="note-picker__meta">{meta}</span>
            </span>
            <span className="note-picker__amount mono">{formatStableUsd(group.totalAmount)}</span>
          </button>
        );
      })}
    </div>
  );
}
