type NotesSummaryProps = {
  total: number;
  unspent: number;
  spent: number;
  loading?: boolean;
};

export function NotesSummary({ total, unspent, spent, loading }: NotesSummaryProps) {
  return (
    <div className="notes-summary" aria-label="Notes summary">
      <div className="notes-summary__item">
        <span className="notes-summary__label">Total notes</span>
        <strong>{loading ? "…" : total}</strong>
      </div>
      <div className="notes-summary__item notes-summary__item--ok">
        <span className="notes-summary__label">Unspent</span>
        <strong>{loading ? "…" : unspent}</strong>
      </div>
      <div className="notes-summary__item notes-summary__item--muted">
        <span className="notes-summary__label">Spent</span>
        <strong>{loading ? "…" : spent}</strong>
      </div>
    </div>
  );
}
