-- BillMate v1 schema (single shop). Run in the Supabase SQL editor.
-- Every product has at least one variant row; simple products use one "Default" variant.
-- Stock is an append-only ledger; invoices/purchases are written by RPCs so numbering,
-- totals and stock stay consistent in one transaction.

create extension if not exists pgcrypto;

-- ---------- Shop settings (exactly one row) ----------
create table settings (
  id int primary key default 1 check (id = 1),
  shop_name text not null default 'My Shop',
  address text not null default '',
  phone text not null default '',
  gstin text not null default '',
  state_code text not null default '',          -- 2-digit GST state code, e.g. '08'
  logo_url text,
  invoice_prefix text not null default 'INV',
  next_invoice_no bigint not null default 1,
  prices_include_tax boolean not null default true,
  gst_enabled boolean not null default true,
  footer_note text not null default 'Thank you! Visit again.',
  setup_done boolean not null default false
);
insert into settings (id) values (1);

-- ---------- Catalog ----------
create table categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_id uuid references categories(id) on delete set null,
  hsn text not null default '',
  gst_rate numeric(5,2) not null default 0 check (gst_rate >= 0),
  unit text not null default 'pcs',
  has_variants boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id) on delete cascade,
  label text not null default 'Default',          -- e.g. 'M / Red'
  sku text unique,
  barcode text unique,
  cost_price numeric(12,2) not null default 0,
  sale_price numeric(12,2) not null default 0,
  mrp numeric(12,2),
  low_stock_limit numeric(12,3) not null default 5,
  active boolean not null default true
);
create index on variants (product_id);

-- ---------- Parties ----------
create table parties (
  id uuid primary key default gen_random_uuid(),
  type text not null default 'customer' check (type in ('customer','supplier','both')),
  name text not null,
  phone text not null default '',
  gstin text not null default '',
  state_code text not null default '',
  address text not null default '',
  created_at timestamptz not null default now()
);

-- ---------- Stock ledger ----------
create table stock_ledger (
  id bigint generated always as identity primary key,
  variant_id uuid not null references variants(id),
  qty numeric(12,3) not null,                      -- + in, - out
  reason text not null check (reason in ('purchase','sale','sale_cancel','adjustment','opening')),
  ref_id uuid,
  note text not null default '',
  created_at timestamptz not null default now()
);
create index on stock_ledger (variant_id);

create view stock_levels with (security_invoker = true) as
  select v.id as variant_id, coalesce(sum(l.qty), 0) as qty
  from variants v left join stock_ledger l on l.variant_id = v.id
  group by v.id;

-- ---------- Purchases ----------
create table purchases (
  id uuid primary key default gen_random_uuid(),
  party_id uuid references parties(id),
  bill_ref text not null default '',
  date date not null default current_date,
  total numeric(12,2) not null default 0,
  note text not null default '',
  created_at timestamptz not null default now()
);
create table purchase_items (
  id uuid primary key default gen_random_uuid(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  variant_id uuid not null references variants(id),
  qty numeric(12,3) not null check (qty > 0),
  cost_price numeric(12,2) not null
);

-- ---------- Invoices ----------
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_no text not null unique,
  date timestamptz not null default now(),
  party_id uuid references parties(id),
  customer_name text not null default '',
  place_of_supply text not null default '',
  taxable_total numeric(12,2) not null default 0,
  cgst_total numeric(12,2) not null default 0,
  sgst_total numeric(12,2) not null default 0,
  igst_total numeric(12,2) not null default 0,
  discount_total numeric(12,2) not null default 0,
  round_off numeric(12,2) not null default 0,
  grand_total numeric(12,2) not null default 0,
  paid numeric(12,2) not null default 0,
  payment_mode text not null default 'cash' check (payment_mode in ('cash','upi','card','credit')),
  status text not null default 'final' check (status in ('final','cancelled')),
  note text not null default ''
);
create index on invoices (date desc);

create table invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  variant_id uuid references variants(id),
  -- snapshots so later product edits never change old bills
  name text not null,
  hsn text not null default '',
  unit text not null default 'pcs',
  qty numeric(12,3) not null check (qty > 0),
  unit_price numeric(12,2) not null,
  discount numeric(12,2) not null default 0,
  gst_rate numeric(5,2) not null default 0,
  taxable numeric(12,2) not null,
  cgst numeric(12,2) not null default 0,
  sgst numeric(12,2) not null default 0,
  igst numeric(12,2) not null default 0,
  line_total numeric(12,2) not null
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id) on delete cascade,
  party_id uuid references parties(id),
  amount numeric(12,2) not null,
  mode text not null default 'cash',
  date timestamptz not null default now()
);

-- ============ RPCs ============

-- create_invoice(payload):
-- { party_id?, customer_name?, place_of_supply?, discount_total?, payment_mode, paid?, note?,
--   items: [{ variant_id, qty, unit_price, discount }] }
-- unit_price is what the cashier sees (tax-inclusive when settings.prices_include_tax).
create or replace function create_invoice(payload jsonb)
returns uuid
language plpgsql
security invoker
as $$
declare
  s settings%rowtype;
  inv_id uuid := gen_random_uuid();
  inv_no text;
  it jsonb;
  v variants%rowtype;
  p products%rowtype;
  q numeric; price numeric; disc numeric;
  gross numeric; net numeric; taxable numeric; tax numeric; rate numeric;
  inter boolean;
  c numeric; sg numeric; ig numeric;
  sum_taxable numeric := 0; sum_c numeric := 0; sum_s numeric := 0; sum_i numeric := 0;
  sum_disc numeric := 0; sum_total numeric := 0;
  grand numeric; rounded numeric;
  avail numeric;
  pay_mode text := coalesce(payload->>'payment_mode','cash');
  paid_amt numeric;
begin
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) = 0 then
    raise exception 'Invoice has no items';
  end if;

  -- allocate number atomically
  update settings set next_invoice_no = next_invoice_no + 1 where id = 1
    returning * into s;
  inv_no := s.invoice_prefix || '-' || lpad((s.next_invoice_no - 1)::text, 5, '0');

  inter := s.gst_enabled
    and coalesce(payload->>'place_of_supply','') <> ''
    and s.state_code <> ''
    and payload->>'place_of_supply' <> s.state_code;

  insert into invoices (id, invoice_no, party_id, customer_name, place_of_supply, payment_mode, note)
  values (inv_id, inv_no, nullif(payload->>'party_id','')::uuid,
          coalesce(payload->>'customer_name',''), coalesce(payload->>'place_of_supply',''),
          pay_mode, coalesce(payload->>'note',''));

  for it in select * from jsonb_array_elements(payload->'items') loop
    select * into v from variants where id = (it->>'variant_id')::uuid for update;
    if not found then raise exception 'Unknown product variant'; end if;
    select * into p from products where id = v.product_id;

    q := (it->>'qty')::numeric;
    price := (it->>'unit_price')::numeric;
    disc := coalesce((it->>'discount')::numeric, 0);
    if q <= 0 then raise exception 'Quantity must be positive'; end if;

    select coalesce(sum(qty),0) into avail from stock_ledger where variant_id = v.id;
    if avail < q then
      raise exception 'Insufficient stock for % (% available)', p.name, avail;
    end if;

    gross := round(q * price - disc, 2);
    rate := case when s.gst_enabled then p.gst_rate else 0 end;
    if s.prices_include_tax then
      taxable := round(gross / (1 + rate/100), 2);
      tax := gross - taxable;
    else
      taxable := gross;
      tax := round(gross * rate/100, 2);
    end if;

    if inter then c := 0; sg := 0; ig := tax;
    else c := round(tax/2, 2); sg := tax - c; ig := 0; end if;

    insert into invoice_items (invoice_id, variant_id, name, hsn, unit, qty, unit_price, discount,
                               gst_rate, taxable, cgst, sgst, igst, line_total)
    values (inv_id, v.id,
            p.name || case when p.has_variants then ' (' || v.label || ')' else '' end,
            p.hsn, p.unit, q, price, disc, rate, taxable, c, sg, ig, taxable + c + sg + ig);

    insert into stock_ledger (variant_id, qty, reason, ref_id) values (v.id, -q, 'sale', inv_id);

    sum_taxable := sum_taxable + taxable; sum_c := sum_c + c; sum_s := sum_s + sg; sum_i := sum_i + ig;
    sum_disc := sum_disc + disc; sum_total := sum_total + taxable + c + sg + ig;
  end loop;

  rounded := round(sum_total);
  paid_amt := case when pay_mode = 'credit' then coalesce((payload->>'paid')::numeric, 0) else rounded end;

  update invoices set
    taxable_total = sum_taxable, cgst_total = sum_c, sgst_total = sum_s, igst_total = sum_i,
    discount_total = sum_disc, round_off = rounded - sum_total, grand_total = rounded, paid = paid_amt
  where id = inv_id;

  if paid_amt > 0 then
    insert into payments (invoice_id, party_id, amount, mode)
    values (inv_id, nullif(payload->>'party_id','')::uuid, paid_amt,
            case when pay_mode = 'credit' then 'cash' else pay_mode end);
  end if;

  return inv_id;
end $$;

create or replace function cancel_invoice(inv uuid)
returns void language plpgsql as $$
begin
  if not exists (select 1 from invoices where id = inv and status = 'final') then
    raise exception 'Invoice not found or already cancelled';
  end if;
  update invoices set status = 'cancelled' where id = inv;
  insert into stock_ledger (variant_id, qty, reason, ref_id)
    select variant_id, qty, 'sale_cancel', inv from invoice_items
    where invoice_id = inv and variant_id is not null;
end $$;

-- create_purchase(payload): { party_id?, bill_ref?, date?, note?, items: [{variant_id, qty, cost_price}] }
create or replace function create_purchase(payload jsonb)
returns uuid language plpgsql as $$
declare pid uuid := gen_random_uuid(); it jsonb; tot numeric := 0;
begin
  if jsonb_array_length(coalesce(payload->'items','[]'::jsonb)) = 0 then
    raise exception 'Purchase has no items';
  end if;
  insert into purchases (id, party_id, bill_ref, date, note)
  values (pid, nullif(payload->>'party_id','')::uuid, coalesce(payload->>'bill_ref',''),
          coalesce((payload->>'date')::date, current_date), coalesce(payload->>'note',''));
  for it in select * from jsonb_array_elements(payload->'items') loop
    insert into purchase_items (purchase_id, variant_id, qty, cost_price)
      values (pid, (it->>'variant_id')::uuid, (it->>'qty')::numeric, (it->>'cost_price')::numeric);
    insert into stock_ledger (variant_id, qty, reason, ref_id)
      values ((it->>'variant_id')::uuid, (it->>'qty')::numeric, 'purchase', pid);
    update variants set cost_price = (it->>'cost_price')::numeric where id = (it->>'variant_id')::uuid;
    tot := tot + (it->>'qty')::numeric * (it->>'cost_price')::numeric;
  end loop;
  update purchases set total = round(tot, 2) where id = pid;
  return pid;
end $$;

-- ============ Row level security: any signed-in user is the owner ============
do $$
declare t text;
begin
  foreach t in array array['settings','categories','products','variants','parties','stock_ledger',
                           'purchases','purchase_items','invoices','invoice_items','payments']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "owner all" on %I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
-- In Supabase: Authentication > Providers > Email, then DISABLE "Allow new users to sign up"
-- after you create the owner account, so nobody else can register.
