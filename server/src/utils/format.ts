export function formatDateTime(d: Date | string) {
  const date = new Date(d);
  const day = date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
  const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day}, ${time}`;
}
