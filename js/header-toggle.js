const siteHeader = document.getElementById('site-header');
const btnHideHeader = document.getElementById('btn-hide-header');
const btnShowHeader = document.getElementById('btn-show-header');

btnHideHeader.addEventListener('click', () => {
    siteHeader.classList.add('hidden');
    btnHideHeader.setAttribute('aria-expanded', 'false');
    btnShowHeader.setAttribute('aria-expanded', 'false');
    btnShowHeader.classList.remove('hidden');
    btnShowHeader.focus();
});

btnShowHeader.addEventListener('click', () => {
    siteHeader.classList.remove('hidden');
    btnHideHeader.setAttribute('aria-expanded', 'true');
    btnShowHeader.setAttribute('aria-expanded', 'true');
    btnShowHeader.classList.add('hidden');
    btnHideHeader.focus();
});
