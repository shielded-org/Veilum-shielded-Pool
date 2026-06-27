import { useEffect, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { useAtomValue } from "jotai";

import { KeyDerivationDialog } from "../ui/KeyDerivationDialog";
import { useLandingAuth } from "../../hooks/use-landing-auth";
import { pendingDashboardRedirectAtom } from "../../store/session-atoms";

/** Landing shell: key-sign dialog + one-time post-sign redirect to dashboard. */
export function LandingAuthGate({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const pendingRedirect = useAtomValue(pendingDashboardRedirectAtom);
  const {
    wallet,
    busy,
    error,
    hasShieldKeys,
    keySignOpen,
    signKeys,
    dismissKeySign,
    clearPendingRedirect,
  } = useLandingAuth();

  useEffect(() => {
    if (!pendingRedirect || !wallet || !hasShieldKeys) return;
    clearPendingRedirect();
    navigate("/dashboard", { replace: true });
  }, [pendingRedirect, wallet, hasShieldKeys, clearPendingRedirect, navigate]);

  return (
    <>
      {children}
      <KeyDerivationDialog
        open={keySignOpen}
        busy={busy}
        error={error}
        onProceed={() => void signKeys({ fromLanding: true })}
        onCancel={dismissKeySign}
      />
    </>
  );
}
