-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.entries (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    entry_id bigint not null,
    point_key text not null,
    lat double precision not null,
    lon double precision not null,
    title text not null,
    text_html text not null,
    text_plain text not null,
    image text,
    created_at_ms bigint not null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, entry_id)
);

create table if not exists public.stories (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    story_id bigint not null,
    title text not null,
    entry_ids jsonb not null default '[]'::jsonb,
    visible boolean not null default true,
    total_miles double precision not null default 0,
    line_color text not null default '#a43855',
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique(user_id, story_id)
);

alter table public.entries enable row level security;
alter table public.stories enable row level security;

do $$
begin
    if exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'entries'
          and policyname = 'entries_owner_all'
    ) then
        execute 'alter policy "entries_owner_all" on public.entries using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    else
        execute 'create policy "entries_owner_all" on public.entries for all using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    end if;
end;
$$;

do $$
begin
    if exists (
        select 1
        from pg_policies
        where schemaname = 'public'
          and tablename = 'stories'
          and policyname = 'stories_owner_all'
    ) then
        execute 'alter policy "stories_owner_all" on public.stories using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    else
        execute 'create policy "stories_owner_all" on public.stories for all using (auth.uid() = user_id) with check (auth.uid() = user_id)';
    end if;
end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'set_entries_updated_at'
          and tgrelid = 'public.entries'::regclass
          and not tgisinternal
    ) then
        create trigger set_entries_updated_at
        before update on public.entries
        for each row
        execute function public.set_updated_at();
    end if;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_trigger
        where tgname = 'set_stories_updated_at'
          and tgrelid = 'public.stories'::regclass
          and not tgisinternal
    ) then
        create trigger set_stories_updated_at
        before update on public.stories
        for each row
        execute function public.set_updated_at();
    end if;
end;
$$;
