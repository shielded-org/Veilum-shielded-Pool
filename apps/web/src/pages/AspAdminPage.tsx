import { useEffect, useState } from "react";

import { FormAsideList, FormAsidePanel, FormPageLayout } from "../components/ui/FormPageLayout";
import { PageHeader } from "../components/ui/PageHeader";
import { StatusMessage } from "../components/ui/StatusMessage";
import { approveAspMembership, denyAspMembership, fetchAspPending } from "../lib/asp";
import { ASP_ADMIN_TOKEN } from "../lib/types";
import type { Hex32 } from "../lib/types";

type PendingRow = {
  id: string;
  ownerPk: Hex32;
  membershipBlinding: Hex32;
  createdAt: string;
};

export function AspAdminPage() {
  const [adminToken, setAdminToken] = useState(ASP_ADMIN_TOKEN);
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    if (!adminToken) {
      setStatus("Set VITE_ASP_ADMIN_TOKEN or enter admin token");
      return;
    }
    setBusy(true);
    try {
      const rows = await fetchAspPending(adminToken);
      setPending(rows);
      setStatus(rows.length ? `${rows.length} pending` : "No pending registrations");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onApprove(ownerPk: Hex32) {
    setBusy(true);
    try {
      await approveAspMembership(ownerPk, adminToken);
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
      await denyAspMembership(ownerPk, adminToken);
      await refresh();
      setStatus(`Denied ${ownerPk.slice(0, 10)}…`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormPageLayout
      aside={
          <FormAsidePanel title="ASP operator">
            <FormAsideList
              items={[
                { term: "Auto screen", detail: "Most users are approved/denied automatically via on-chain fund-source scan." },
                { term: "Manual override", detail: "Use this page to approve or deny pending requests when auto-screen is off or for appeals." },
                { term: "Deny list", detail: "Edit services/asp/data/bad-stellar-accounts.json to flag bad Stellar funders." },
              ]}
            />
          </FormAsidePanel>
      }
    >
      <PageHeader title="ASP Admin" description="Approve or deny Association Set membership requests." />
      <div className="card form-card">
        <label className="field-label" htmlFor="asp-admin-token">
          Admin token
        </label>
        <input
          id="asp-admin-token"
          className="input"
          type="password"
          value={adminToken}
          onChange={(e) => setAdminToken(e.target.value)}
          placeholder="Bearer token for ASP service"
        />
        <div className="form-actions" style={{ marginTop: "1rem" }}>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void refresh()}>
            Refresh
          </button>
        </div>
        {status ? <StatusMessage variant="info" message={status} /> : null}
        <ul className="note-list" style={{ marginTop: "1.5rem" }}>
          {pending.map((row) => (
            <li key={row.id} className="note-list-item">
              <code style={{ fontSize: "0.75rem", wordBreak: "break-all" }}>{row.ownerPk}</code>
              <div className="form-actions" style={{ marginTop: "0.5rem" }}>
                <button type="button" className="btn primary" disabled={busy} onClick={() => void onApprove(row.ownerPk)}>
                  Approve
                </button>
                <button type="button" className="btn secondary" disabled={busy} onClick={() => void onDeny(row.ownerPk)}>
                  Deny
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </FormPageLayout>
  );
}
