import { Button } from "./Button";

export function CopyField({
  id,
  label,
  value,
  masked = false,
  hint,
  compact = false,
}: {
  id: string;
  label: string;
  value: string;
  masked?: boolean;
  hint?: string;
  /** Show a shortened value in the input; copy still uses the full string. */
  compact?: boolean;
}) {
  const display = masked
    ? "••••••••••••••••"
    : compact && value.length > 20
      ? `${value.slice(0, 10)}…${value.slice(-8)}`
      : value;

  return (
    <div className="field field--copy">
      <label htmlFor={id}>{label}</label>
      <div className="copy-row">
        <input id={id} readOnly value={display} title={masked ? undefined : value} />
        <Button
          variant="secondary"
          size="sm"
          disabled={!value || masked}
          onClick={() => void navigator.clipboard.writeText(value)}
        >
          Copy
        </Button>
      </div>
      {hint ? <p className="text-subtle mt-2">{hint}</p> : null}
    </div>
  );
}
