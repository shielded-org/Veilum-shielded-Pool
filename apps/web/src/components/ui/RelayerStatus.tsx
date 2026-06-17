type RelayerStatusProps = {
  online: boolean;
};

export function RelayerStatus({ online }: RelayerStatusProps) {
  return (
    <div className={`relayer-status relayer-status--${online ? "online" : "offline"}`} role="status">
      <span className="relayer-status__dot" aria-hidden />
      <div>
        <strong>{online ? "Relayer online" : "Relayer offline"}</strong>
        <p>Private transfers and withdrawals are submitted via relayer</p>
      </div>
    </div>
  );
}
