const PrivateChat = (() => {
    const $ = id => document.getElementById(id);
    const panel = $('private-chat');
    const input = $('private-chat-input');
    const messages = $('private-chat-messages');
    const error = $('private-chat-error');
    let active = null;
    let conversations = [[], [], [], []];
    let unread = [false, false, false, false];
    let generation = 0;
    let sending = false;

    function renderButtons() {
        const state = gameState.multiplayer ? Multiplayer.getPrivateChatState() : null;
        for (let i = 0; i < 4; i++) {
            const button = $(`private-chat-p${i + 1}`);
            const visible = !!state && state.started && i !== state.myIndex && !!state.roster[i];
            button.classList.toggle('hidden', !visible);
            button.classList.toggle('private-chat-unread', visible && unread[i]);
            const name = PLAYERS[i].name;
            button.setAttribute('aria-label', `Private chat with ${name}${unread[i] ? ', unread messages' : ''}`);
            button.title = unread[i] ? `Unread messages from ${name}` : `Private chat with ${name}`;
        }
        if (active !== null && state && state.roster[active]) {
            $('private-chat-title').textContent = `Private chat with ${PLAYERS[active].name}`;
        }
    }

    function renderMessages() {
        messages.replaceChildren();
        if (active === null) return;
        conversations[active].forEach(message => {
            const line = document.createElement('div');
            line.className = message.mine ? 'private-chat-message mine' : 'private-chat-message';
            const label = document.createElement('strong');
            label.textContent = message.mine ? 'You: ' : `${PLAYERS[active].name}: `;
            line.append(label, document.createTextNode(message.body));
            messages.append(line);
        });
        messages.scrollTop = messages.scrollHeight;
    }

    function open(index) {
        const state = Multiplayer.getPrivateChatState();
        if (!state.started || index === state.myIndex || !state.roster[index]) return;
        active = index;
        unread[index] = false;
        input.value = '';
        error.textContent = '';
        panel.classList.remove('hidden');
        renderButtons();
        renderMessages();
        input.focus();
    }

    function close() {
        const previous = active;
        active = null;
        panel.classList.add('hidden');
        if (previous !== null) $(`private-chat-p${previous + 1}`).focus();
    }

    function reset() {
        generation++;
        active = null;
        conversations = [[], [], [], []];
        unread = [false, false, false, false];
        input.value = '';
        error.textContent = '';
        panel.classList.add('hidden');
        renderButtons();
    }

    function receive(index, body) {
        conversations[index].push({ mine: false, body });
        if (active === index && !panel.classList.contains('hidden')) renderMessages();
        else unread[index] = true;
        renderButtons();
    }

    for (let i = 0; i < 4; i++) {
        $(`private-chat-p${i + 1}`).addEventListener('click', () => open(i));
    }
    $('private-chat-close').addEventListener('click', close);
    panel.addEventListener('keydown', event => { if (event.key === 'Escape') close(); });
    $('private-chat-form').addEventListener('submit', async event => {
        event.preventDefault();
        const body = input.value.trim();
        if (active === null || !body || sending) return;
        const target = active;
        const currentGeneration = generation;
        sending = true;
        $('private-chat-send').disabled = true;
        error.textContent = '';
        try {
            await Multiplayer.sendPrivateMessage(target, body);
            if (generation !== currentGeneration) return;
            conversations[target].push({ mine: true, body });
            if (active === target) {
                if (input.value.trim() === body) input.value = '';
                renderMessages();
            }
        } catch (reason) {
            if (generation === currentGeneration && active === target) {
                error.textContent = `Message not sent: ${reason.message}`;
            } else {
                toast(`Private message not sent: ${reason.message}`);
            }
        } finally {
            sending = false;
            $('private-chat-send').disabled = false;
        }
    });

    return { renderButtons, receive, reset };
})();
