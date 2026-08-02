export function readTokenFromStorage(): string {
  const candidates = ["session_active_session", "session_token", "active_session", "session"];
  for (const key of candidates) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (typeof parsed?.token === "string" && parsed.token.length > 0) return parsed.token;
    } catch {
      continue;
    }
  }
  return "";
}

export const CLEAN_SESSION_SCRIPT = `
  try {
    const raw = localStorage.getItem("session_active_session");
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      const ok = parsed && typeof parsed === "object" && typeof parsed.token === "string" && parsed.token.length > 0;
      if (!ok) localStorage.removeItem("session_active_session");
    }
  } catch { localStorage.removeItem("session_active_session"); }
  try { localStorage.removeItem("session_active_session_clear_info"); } catch {}
`;
