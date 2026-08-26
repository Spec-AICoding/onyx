// Stub for Community Edition tier gating — MagicBox uses the same logic
export function paidTierGated<T extends React.ComponentType<any>>(Component: T): T {
  return Component;
}
