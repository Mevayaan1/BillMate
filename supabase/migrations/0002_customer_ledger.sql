-- Customer udhaar ledger. Run in the Supabase SQL editor after 0001.
-- A customer's balance = sum(grand_total - paid) over their final invoices.
-- record_payment settles the oldest unpaid invoices first and logs the receipt in payments.

create or replace function record_payment(p_party uuid, p_amount numeric, p_mode text default 'cash')
returns void language plpgsql as $$
declare
  remaining numeric := p_amount;
  due_total numeric;
  inv record;
  take numeric;
begin
  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be positive'; end if;

  select coalesce(sum(grand_total - paid), 0) into due_total
  from invoices where party_id = p_party and status = 'final' and grand_total > paid;

  if p_amount > due_total then
    raise exception 'Amount exceeds outstanding balance (%)', due_total;
  end if;

  for inv in
    select id, grand_total, paid from invoices
    where party_id = p_party and status = 'final' and grand_total > paid
    order by date, invoice_no
    for update
  loop
    exit when remaining <= 0;
    take := least(remaining, inv.grand_total - inv.paid);
    update invoices set paid = paid + take where id = inv.id;
    insert into payments (invoice_id, party_id, amount, mode) values (inv.id, p_party, take, p_mode);
    remaining := remaining - take;
  end loop;
end $$;
