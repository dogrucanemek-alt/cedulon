// The download count is not written into the page by hand. verax-ai.com reads the npm
// counters once a day for every Cedulon package and publishes them at /downloads.json
// (any origin may read it). The page carries a floor that stays true as the count grows,
// and this script replaces it with the latest reading when the feed answers.
(() => {
  const FEED = 'https://verax-ai.com/downloads.json';
  const box = document.querySelector('[data-downloads]');
  if (!box) return;
  const day = /^\d{4}-\d{2}-\d{2}$/;
  const long = (iso, shift) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + shift);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  };
  fetch(FEED, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((feed) => {
      const p = (feed.products || []).find((x) => x.id === 'cedulon');
      if (!p || !Number.isSafeInteger(p.npm) || p.npm < 0 || !day.test(feed.date || '') || !day.test(feed.from || '')) return;
      // The npm count runs from `from` to the day before `date`, the day the counters were read.
      box.querySelector('b').textContent = `${p.npm.toLocaleString('en-US')} downloads`;
      box.querySelector('span').textContent = `Of the Cedulon packages on npm, ${long(feed.from, 0)} to ${long(feed.date, -1)}, CI and mirrors included. Read daily from npm by verax-ai.com.`;
    })
    .catch(() => {});
})();
