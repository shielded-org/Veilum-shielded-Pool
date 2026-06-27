import { atom } from "jotai";

/** User left the dashboard for the marketing site — do not auto-redirect back. */
export const marketingBrowseAtom = atom(false);

/** Set after a successful key sign-in from the landing flow — triggers one-time redirect to dashboard. */
export const pendingDashboardRedirectAtom = atom(false);
