/** Stellar address allowed to see and use the ASP operator UI. */
export const ASP_OPERATOR_ADDRESS =
  "GDAZYVT4WZGB3U22UGEIMPTJPFOZFKDWIC4XJNOEN3NZ54CNGXOTGD3T";

export function isAspOperator(wallet: string | null | undefined): boolean {
  if (!wallet) return false;
  return wallet.toUpperCase() === ASP_OPERATOR_ADDRESS;
}
