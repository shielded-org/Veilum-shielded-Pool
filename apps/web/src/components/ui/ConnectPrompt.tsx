import { useWallet } from "../../hooks/use-wallet";

export function ConnectPrompt() {
  const { address } = useWallet();

  if (address) return null;

  return (
    <div className="connect-prompt" role="status">
      <div>
        <strong>Connect your Stellar wallet</strong>
        <p>Sign in with Freighter, xBull, Albedo, or Lobstr to derive shield keys and use the pool.</p>
      </div>
      <span className="connect-prompt__hint">Use the button in the top right</span>
    </div>
  );
}
