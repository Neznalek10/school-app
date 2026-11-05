/**
 * Applies app updates on their own, so an installed app never needs a reinstall or a manual check.
 *
 * Responsibility: when the app comes back to the screen, ask the service worker to look for a new version.
 * sw.js activates a new version at once (skipWaiting + clients.claim), which fires `controllerchange`;
 * the page then reloads once so every file comes from the new version, and the next load shows a toast.
 * Invariant: never reload while the user is typing; wait until the app is hidden instead.
 */

/** sessionStorage key holding the version that was running when an update reload started. */
export const UPDATED_FROM_KEY = 'school-update.from';

/**
 * Tells whether the focused element takes text, so a reload now would throw away what is being typed.
 *
 * @param {Element|null} el The document's active element.
 * @returns {boolean} true for inputs, text areas, selects and editable content.
 */
export function isEditing(el) {
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
}

/**
 * Shows the "updated" toast after an update reload, once.
 *
 * @param {Storage} session sessionStorage, which survives the reload in this tab.
 * @param {string} version The version now running.
 * @param {(message: string) => void} toast Shows a short message.
 * @returns {void}
 */
export function announceUpdate(session, version, toast) {
  const from = session.getItem(UPDATED_FROM_KEY);
  if (from === null) return;
  session.removeItem(UPDATED_FROM_KEY);
  if (from !== version) toast(`Updated to version ${version}`);
}

/**
 * Wires the update checks and the reload.
 *
 * @param {object} options
 * @param {ServiceWorkerContainer} options.sw navigator.serviceWorker.
 * @param {Document} options.doc The page's document.
 * @param {Storage} options.session sessionStorage.
 * @param {string} options.version The version now running.
 * @param {() => void} options.reload Reloads the page.
 * @returns {void}
 */
export function watchForUpdates({ sw, doc, session, version, reload }) {
  // The first install also takes control of the page; that is not an update, so it must not reload.
  let controlled = !!sw.controller;
  let pending = false;

  const applyUpdate = () => {
    session.setItem(UPDATED_FROM_KEY, version);
    reload();
  };

  sw.addEventListener('controllerchange', () => {
    if (!controlled) {
      controlled = true;
      return;
    }
    if (isEditing(doc.activeElement)) pending = true;
    else applyUpdate();
  });

  // Phones keep an installed app alive in the background, so "opening" it is usually a return to the screen.
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') {
      if (pending) applyUpdate();
      return;
    }
    sw.getRegistration().then(reg => reg?.update()).catch(() => {});
  });
}
