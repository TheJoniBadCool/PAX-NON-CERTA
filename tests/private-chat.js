// Run with: node tests/private-chat.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('PaxNonCerta.html', 'utf8');
const css = fs.readFileSync('styles.css', 'utf8');
for (let player = 1; player <= 4; player++) {
    assert.match(html, new RegExp(`<span class="player-actions"><button type="button" id="private-chat-p${player}"[^]*?<svg[^]*?</svg></button><span id="diplomacy-actions-p${player}"[^]*?</span></span>`));
}
assert.match(css, /\.diplomacy-button,\s*\.private-chat-button\s*\{[^}]*min-width:\s*1\.8rem;[^}]*min-height:\s*1\.8rem;/);
assert.match(css, /\.player-actions\s*\{[^}]*display:\s*flex;[^}]*flex:\s*0 0 auto;[^}]*gap:\s*0\.3rem;/);

function element() {
    const classes = new Set();
    return {
        handlers: {}, children: [], value: '', textContent: '', disabled: false,
        classList: {
            add: value => classes.add(value),
            remove: value => classes.delete(value),
            contains: value => classes.has(value),
            toggle: (value, force) => force ? classes.add(value) : classes.delete(value)
        },
        addEventListener(event, handler) { this.handlers[event] = handler; },
        setAttribute(name, value) { this[name] = value; },
        replaceChildren() { this.children = []; },
        append(...nodes) { this.children.push(...nodes); },
        focus() { this.focused = true; }
    };
}
const elements = new Map();
const document = {
    getElementById(id) {
        if (!elements.has(id)) elements.set(id, element());
        return elements.get(id);
    },
    createElement: element,
    createTextNode: text => ({ textContent: text })
};
const state = { started: true, myIndex: 0, roster: [{}, {}, {}, null] };
let shouldFail = false;
const sent = [];
const context = {
    document,
    gameState: { multiplayer: true },
    PLAYERS: [{ name: 'Host' }, { name: 'Alice' }, { name: 'Bob' }, { name: 'Unused' }],
    Multiplayer: {
        getPrivateChatState: () => state,
        async sendPrivateMessage(index, body) {
            if (shouldFail) throw new Error('offline');
            sent.push({ index, body });
        }
    },
    toast: message => { throw new Error(message); }
};
vm.createContext(context);
vm.runInContext(fs.readFileSync('js/private-chat.js', 'utf8') + '\nglobalThis.chat = PrivateChat;', context);
const chat = context.chat;
const get = id => document.getElementById(id);

async function run() {
    chat.renderButtons();
    assert(get('private-chat-p1').classList.contains('hidden'));
    assert(!get('private-chat-p2').classList.contains('hidden'));
    assert(get('private-chat-p4').classList.contains('hidden'));
    chat.receive(1, '<img src=x>');
    assert(get('private-chat-p2').classList.contains('private-chat-unread'));
    assert.match(get('private-chat-p2')['aria-label'], /unread/);
    get('private-chat-p2').handlers.click();
    assert(!get('private-chat-p2').classList.contains('private-chat-unread'));
    assert.equal(get('private-chat-messages').children[0].children[1].textContent, '<img src=x>');
    chat.receive(1, 'open');
    assert(!get('private-chat-p2').classList.contains('private-chat-unread'));
    chat.receive(2, 'other');
    assert(get('private-chat-p3').classList.contains('private-chat-unread'));
    get('private-chat-input').value = ' hello ';
    await get('private-chat-form').handlers.submit({ preventDefault() {} });
    assert.deepEqual(sent, [{ index: 1, body: 'hello' }]);
    assert.equal(get('private-chat-input').value, '');
    shouldFail = true;
    get('private-chat-input').value = 'retry';
    await get('private-chat-form').handlers.submit({ preventDefault() {} });
    assert.equal(get('private-chat-input').value, 'retry');
    assert.match(get('private-chat-error').textContent, /offline/);
    get('private-chat-close').handlers.click();
    chat.receive(1, 'closed');
    assert(get('private-chat-p2').classList.contains('private-chat-unread'));
    chat.reset();
    assert(get('private-chat').classList.contains('hidden'));
    assert(!get('private-chat-p2').classList.contains('private-chat-unread'));
    assert(!get('private-chat-p3').classList.contains('private-chat-unread'));
    context.gameState.multiplayer = false;
    chat.renderButtons();
    assert(get('private-chat-p2').classList.contains('hidden'));
    console.log('Private chat UI tests passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
