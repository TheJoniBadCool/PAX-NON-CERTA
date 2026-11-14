// Run with: gjs -c "var window = {}; $(cat js/supabase-client.js tests/supabase-client.js)"
function assert(condition, message) {
    if (!condition) throw new Error(message);
}

async function runSupabaseClientTests() {
    let message = '';
    try { PaxSupabase.getClient(); } catch (error) { message = error.message; }
    assert(message.includes('supabase-config.js'), 'Missing configuration must be reported');
    window.PAX_SUPABASE_CONFIG = { url: 'https://example.supabase.co', publishableKey: 'public' };
    try { PaxSupabase.getClient(); } catch (error) { message = error.message; }
    assert(message.includes('could not be loaded'), 'Missing client library must be reported');

    const storage = {};
    window.sessionStorage = storage;
    let createCount = 0;
    let signInCount = 0;
    let currentSession = null;
    let signInError = null;
    const mockClient = {
        auth: {
            async getSession() { return { data: { session: currentSession }, error: null }; },
            async signInAnonymously() {
                signInCount++;
                if (signInError) return { data: {}, error: signInError };
                currentSession = { user: { id: 'guest' } };
                return { data: { session: currentSession }, error: null };
            }
        }
    };
    window.supabase = {
        createClient(url, key, options) {
            createCount++;
            assert(url === window.PAX_SUPABASE_CONFIG.url && key === 'public', 'Client configuration');
            assert(options.auth.storage === storage, 'Guest sessions use tab storage');
            return mockClient;
        }
    };

    const [first, concurrent] = await Promise.all([
        PaxSupabase.signInAsGuest(), PaxSupabase.signInAsGuest()
    ]);
    assert(first === concurrent && signInCount === 1 && createCount === 1,
        'Concurrent sign-ins must share a single request');
    assert(await PaxSupabase.signInAsGuest() === first && signInCount === 1,
        'Existing sessions must be reused');
    currentSession = null;
    signInError = new Error('Sign-in disabled');
    let failed = false;
    try { await PaxSupabase.signInAsGuest(); } catch (error) { failed = error === signInError; }
    assert(failed, 'Sign-in failures must be surfaced');
    signInError = null;
    assert(await PaxSupabase.signInAsGuest(), 'A failed sign-in must be retryable');
    print('Supabase client tests passed');
}

runSupabaseClientTests().catch(error => {
    printerr(error.stack || error.message);
    imports.system.exit(1);
});
