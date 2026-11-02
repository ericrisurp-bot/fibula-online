-- Restrict lobby invitation broadcast to the private topic shared by an accepted friend pair.
drop policy if exists "Fibula friends can receive lobby invites" on realtime.messages;
drop policy if exists "Fibula friends can send lobby invites" on realtime.messages;

create policy "Fibula friends can receive lobby invites"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  and case
    when realtime.topic() ~ '^fibula:inbox:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (
      split_part(realtime.topic(), ':', 3)::uuid <> split_part(realtime.topic(), ':', 4)::uuid
      and (select auth.uid()) in (
        split_part(realtime.topic(), ':', 3)::uuid,
        split_part(realtime.topic(), ':', 4)::uuid
      )
      and exists (
        select 1 from public.fibula_friend_requests f
        where f.status = 'accepted'
          and (
            (f.sender_id = split_part(realtime.topic(), ':', 3)::uuid and f.receiver_id = split_part(realtime.topic(), ':', 4)::uuid)
            or (f.receiver_id = split_part(realtime.topic(), ':', 3)::uuid and f.sender_id = split_part(realtime.topic(), ':', 4)::uuid)
          )
      )
    )
    else false
  end
);

create policy "Fibula friends can send lobby invites"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  and case
    when realtime.topic() ~ '^fibula:inbox:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (
      split_part(realtime.topic(), ':', 3)::uuid <> split_part(realtime.topic(), ':', 4)::uuid
      and (select auth.uid()) in (
        split_part(realtime.topic(), ':', 3)::uuid,
        split_part(realtime.topic(), ':', 4)::uuid
      )
      and exists (
        select 1 from public.fibula_friend_requests f
        where f.status = 'accepted'
          and (
            (f.sender_id = split_part(realtime.topic(), ':', 3)::uuid and f.receiver_id = split_part(realtime.topic(), ':', 4)::uuid)
            or (f.receiver_id = split_part(realtime.topic(), ':', 3)::uuid and f.sender_id = split_part(realtime.topic(), ':', 4)::uuid)
          )
      )
    )
    else false
  end
);
