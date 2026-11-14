-- Run once in the SQL Editor of the Supabase project used by this game.
-- Anonymous sign-ins must be enabled in Authentication.
create table public.pax_rooms (
    code text primary key check (code ~ '^[A-HJ-NP-Z2-9]{5}$'),
    host_id uuid not null references auth.users(id),
    host_seen timestamptz not null default now(),
    created_at timestamptz not null default now()
);

create table public.pax_connections (
    id uuid primary key default gen_random_uuid(),
    room_code text not null references public.pax_rooms(code) on delete cascade,
    guest_id uuid not null references auth.users(id),
    guest_seen timestamptz not null default now(),
    closed boolean not null default false
);
create index pax_connections_room_idx on public.pax_connections(room_code);

create table public.pax_messages (
    id bigint generated always as identity primary key,
    connection_id uuid not null references public.pax_connections(id) on delete cascade,
    recipient_id uuid not null references auth.users(id),
    payload jsonb not null,
    created_at timestamptz not null default now()
);
create index pax_messages_recipient_idx on public.pax_messages(recipient_id, id);

-- This table is an audit of submitted intent, not the authoritative game state.
-- Only the submitting player and room host can read a pending plan.
create table public.pax_turns (
    room_code text not null references public.pax_rooms(code) on delete cascade,
    player_id uuid not null references auth.users(id),
    game_id integer not null,
    round integer not null,
    locked boolean not null,
    plan jsonb,
    updated_at timestamptz not null default now(),
    primary key (room_code, player_id, game_id, round)
);

alter table public.pax_rooms enable row level security;
alter table public.pax_connections enable row level security;
alter table public.pax_messages enable row level security;
alter table public.pax_turns enable row level security;

revoke all on public.pax_rooms, public.pax_connections, public.pax_messages, public.pax_turns from anon, authenticated;
grant select on public.pax_rooms, public.pax_connections, public.pax_messages, public.pax_turns to authenticated;

create function public.pax_is_host(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.pax_rooms where code = p_code and host_id = auth.uid());
$$;
create function public.pax_is_guest(p_code text) returns boolean
language sql stable security definer set search_path = '' as $$
    select exists (select 1 from public.pax_connections where room_code = p_code and guest_id = auth.uid());
$$;
revoke execute on function public.pax_is_host(text), public.pax_is_guest(text) from public, anon;
grant execute on function public.pax_is_host(text), public.pax_is_guest(text) to authenticated;

create policy pax_rooms_read on public.pax_rooms for select to authenticated
using (host_id = (select auth.uid()) or public.pax_is_guest(code));
create policy pax_connections_read on public.pax_connections for select to authenticated
using (guest_id = (select auth.uid()) or public.pax_is_host(room_code));
create policy pax_messages_read on public.pax_messages for select to authenticated
using (recipient_id = (select auth.uid()));
create policy pax_turns_read on public.pax_turns for select to authenticated
using (player_id = (select auth.uid()) or public.pax_is_host(room_code));

create function public.pax_create_room(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
    if auth.uid() is null or p_code is null or p_code !~ '^[A-HJ-NP-Z2-9]{5}$' then
        raise exception 'Invalid room code or guest session';
    end if;
    -- Clean abandoned rooms opportunistically; closing a room also cascades its data.
    delete from public.pax_rooms where host_seen < now() - interval '24 hours';
    delete from public.pax_rooms where code = p_code and host_seen < now() - interval '90 seconds';
    insert into public.pax_rooms(code, host_id) values (p_code, auth.uid());
end;
$$;

create function public.pax_connect(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare room public.pax_rooms; connection_id uuid;
begin
    select * into room from public.pax_rooms where code = p_code for update;
    if auth.uid() is null or room.code is null or room.host_seen < now() - interval '45 seconds' then
        raise exception 'Room not found or host offline';
    end if;
    if room.host_id = auth.uid() then raise exception 'Host cannot join their own room'; end if;
    update public.pax_connections set closed = true
    where room_code = p_code and guest_id = auth.uid() and not closed;
    if (select count(*) from public.pax_connections
        where room_code = p_code and not closed and guest_seen >= now() - interval '45 seconds') >= 8 then
        raise exception 'Too many room connections';
    end if;
    insert into public.pax_connections(room_code, guest_id) values (p_code, auth.uid())
    returning id into connection_id;
    return connection_id;
end;
$$;

create function public.pax_heartbeat(p_code text, p_connection_id uuid default null) returns boolean
language plpgsql security definer set search_path = '' as $$
declare room public.pax_rooms; affected integer;
begin
    select * into room from public.pax_rooms where code = p_code;
    if auth.uid() is null or room.code is null then return false; end if;
    if p_connection_id is null and room.host_id = auth.uid() then
        update public.pax_rooms set host_seen = now() where code = p_code;
        return true;
    end if;
    update public.pax_connections set guest_seen = now()
    where id = p_connection_id and room_code = p_code and guest_id = auth.uid() and not closed;
    get diagnostics affected = row_count;
    return affected = 1 and room.host_seen >= now() - interval '45 seconds';
end;
$$;

create function public.pax_list_connections(p_code text)
returns table(id uuid, guest_id uuid, active boolean)
language sql stable security definer set search_path = '' as $$
    select c.id, c.guest_id, not c.closed and c.guest_seen >= now() - interval '45 seconds'
    from public.pax_connections c
    where c.room_code = p_code and public.pax_is_host(p_code);
$$;

create function public.pax_close_connection(p_connection_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
    update public.pax_connections c set closed = true
    where c.id = p_connection_id and
        (c.guest_id = auth.uid() or exists (
            select 1 from public.pax_rooms r where r.code = c.room_code and r.host_id = auth.uid()
        ));
end;
$$;

create function public.pax_close_room(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
begin
    delete from public.pax_rooms where code = p_code and host_id = auth.uid();
end;
$$;

create function public.pax_send(p_connection_id uuid, p_payload jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare conn public.pax_connections; host uuid; destination uuid;
begin
    if auth.uid() is null or p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 500000 then
        raise exception 'Invalid message';
    end if;
    select * into conn from public.pax_connections where id = p_connection_id and not closed;
    if conn.id is null then raise exception 'Connection closed'; end if;
    select host_id into host from public.pax_rooms where code = conn.room_code;
    if auth.uid() = host then destination := conn.guest_id;
    elsif auth.uid() = conn.guest_id then destination := host;
    else raise exception 'Not a connection participant'; end if;

    if auth.uid() = conn.guest_id and p_payload->>'type' in ('commit', 'unlock') then
        if coalesce(p_payload->>'gameId', '') !~ '^[0-9]{1,9}$'
            or coalesce(p_payload->>'round', '') !~ '^[0-9]{1,9}$'
            or (p_payload->>'type' = 'commit' and coalesce(jsonb_typeof(p_payload->'plan'), '') <> 'array') then
            raise exception 'Invalid turn submission';
        end if;
        insert into public.pax_turns(room_code, player_id, game_id, round, locked, plan)
        values (conn.room_code, auth.uid(), (p_payload->>'gameId')::integer,
                (p_payload->>'round')::integer, p_payload->>'type' = 'commit',
                case when p_payload->>'type' = 'commit' then p_payload->'plan' else null end)
        on conflict (room_code, player_id, game_id, round) do update
        set locked = excluded.locked, plan = excluded.plan, updated_at = now();
    end if;
    insert into public.pax_messages(connection_id, recipient_id, payload)
    values (conn.id, destination, p_payload);
end;
$$;

create function public.pax_host_turn(p_code text, p_game integer, p_round integer, p_plan jsonb, p_locked boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
    if not exists (select 1 from public.pax_rooms where code = p_code and host_id = auth.uid())
        or p_game is null or p_round is null or p_locked is null or p_game < 0 or p_round < 1
        or (p_locked and coalesce(jsonb_typeof(p_plan), '') <> 'array')
        or octet_length(p_plan::text) > 500000 then
        raise exception 'Invalid host turn';
    end if;
    insert into public.pax_turns(room_code, player_id, game_id, round, locked, plan)
    values (p_code, auth.uid(), p_game, p_round, p_locked, case when p_locked then p_plan else null end)
    on conflict (room_code, player_id, game_id, round) do update
    set locked = excluded.locked, plan = excluded.plan, updated_at = now();
end;
$$;

create function public.pax_ack_messages(p_ids bigint[]) returns void
language sql security definer set search_path = '' as $$
    delete from public.pax_messages where id = any(p_ids) and recipient_id = auth.uid();
$$;

revoke execute on function public.pax_create_room(text), public.pax_connect(text),
    public.pax_heartbeat(text, uuid), public.pax_list_connections(text), public.pax_close_connection(uuid), public.pax_close_room(text),
    public.pax_send(uuid, jsonb), public.pax_host_turn(text, integer, integer, jsonb, boolean),
    public.pax_ack_messages(bigint[]) from public, anon;
grant execute on function public.pax_create_room(text), public.pax_connect(text),
    public.pax_heartbeat(text, uuid), public.pax_list_connections(text), public.pax_close_connection(uuid), public.pax_close_room(text),
    public.pax_send(uuid, jsonb), public.pax_host_turn(text, integer, integer, jsonb, boolean),
    public.pax_ack_messages(bigint[]) to authenticated;

alter publication supabase_realtime add table public.pax_connections, public.pax_messages;
