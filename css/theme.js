document.addEventListener('DOMContentLoaded', () => {
  const btn = document.querySelector('#theme-toggle');
  if (!btn) return;

  function sync() {
    const cur = document.documentElement.getAttribute('data-theme');
    btn.setAttribute('aria-pressed', cur === 'dark' ? 'true' : 'false');
    btn.textContent = cur === 'dark' ? 'Light' : 'Dark';
  }

  sync();

  btn.addEventListener('click', () => {
    const cur = document.documentElement.getAttribute('data-theme');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    sync();
  });
});
