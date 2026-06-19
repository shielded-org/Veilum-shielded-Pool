type ServiceStatusPillProps = {
  online: boolean;
};

export function ServiceStatusPill({ online }: ServiceStatusPillProps) {
  if (online) return null;

  return (
    <span
      className="service-pill service-pill--offline"
      role="status"
      title="Private transfers and withdrawals are temporarily unavailable"
    >
      Service offline
    </span>
  );
}
