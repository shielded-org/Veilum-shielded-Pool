import type { DecryptedNote } from "../../lib/types";
import { useTokenRegistry } from "../../hooks/use-token-registry";
import { formatTokenAmount } from "../../lib/utils";

type NoteSelectorProps = {
  notes: DecryptedNote[];
  value: string;
  onChange: (id: string) => void;
  emptyMessage?: string;
};

export function NoteSelector({ notes, value, onChange, emptyMessage }: NoteSelectorProps) {
  const registry = useTokenRegistry();

  if (notes.length === 0) {
    return <p className="empty-inline">{emptyMessage ?? "No unspent notes available."}</p>;
  }

  const selected = value || notes[0]?.id || "";

  return (
    <select className="input" value={selected} onChange={(e) => onChange(e.target.value)}>
      {notes.map((n) => {
        const symbol = registry?.symbolForField(n.token) ?? "—";
        return (
          <option key={n.id} value={n.id}>
            {formatTokenAmount(n.amount)} {symbol}
          </option>
        );
      })}
    </select>
  );
}
