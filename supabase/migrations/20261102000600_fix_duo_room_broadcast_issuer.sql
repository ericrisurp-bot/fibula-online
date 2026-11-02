drop policy if exists "Duo room members can read room broadcasts" on realtime.messages;
create policy "Duo room members can read room broadcasts"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  and case
    when realtime.topic() ~ '^fibula:duo-room:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      public.fibula_is_duo_room_member(split_part(realtime.topic(), ':', 3)::uuid)
    else false
  end
);

drop policy if exists "Duo room members can send room broadcasts" on realtime.messages;
create policy "Duo room members can send room broadcasts"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  and case
    when realtime.topic() ~ '^fibula:duo-room:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      public.fibula_is_duo_room_member(split_part(realtime.topic(), ':', 3)::uuid)
    else false
  end
);