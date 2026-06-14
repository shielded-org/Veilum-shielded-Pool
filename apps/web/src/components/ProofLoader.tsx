export function ProofLoader({ message }: { message: string }) {
  return (
    <div className="proof-overlay">
      <div className="proof-modal">
        <h3 style={{ marginTop: 0 }}>
          {message?.toLowerCase().includes("proof") ? "Generating proof" : "Working…"}
        </h3>
        <p className="muted">{message || "This may take a minute in the browser…"}</p>
        <div
          style={{
            height: 6,
            borderRadius: 999,
            background: "#eef0f6",
            overflow: "hidden",
            marginTop: 16,
          }}
        >
          <div
            style={{
              width: "40%",
              height: "100%",
              background: "linear-gradient(90deg, #6c5dd3, #2f80ed)",
              animation: "pulse 1.2s ease-in-out infinite alternate",
            }}
          />
        </div>
      </div>
    </div>
  );
}
