-- Restrict lobby invite inboxes, friend presence, and pair lobby channels
-- to authenticated Arena users who are already accepted friends.

drop policy if exists "Fibula friends can receive lobby invites" on realtime.messages;
drop policy if exists "Fibula friends can send lobby invites" on realtime.messages;
drop policy if exists "Fibula friends can read online presence" on realtime.messages;
drop policy if exists "Fibula players can publish own online presence" on realtime.messages;
drop policy if exists "Fibula friends can read duo lobby events" on realtime.messages;
drop policy if exists "Fibula friends can publish duo lobby events" on realtime.messages;

create policy "Fibula friends can receive lobby invites"
on realtime.messages for select to authenticated
using (
  extension = 'broadcast'
  and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  and realtime.topic() = 'fibula:inbox:' || (select auth.uid())::text
);

create policy "Fibula friends can send lobby invites"
on realtime.messages for insert to authenticated
with check (
  extension = 'broadcast'
  and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  and case
    when realtime.topic() ~ '^fibula:inbox:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then exists (
      select 1 from public.fibula_friend_requests f
      where f.status = 'accepted'
        and (
          (f.sender_id = split_part(realtime.topic(), ':', 3)::uuid and f.receiver_id = (select auth.uid()))
          or (f.receiver_id = split_part(realtime.topic(), ':', 3)::uuid and f.sender_id = (select auth.uid()))
        )
    )
    else false
  end
);

create policy "Fibula friends can read online presence"
on realtime.messages for select to authenticated
using (
  extension = 'presence'
  and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  and case
    when realtime.topic() ~ '^fibula:presence:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (
      split_part(realtime.topic(), ':', 3)::uuid = (select auth.uid())
      or exists (
        select 1 from public.fibula_friend_requests f
        where f.status = 'accepted'
          and (
            (f.sender_id = split_part(realtime.topic(), ':', 3)::uuid and f.receiver_id = (select auth.uid()))
            or (f.receiver_id = split_part(realtime.topic(), ':', 3)::uuid and f.sender_id = (select auth.uid()))
          )
      )
    )
    else false
  end
);

create policy "Fibula players can publish own online presence"
on realtime.messages for insert to authenticated
with check (
  extension = 'presence'
  and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  and realtime.topic() = 'fibula:presence:' || (select auth.uid())::text
);

create policy "Fibula friends can read duo lobby events"
on realtime.messages for select to authenticated
using (
  extension in ('broadcast', 'presence')
  and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  and case
    when realtime.topic() ~ '^fibula:duo:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (
      split_part(realtime.topic(), ':', 3)::uuid <> split_part(realtime.topic(), ':', 4)::uuid
      and (select auth.uid()) in (split_part(realtime.topic(), ':', 3)::uuid, split_part(realtime.topic(), ':', 4)::uuid)
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

create policy "Fibula friends can publish duo lobby events"
on realtime.messages for insert to authenticated
with check (
  extension in ('broadcast', 'presence')
  and (select auth.jwt() ->> 'iss') = 'https://bqzplfvjvdylbwmulisz.supabase.co/auth/v1'
  and case
    when realtime.topic() ~ '^fibula:duo:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then (
      split_part(realtime.topic(), ':', 3)::uuid <> split_part(realtime.topic(), ':', 4)::uuid
      and (select auth.uid()) in (split_part(realtime.topic(), ':', 3)::uuid, split_part(realtime.topic(), ':', 4)::uuid)
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
