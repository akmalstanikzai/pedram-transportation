-- Revert the payment feature only. Bookings, traders, vehicles and drivers remain.
-- Any payment records in booking_payments will be permanently removed.
begin;

drop function if exists public.record_booking_payment(uuid, text, numeric, date, text, text, text, uuid);
drop table if exists public.booking_payments;

commit;
