export function getNavigationUrl(lat: number, lng: number, label: string): string {
  const encodedLabel = encodeURIComponent(label);
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/i.test(userAgent);
  // HTTPS map URLs preserve browser gesture trust across Safari, Chrome, PWAs,
  // and desktop browsers. Native app URI schemes are more likely to be blocked,
  // ignored, or lose handoff reliability in web contexts.
  const url = isIOS
    ? `https://maps.apple.com/?q=${encodedLabel}&ll=${lat},${lng}`
    : `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

  console.debug("[HADE NAV URL]", url);

  return url;
}
