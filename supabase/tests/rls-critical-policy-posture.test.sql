begin;

create extension if not exists pgtap;

select plan(25);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and cmd = 'SELECT'
      and (
        roles @> array['anon'::name]
        or roles @> array['public'::name]
      )
  ),
  0,
  'profiles do not allow anonymous table reads'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users and admins can read profiles'
      and cmd = 'SELECT'
      and roles @> array['authenticated'::name]
      and not (roles @> array['anon'::name])
  ),
  'profiles select policy is authenticated-only for owners/admins'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can insert their own profile'
      and cmd = 'INSERT'
      and roles @> array['authenticated'::name]
  ),
  'profiles insert policy is explicitly authenticated-scoped'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Users can update own profile'
      and cmd = 'UPDATE'
      and roles @> array['authenticated'::name]
  ),
  'profiles update policy is explicitly authenticated-scoped'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ads'
      and policyname = 'Public can view active ads'
      and cmd = 'SELECT'
      and roles @> array['anon'::name]
      and roles @> array['authenticated'::name]
  ),
  'ads public select policy is explicitly scoped to anon/authenticated'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ads'
      and policyname = 'Users can insert own ads'
      and cmd = 'INSERT'
      and roles @> array['authenticated'::name]
  ),
  'ads insert policy is explicitly authenticated-scoped'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ads'
      and policyname = 'Sellers and admins can update ads'
      and cmd = 'UPDATE'
      and roles @> array['authenticated'::name]
  ),
  'ads update policy is explicitly authenticated-scoped'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ads'
      and policyname = 'Sellers can delete own ads'
      and cmd = 'DELETE'
      and roles @> array['authenticated'::name]
  ),
  'ads delete policy is explicitly authenticated-scoped'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'credit_transactions'
      and policyname = 'Users can view own transactions'
      and cmd = 'SELECT'
      and roles @> array['authenticated'::name]
      and not (roles @> array['anon'::name])
  ),
  'credit_transactions read policy is authenticated-only'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'inquiries'
      and policyname = 'Users can send inquiries'
      and cmd = 'INSERT'
      and roles @> array['authenticated'::name]
      and with_check ilike '%sender_id%auth.uid()%'
      and with_check not ilike '%recipient_id%'
  ),
  'authenticated inquiry senders may address themselves'
);

select ok(
  exists(
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'payment_notifications'
      and column_name = 'billing_transaction_id'
      and udt_name = 'uuid'
  ),
  'payment_notifications can reference billing transactions'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'payment_notifications'
      and policyname = 'Users can see their payment notifications'
      and cmd = 'SELECT'
      and roles @> array['authenticated'::name]
      and not (roles @> array['anon'::name])
      and qual ilike '%billing_transactions%'
  ),
  'payment_notifications read policy includes billing transaction ownership'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'Service role full access to profiles'
      and cmd = 'ALL'
      and roles @> array['service_role'::name]
  ),
  'profiles include explicit service_role full-access policy'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'ads'
      and policyname = 'Service role full access to ads'
      and cmd = 'ALL'
      and roles @> array['service_role'::name]
  ),
  'ads include explicit service_role full-access policy'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'credit_transactions'
      and policyname = 'Service role full access to credit transactions'
      and cmd = 'ALL'
      and roles @> array['service_role'::name]
  ),
  'credit_transactions include explicit service_role full-access policy'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dealers'
      and cmd = 'SELECT'
      and (
        roles @> array['anon'::name]
        or roles @> array['public'::name]
      )
  ),
  0,
  'dealers do not allow anonymous raw table reads'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dealers'
      and policyname = 'Dealer owners and admins can read dealers'
      and cmd = 'SELECT'
      and roles @> array['authenticated'::name]
      and not (roles @> array['anon'::name])
  ),
  'dealers select policy is authenticated-only for owners/admins'
);

select ok(
  exists(
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'dealers'
      and policyname = 'Service role full access to dealers'
      and cmd = 'ALL'
      and roles @> array['service_role'::name]
  ),
  'dealers include explicit service_role full-access policy'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'ads', 'credit_transactions', 'dealers')
      and roles = array['public'::name]
  ),
  0,
  'critical tables do not expose policies bound to public role'
);

select ok(
  exists(
    select 1
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relname = 'public_profiles'
      and relkind = 'v'
  )
  and not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'public_profiles'
      and column_name in ('email', 'phone', 'credit_balance', 'notify_moderation_email')
  ),
  'public_profiles view exposes only safe display columns'
);

select ok(
  exists(select 1 from pg_class where relnamespace = 'public'::regnamespace and relname = 'site_admins'),
  'site_admins table exists in public schema'
);

select ok(
  exists(select 1 from pg_class where relnamespace = 'public'::regnamespace and relname = 'contact_messages'),
  'contact_messages table exists in public schema'
);

select ok(
  exists(
    select 1
    from pg_enum
    where enumtypid = 'public.ad_status'::regtype
      and enumlabel = 'pending'
  )
  and exists(
    select 1
    from pg_enum
    where enumtypid = 'public.ad_status'::regtype
      and enumlabel = 'rejected'
  ),
  'ad_status enum includes moderation states'
);

delete from public.email_jobs;

insert into public.email_jobs (job_type, payload, status, available_at)
values
  ('auth_register_confirmation', '{}'::jsonb, 'pending', now() - interval '1 minute'),
  ('payment_confirmation', '{}'::jsonb, 'pending', now() - interval '1 minute');

create temporary table claimed_email_job_filter_test as
select id, job_type
from public.claim_email_jobs(
  array['payment_confirmation']::text[],
  10,
  now() - interval '10 minutes'
);

select is(
  (select count(*)::integer from claimed_email_job_filter_test),
  1,
  'claim_email_jobs respects requested job type for pending jobs'
);

select is(
  (
    select count(*)::integer
    from claimed_email_job_filter_test
    where job_type = 'payment_confirmation'
  ),
  1,
  'claim_email_jobs returns only requested pending job type'
);

select * from finish();

rollback;
