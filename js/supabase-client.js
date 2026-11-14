const PaxSupabase = (() => {
    let client;
    let sessionPromise;

    function getClient() {
        if (client) return client;
        const config = window.PAX_SUPABASE_CONFIG;
        if (!config || !config.url || !config.publishableKey) {
            throw new Error('Set the Supabase project URL and publishable key in js/supabase-config.js.');
        }
        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            throw new Error('The Supabase client could not be loaded. Check your internet connection.');
        }
        client = window.supabase.createClient(config.url, config.publishableKey, {
            auth: { storage: window.sessionStorage }
        });
        return client;
    }

    async function signInAsGuest() {
        if (!sessionPromise) {
            sessionPromise = (async () => {
                const supabaseClient = getClient();
                const { data: current, error: sessionError } = await supabaseClient.auth.getSession();
                if (sessionError) throw sessionError;
                if (current.session) return current.session;
                const { data, error } = await supabaseClient.auth.signInAnonymously();
                if (error) throw error;
                if (!data.session) throw new Error('Supabase did not return a guest session.');
                return data.session;
            })();
        }
        try {
            return await sessionPromise;
        } finally {
            sessionPromise = null;
        }
    }

    return { getClient, signInAsGuest };
})();
