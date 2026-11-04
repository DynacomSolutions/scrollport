// Optional: records beforematch events. Pages do not depend on this script.
window.__events = [];
document.addEventListener(
  'beforematch',
  (e) => {
    const el = e.target.closest ? e.target.closest('[data-chunk]') : null
    window.__events.push({ chunk: el ? Number(el.dataset.chunk) : null, t: performance.now() });
  },
  true,
);
