export interface CalcLine {
  qty: number;
  unitPrice: number;
  discount: number;
  gstRate: number;
}

export interface CalcOptions {
  gstEnabled: boolean;
  pricesIncludeTax: boolean;
  /** true when the customer is in a different state (IGST instead of CGST+SGST) */
  interState?: boolean;
}

export interface Totals {
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax: number;
  discount: number;
  roundOff: number;
  grand: number;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Mirrors the create_invoice Postgres function (line by line, rounded to 2dp).
 * The server remains the source of truth; this powers the live preview on the billing screen.
 */
export function calcTotals(lines: CalcLine[], opt: CalcOptions): Totals {
  let taxable = 0, cgst = 0, sgst = 0, igst = 0, discount = 0;
  for (const l of lines) {
    const gross = r2(l.qty * l.unitPrice - l.discount);
    const rate = opt.gstEnabled ? l.gstRate : 0;
    let t: number, tax: number;
    if (opt.pricesIncludeTax) {
      t = r2(gross / (1 + rate / 100));
      tax = r2(gross - t);
    } else {
      t = gross;
      tax = r2((gross * rate) / 100);
    }
    if (opt.gstEnabled && opt.interState) {
      igst += tax;
    } else {
      const c = r2(tax / 2);
      cgst += c;
      sgst += r2(tax - c);
    }
    taxable += t;
    discount += l.discount;
  }
  taxable = r2(taxable); cgst = r2(cgst); sgst = r2(sgst); igst = r2(igst);
  const total = r2(taxable + cgst + sgst + igst);
  const grand = Math.round(total);
  return { taxable, cgst, sgst, igst, tax: r2(cgst + sgst + igst), discount: r2(discount), roundOff: r2(grand - total), grand };
}
