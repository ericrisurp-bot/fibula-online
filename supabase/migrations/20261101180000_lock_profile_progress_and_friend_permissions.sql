-- Security hardening for persistent profiles, friend requests and profile badges.
-- Target: Fíbula Online Supabase project (jkbplwnklzhayzghizwh).
-- Review and apply manually only after this migration is approved.
--
-- The client must never write progression fields. Progression will remain readable
-- and can later be updated by a trusted server-side flow.

-- Revoke both table-level and column-level privileges. PostgreSQL keeps
-- column grants independent from table grants, so both layers must be cleared.
REVOKE ALL PRIVILEGES ON TABLE public.fibula_profiles FROM anon, authenticated;
REVOKE ALL PRIVILEGES (
  user_id, display_name, age, sex, main_character, level, kills, attributes,
  created_at, updated_at, avatar_character, attribute_gain_per_level,
  highest_survival_level, highest_pd
) ON TABLE public.fibula_profiles FROM anon, authenticated;

-- Players may read profiles and create their own minimal row. They may update
-- only identity fields that are still unset, character choice and profile avatar.
GRANT SELECT ON TABLE public.fibula_profiles TO authenticated;
GRANT INSERT (user_id, main_character)
  ON TABLE public.fibula_profiles TO authenticated;
GRANT UPDATE (display_name, age, sex, main_character, avatar_character, updated_at)
  ON TABLE public.fibula_profiles TO authenticated;

-- Friend requests: remove legacy grants at both privilege levels, including
-- anonymous column grants. RLS continues to restrict reads and responses.
REVOKE ALL PRIVILEGES ON TABLE public.fibula_friend_requests FROM anon, authenticated;
REVOKE ALL PRIVILEGES (
  id, sender_id, receiver_id, status, created_at, updated_at
) ON TABLE public.fibula_friend_requests FROM anon, authenticated;

GRANT SELECT ON TABLE public.fibula_friend_requests TO authenticated;
GRANT INSERT (sender_id, receiver_id, status)
  ON TABLE public.fibula_friend_requests TO authenticated;
GRANT UPDATE (status, updated_at)
  ON TABLE public.fibula_friend_requests TO authenticated;

-- Badges are read-only to players. Only trusted server-side roles may award them.
REVOKE ALL PRIVILEGES ON TABLE public.fibula_profile_badges FROM anon, authenticated;
REVOKE ALL PRIVILEGES (
  id, user_id, badge_code, earned_at, metadata
) ON TABLE public.fibula_profile_badges FROM anon, authenticated;

GRANT SELECT ON TABLE public.fibula_profile_badges TO authenticated;

-- Existing RLS policies remain in force, including the Arena issuer restriction,
-- owner checks, recipient-only friend-request responses and public profile reads.
