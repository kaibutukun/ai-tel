export function getDevCallWsUrl() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
  const apiUrl = new URL(apiBase);
  const basePath = apiUrl.pathname.replace(/\/api\/?$/, "");
  apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  apiUrl.pathname = `${basePath}/dev-call/media-stream`.replace(/\/{2,}/g, "/");
  apiUrl.search = "";
  return apiUrl.toString();
}
