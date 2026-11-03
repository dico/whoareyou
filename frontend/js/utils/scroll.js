/**
 * Re-render a page section without losing the reader's place.
 *
 * Reloads that replace a list's innerHTML briefly collapse the page, so the
 * browser clamps the scroll position to the top. Use this for background
 * refreshes (e.g. after a modal saved something) — never for navigation.
 *
 * @param {() => Promise<void>} reload — async function that re-renders
 */
export async function reloadKeepingScroll(reload) {
  const y = window.scrollY;
  const main = document.getElementById('app-content');
  // Hold the current height while the list is empty so the page can't shrink
  if (main) main.style.minHeight = `${main.offsetHeight}px`;
  try {
    await reload();
  } finally {
    if (main) main.style.minHeight = '';
    window.scrollTo(0, y);
  }
}
