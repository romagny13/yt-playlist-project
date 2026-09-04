export function computeJsApiSrc(currentSrc, origin) {
  const url = new URL(currentSrc);
  if (
    !url.searchParams.get("enablejsapi") ||
    url.searchParams.get("origin") !== origin
  ) {
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("origin", origin);
    return url.toString();
  }
  return currentSrc;
}

export function ensureIframeHasJsApiEnabled(iframe) {
  iframe.setAttribute("data-original-src", iframe.src);
  const newSrc = computeJsApiSrc(iframe.src, location.origin);
  if (newSrc !== iframe.src) iframe.src = newSrc;
}

export function subscribeToPlayer(iframe) {
  iframe.contentWindow?.postMessage(
    JSON.stringify({ event: "listening" }),
    "*"
  );
}

export function sendPlayVideoAt(iframe, index) {
  iframe.contentWindow?.postMessage(
    JSON.stringify({ event: "command", func: "playVideoAt", args: [index] }),
    "*"
  );
}

export function normalizeStartIndex(startIndex) {
  return startIndex > 0 ? startIndex - 1 : 0;
}
