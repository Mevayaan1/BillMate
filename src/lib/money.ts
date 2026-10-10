const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
export const money = (n: number) => inr.format(n || 0);
export const num = (v: string | number | null | undefined) => {
  const n = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(n) ? n : 0;
};
