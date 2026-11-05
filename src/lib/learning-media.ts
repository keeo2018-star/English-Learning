// Video and pronunciation keep their own players, but share audio ownership.
const videoPausers = new Set<() => void>();
export function registerContextVideo(pause: () => void) {
  videoPausers.add(pause);
  return () => { videoPausers.delete(pause); };
}
export function pauseContextVideos() {
  videoPausers.forEach(pause => pause());
}
