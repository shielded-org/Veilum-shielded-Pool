import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import { FormAsideList, FormAsidePanel, FormPageLayout } from "../components/ui/FormPageLayout";
import { StatusMessage } from "../components/ui/StatusMessage";
import { useWallet } from "../hooks/use-wallet";
import { approveAspMembership, denyAspMembership, fetchAspPending } from "../lib/asp";
import { isAspOperator } from "../lib/asp-admin";
import { ASP_ADMIN_TOKEN } from "../lib/types";
import type { Hex32 } from "../lib/types";

type PendingRow = {
  id: string;
  ownerPk: Hex32;
  membershipBlinding: Hex32;
  createdAt: string;
};

const TOKEN_STORAGE_KEY = "veilum.aspAdminToken";

function loadStoredToken(): string {
  if (typeof sessionStorage === "undefined") return ASP_ADMIN_TOKEN;
  return sessionStorage.getItem(TOKEN_STORAGE_KEY) ?? ASP_ADMIN_TOKEN;
}

export function AspAdminPage() {
  const { address: wallet } = useWallet();
  const [adminToken, setAdminToken] = useState(loadStoredToken);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem(TOKEN_STORAGE_KEY, adminToken);
    }
  }, [adminToken]);

  async function refresh() {
    if (!adminToken.trim()) {
      setStatus("Enter the ASP admin token to load pending requests.");
      setPending([]);
      return;
    }
    setBusy(true);
    try {
      const rows = await fetchAspPending(adminToken.trim());
      setPending(rows);
      setStatus(rows.length ? `${rows.length} pending request${rows.length === 1 ? "" : "s"}` : "No pending registrations");
    } catch (e) {
      setPending([]);
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (adminToken.trim()) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only when token is prefilled
  }, []);

  async function onApprove(ownerPk: Hex32) {
    setBusy(true);
    try {
      await approveAspMembership(ownerPk, adminToken.trim());
      await refresh();
      setStatus(`Approved ${ownerPk.slice(0, 10)}…`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function onDeny(ownerPk: Hex32) {
    setBusy(true);
    try {
      await denyAspMembership(ownerPk, adminToken.trim());
      await refresh();
      setStatus(`Denied ${ownerPk.slice(0, 10)}…`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const statusVariant =
    status.toLowerCase().includes("error") ||
    status.toLowerCase().includes("unauthorized") ||
    status.toLowerCase().includes("fail")
      ? "error"
      : status.toLowerCase().includes("approved") || status.toLowerCase().includes("denied")
        ? "success"
        : "info";

  if (!isAspOperator(wallet)) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <FormPageLayout
      aside={
        <div className="form-layout__aside">
          <FormAsidePanel title="ASP operator">
            <FormAsideList
              items={[
                {
                  term: "Auto screen",
                  detail: "Most users are approved or denied automatically via on-chain fund-source scan.",
                },
                {
                  term: "Manual override",
                  detail: "Use this page when auto-screen is off or for appeals.",
                },
                {
                  term: "Deny list",
                  detail: "Edit services/asp/data/bad-stellar-accounts.json to flag bad Stellar funders.",
                },
              ]}
            />
          </FormAsidePanel>
          <FormAsidePanel title="Admin token">
            <p className="asp-admin-aside__text">
              The bearer token is set on the ASP service as <code>ASP_ADMIN_TOKEN</code>. Use the same
              value here.
            </p>
            <p className="asp-admin-aside__text">
              Local default: <code className="mono">dev-asp-admin-token</code> (see{" "}
              <code>services/asp/.env.example</code>).
            </p>
            <p className="asp-admin-aside__text">
              Optional: set <code>VITE_ASP_ADMIN_TOKEN</code> in <code>apps/web/.env</code> to
              pre-fill this page, then restart the dev server.
            </p>
          </FormAsidePanel>
        </div>
      }
    >
      <div className="card form-card asp-admin-form">
        <p className="form-notice form-notice--testnet">
          <span className="form-notice__label">Operator access</span>
          Manual approve/deny for Association Set membership. Requires the ASP service admin bearer
          token — not your wallet keys.
        </p>

        <section className="asp-admin-section">
          <h3 className="asp-admin-section__heading">Authentication</h3>
          <div className="field">
            <label htmlFor="asp-admin-token" className="form-label">
              Admin bearer token
            </label>
            <input
              id="asp-admin-token"
              className="input input--mono"
              type="password"
              value={adminToken}
              onChange={(e) => setAdminToken(e.target.value)}
              placeholder="dev-asp-admin-token"
              autoComplete="off"
            />
            <p className="field-hint">
              Sent as <code>Authorization: Bearer …</code> to the ASP service admin API.
            </p>
          </div>
          <div className="form-actions asp-admin-form__actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !adminToken.trim()}
              onClick={() => void refresh()}
            >
              {busy ? "Loading…" : "Load pending"}
            </button>
          </div>
        </section>

        <section className="asp-admin-section">
          <h3 className="asp-admin-section__heading">Pending queue</h3>
          {pending.length === 0 ? (
            <p className="asp-admin-empty">
              {busy ? "Loading pending requests…" : "No pending memberships in the queue."}
            </p>
          ) : (
            <ul className="asp-admin-queue">
              {pending.map((row) => (
                <li key={row.id} className="asp-admin-queue__item">
                  <div className="asp-admin-queue__meta">
                    <code className="asp-admin-queue__pk mono">{row.ownerPk}</code>
                    {row.createdAt ? (
                      <span className="asp-admin-queue__time">
                        {new Date(row.createdAt).toLocaleString()}
                      </span>
                    ) : null}
                  </div>
                  <div className="asp-admin-queue__actions">
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={busy}
                      onClick={() => void onApprove(row.ownerPk)}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={busy}
                      onClick={() => void onDeny(row.ownerPk)}
                    >
                      Deny
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {status ? <StatusMessage variant={statusVariant}>{status}</StatusMessage> : null}
      </div>
    </FormPageLayout>
  );
}
