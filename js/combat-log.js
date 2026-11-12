function logRoundHeader(roundNum) {
    const header = document.createElement('div');
    header.className = 'log-round-title';
    header.innerText = `--- Round ${roundNum} Simultaneous Resolution ---`;
    battleLogEl.prepend(header);
}

function logAction(msgHtml) {
    const item = document.createElement('div');
    item.className = 'log-item';
    item.innerHTML = msgHtml;
    battleLogEl.prepend(item);
}
