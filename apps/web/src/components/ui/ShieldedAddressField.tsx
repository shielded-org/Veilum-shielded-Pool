import { CopyableField } from "./CopyableField";

type ShieldedAddressFieldProps = {
  value: string;
  placeholder?: string;
};

export function ShieldedAddressField({ value, placeholder }: ShieldedAddressFieldProps) {
  return (
    <CopyableField
      id="shielded-address"
      label="Shielded receive address"
      value={value}
      placeholder={placeholder}
    />
  );
}
