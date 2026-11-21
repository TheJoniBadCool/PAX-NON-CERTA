-- Run after multiplayer.sql, including on projects created before private chat.
create table public.pax_private_messages (
    id bigint generated always as identity primary key,
    room_code text not null references public.pax_rooms(code) on delete cascade,
    sender_id uuid not null references auth.users(id),
    recipient_id uuid not null references auth.users(id),
    game_id integer not null check (game_id > 0),
    body text not null check (char_length(body) between 1 and 1000),
    created_at timestamptz not null default now()
);
create index pax_private_messages_recipient_idx on public.pax_private_messages(recipient_id, id);
alter table public.pax_private_messages enable row level security;
revoke all on public.pax_private_messages from anon, authenticated;
grant select on public.pax_private_messages to authenticated;
create policy pax_private_messages_read on public.pax_private_messages for select to authenticated
using (recipient_id = (select auth.uid()));

create function public.pax_send_private(p_code text, p_connection_id uuid, p_recipient uuid, p_game integer, p_body text)
returns void language plpgsql security definer set search_path = '' as $$
declare room public.pax_rooms;
begin
    select * into room from public.pax_rooms where code = p_code;
    if auth.uid() is null or room.code is null or room.host_seen < now() - interval '45 seconds'
        or p_recipient is null or p_recipient = auth.uid() or p_game is null or p_game < 1
        or p_body is null or char_length(p_body) not between 1 and 1000 or btrim(p_body) = '' then
        raise exception 'Invalid private message';
    end if;
    if auth.uid() <> room.host_id and not exists (
        select 1 from public.pax_connections c where c.id = p_connection_id
            and c.room_code = p_code and c.guest_id = auth.uid() and not c.closed
            and c.guest_seen >= now() - interval '45 seconds'
    ) then raise exception 'Sender is not connected to this room'; end if;
    if p_recipient <> room.host_id and not exists (
        select 1 from public.pax_connections c where c.room_code = p_code
            and c.guest_id = p_recipient and not c.closed
            and c.guest_seen >= now() - interval '45 seconds'
    ) then raise exception 'Recipient is not connected to this room'; end if;
    insert into public.pax_private_messages(room_code, sender_id, recipient_id, game_id, body)
    values (p_code, auth.uid(), p_recipient, p_game, p_body);
end;
$$;

create function public.pax_ack_private_messages(p_ids bigint[]) returns void
language sql security definer set search_path = '' as $$
    delete from public.pax_private_messages where id = any(p_ids) and recipient_id = auth.uid();
$$;
revoke execute on function public.pax_send_private(text, uuid, uuid, integer, text),
    public.pax_ack_private_messages(bigint[]) from public, anon;
grant execute on function public.pax_send_private(text, uuid, uuid, integer, text),
    public.pax_ack_private_messages(bigint[]) to authenticated;
alter publication supabase_realtime add table public.pax_private_messages;
