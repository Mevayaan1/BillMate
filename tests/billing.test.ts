import { describe, expect, it } from "vitest";
import { calcTotals } from "../src/lib/billing";

const incl = { gstEnabled: true, pricesIncludeTax: true };
const excl = { gstEnabled: true, pricesIncludeTax: false };

describe("calcTotals", () => {
  it("splits a tax-inclusive price into taxable + CGST/SGST", () => {
    const t = calcTotals([{ qty: 1, unitPrice: 105, discount: 0, gstRate: 5 }], incl);
    expect(t).toMatchObject({ taxable: 100, cgst: 2.5, sgst: 2.5, igst: 0, grand: 105, roundOff: 0 });
  });

  it("adds tax on top when prices are tax-exclusive", () => {
    const t = calcTotals([{ qty: 2, unitPrice: 100, discount: 0, gstRate: 18 }], excl);
    expect(t).toMatchObject({ taxable: 200, cgst: 18, sgst: 18, grand: 236 });
  });

  it("uses IGST for inter-state sales", () => {
    const t = calcTotals([{ qty: 1, unitPrice: 118, discount: 0, gstRate: 18 }], { ...incl, interState: true });
    expect(t).toMatchObject({ taxable: 100, cgst: 0, sgst: 0, igst: 18, grand: 118 });
  });

  it("charges no tax when GST is disabled", () => {
    const t = calcTotals([{ qty: 3, unitPrice: 50, discount: 0, gstRate: 18 }], { gstEnabled: false, pricesIncludeTax: true });
    expect(t).toMatchObject({ taxable: 150, tax: 0, grand: 150 });
  });

  it("applies line discount before tax", () => {
    const t = calcTotals([{ qty: 1, unitPrice: 200, discount: 20, gstRate: 5 }], incl);
    expect(t.discount).toBe(20);
    expect(t.grand).toBe(180);
  });

  it("rounds the grand total to the nearest rupee and reports the round-off", () => {
    const t = calcTotals([{ qty: 1, unitPrice: 99.6, discount: 0, gstRate: 0 }], incl);
    expect(t.grand).toBe(100);
    expect(t.roundOff).toBe(0.4);
  });

  it("adds up several lines with different rates", () => {
    const t = calcTotals(
      [
        { qty: 1, unitPrice: 105, discount: 0, gstRate: 5 },
        { qty: 2, unitPrice: 59, discount: 0, gstRate: 18 },
      ],
      incl,
    );
    expect(t.taxable).toBe(200);
    expect(t.grand).toBe(223);
  });

  it("handles an empty cart", () => {
    expect(calcTotals([], incl)).toMatchObject({ taxable: 0, tax: 0, grand: 0, roundOff: 0 });
  });
});
