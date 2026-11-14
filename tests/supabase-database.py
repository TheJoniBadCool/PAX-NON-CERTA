"""Run with: uv run --no-project --with embedded-postgres --with 'psycopg[binary]' python3 tests/supabase-database.py"""
from pathlib import Path
from tempfile import TemporaryDirectory

import embedded_postgres
import psycopg


HOST = "00000000-0000-0000-0000-000000000001"
GUEST = "00000000-0000-0000-0000-000000000002"
OTHER = "00000000-0000-0000-0000-000000000003"


def main():
    with TemporaryDirectory(prefix="pax-db-test-") as directory:
        server = embedded_postgres.get_server(Path(directory) / "data")
        try:
            with psycopg.connect(server.get_uri(), autocommit=True) as db:
                db.execute("""
                    create role anon;
                    create role authenticated;
                    create schema auth;
                    create table auth.users(id uuid primary key);
                    create function auth.uid() returns uuid language sql stable as $$
                      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
                    $$;
                    grant usage on schema auth to authenticated;
                    create publication supabase_realtime;
                """)
                for user in (HOST, GUEST, OTHER):
                    db.execute("insert into auth.users values (%s)", (user,))
                migration = Path("supabase/multiplayer.sql").read_text()
                db.execute(migration)
                db.execute("set role authenticated")

                def acting_as(user):
                    db.execute("select set_config('request.jwt.claim.sub', %s, false)", (user,))

                acting_as(HOST)
                db.execute("select public.pax_create_room('ABCDE')")
                assert db.execute("select public.pax_heartbeat('ABCDE', null)").fetchone()[0]
                db.execute(
                    "select public.pax_host_turn('ABCDE', 1, 1, %s::jsonb, true)", ("[]",)
                )
                acting_as(GUEST)
                connection = db.execute("select public.pax_connect('ABCDE')").fetchone()[0]
                assert db.execute("select public.pax_heartbeat('ABCDE', %s)", (connection,)).fetchone()[0]
                db.execute(
                    "select public.pax_send(%s, %s::jsonb)",
                    (connection, '{"type":"commit","gameId":1,"round":1,"plan":[{"pieceId":"secret"}]}'),
                )
                assert db.execute("select count(*) from public.pax_turns").fetchone()[0] == 1
                assert db.execute("select count(*) from public.pax_messages").fetchone()[0] == 0

                acting_as(OTHER)
                other_connection = db.execute("select public.pax_connect('ABCDE')").fetchone()[0]
                assert db.execute("select count(*) from public.pax_turns").fetchone()[0] == 0
                assert db.execute("select count(*) from public.pax_messages").fetchone()[0] == 0
                try:
                    db.execute("select public.pax_send(%s, '{}'::jsonb)", (connection,))
                    raise AssertionError("Another guest must not send through this connection")
                except psycopg.errors.RaiseException:
                    pass
                try:
                    db.execute(
                        "select public.pax_send(%s, %s::jsonb)",
                        (other_connection, '{"type":"commit","plan":[]}'),
                    )
                    raise AssertionError("A commitment must specify its game and round")
                except psycopg.errors.RaiseException:
                    pass
                try:
                    db.execute("select public.pax_host_turn('ABCDE', 1, 1, '[]'::jsonb, true)")
                    raise AssertionError("Only the host can submit the host turn")
                except psycopg.errors.RaiseException:
                    pass

                acting_as(HOST)
                assert db.execute("select count(*) from public.pax_turns").fetchone()[0] == 2
                message_id, payload = db.execute("select id, payload from public.pax_messages").fetchone()
                assert payload["plan"][0]["pieceId"] == "secret"
                db.execute("select public.pax_ack_messages(%s::bigint[])", ([message_id],))
                assert db.execute("select count(*) from public.pax_messages").fetchone()[0] == 0
                db.execute("select public.pax_send(%s, %s::jsonb)", (connection, '{"type":"sync"}'))

                acting_as(GUEST)
                assert db.execute("select payload from public.pax_messages").fetchone()[0]["type"] == "sync"
                db.execute(
                    "select public.pax_send(%s, %s::jsonb)",
                    (connection, '{"type":"unlock","gameId":1,"round":1}'),
                )
                locked, plan = db.execute("select locked, plan from public.pax_turns").fetchone()
                assert not locked and plan is None

                acting_as(HOST)
                db.execute("select public.pax_close_room('ABCDE')")
                assert db.execute("select count(*) from public.pax_turns").fetchone()[0] == 0
                assert db.execute("select count(*) from public.pax_messages").fetchone()[0] == 0
            print("Supabase database tests passed")
        finally:
            server.cleanup()


if __name__ == "__main__":
    main()
