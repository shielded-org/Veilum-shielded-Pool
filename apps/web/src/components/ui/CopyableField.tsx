import { useState, type ReactNode } from "react";

import { IconCheck, IconCopy } from "./icons";

type CopyableFieldProps = {
  id?: string;
  label: string;
  value: string;
  placeholder?: string;
  hint?: ReactNode;
  footerLink?: { href: string; label: string };
  masked?: boolean;
  sensitive?: boolean;
  /** Emphasize primary receive address styling. */
  prominent?: boolean;
};

export function CopyableField({
  id,
  label,
  value,
  placeholder = "Connect wallet to generate",
  hint,
  footerLink,
  masked = false,
  sensitive = false,
  prominent = false,
}: CopyableFieldProps) {
  const [copied, setCopied] = useState(false);
  const hidden = masked && sensitive;
  const display = !value ? "" : hidden ? "••••••••••••••••••••••••••••••••" : value;
  const canCopy = !!value && !hidden;

  async function copy() {
    if (!canCopy) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`copyable-field${prominent ? " copyable-field--prominent" : ""}`}>
      <label htmlFor={id} className="form-label">
        {label}
      </label>
      <div className="copyable-field__wrap">
        <input
          id={id}
          className="input input--mono copyable-field__input"
          readOnly
          value={display}
          placeholder={placeholder}
          aria-label={label}
        />
        <button
          type="button"
          className={`copyable-field__btn${copied ? " copyable-field__btn--copied" : ""}`}
          onClick={() => void copy()}
          disabled={!canCopy}
          aria-label={copied ? "Copied" : `Copy ${label}`}
          title={copied ? "Copied" : "Copy"}
        >
          {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
        </button>
      </div>
      {hint ? <p className="field-hint">{hint}</p> : null}
      {footerLink && value ? (
        <p className="field-hint copyable-field__link">
          <a href={footerLink.href} target="_blank" rel="noreferrer noopener">
            {footerLink.label}
          </a>
        </p>
      ) : null}
    </div>
  );
}
