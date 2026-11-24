// Browser acceptance can connect only to the existing loopback CDP service.
// A discovered debugger URL must not supply an authority, query or path suffix.
export function localDebuggerEndpoint(value) {
  const url = new URL(value);
  if (url.protocol !== "ws:" || url.hostname !== "127.0.0.1" ||
      url.port !== "9334" || url.username || url.password || url.search || url.hash) {
    throw new Error("Only the local CDP endpoint is allowed");
  }
  const parts = /^\/devtools\/(browser|page)\/([A-Za-z0-9-]+)$/.exec(url.pathname);
  if (!parts) throw new Error("Invalid local CDP target");
  const kind = parts[1] === "browser" ? "browser" : "page";
  const id = encodeURIComponent(parts[2]);
  const endpoint = new URL("ws://127.0.0.1:9334");
  endpoint.pathname = "/devtools/" + kind + "/" + id;
  return endpoint.toString();
}
