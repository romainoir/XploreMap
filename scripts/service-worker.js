export async function waitForSWReady() {
  if (!('serviceWorker' in navigator)) return;
  try {
    await navigator.serviceWorker.register('./sw.js', { scope: './' });
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    location.reload();
    await new Promise(() => {});
  }
}
