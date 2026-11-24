// Run with: node tests/header-toggle.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function element(initialClasses = []) {
    const classes = new Set(initialClasses);
    const attributes = {};
    const listeners = {};
    return {
        classes,
        attributes,
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name)
        },
        setAttribute: (name, value) => { attributes[name] = value; },
        addEventListener: (name, callback) => { listeners[name] = callback; },
        focus() { focused = this; },
        click() { listeners.click(); }
    };
}

let focused;
const header = element();
const hide = element();
const show = element(['hidden']);
const elements = { 'site-header': header, 'btn-hide-header': hide, 'btn-show-header': show };
vm.runInNewContext(fs.readFileSync('js/header-toggle.js', 'utf8'), {
    document: { getElementById: id => elements[id] }
});

hide.click();
assert(header.classes.has('hidden'));
assert(!show.classes.has('hidden'));
assert.equal(hide.attributes['aria-expanded'], 'false');
assert.equal(show.attributes['aria-expanded'], 'false');
assert.equal(focused, show);

show.click();
assert(!header.classes.has('hidden'));
assert(show.classes.has('hidden'));
assert.equal(hide.attributes['aria-expanded'], 'true');
assert.equal(show.attributes['aria-expanded'], 'true');
assert.equal(focused, hide);

const html = fs.readFileSync('PaxNonCerta.html', 'utf8');
assert.match(html, /<header id="site-header">[\s\S]*id="btn-hide-header"[\s\S]*<\/header>\s*<button id="btn-show-header"/);
assert.match(html, /id="btn-show-header"[^>]*aria-controls="site-header" aria-expanded="false"/);
assert.match(html, /<script src="js\/header-toggle\.js"><\/script>/);
const css = fs.readFileSync('styles.css', 'utf8');
assert.match(css, /\.hidden\s*\{\s*display:\s*none\s*!important;/);
assert.match(css, /\.show-header\s*\{[^}]*position:\s*fixed;/);
console.log('Header toggle checks passed.');
