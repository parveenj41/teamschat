// Base URL is empty because the frontend is served by the same Express server as the API.
// If you ever host the frontend separately, set this to your backend's full URL instead.
const API_BASE = '';

async function apiRequest(path, { method = 'GET', body, auth = false } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const token = localStorage.getItem('tc_token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  // A 401 on an authenticated request means the token is missing/expired/invalid.
  // Previously this just surfaced as a generic "Something went wrong" alert and
  // left the user stuck on a dead session - now it clears the session and sends
  // them back to log in, same as a normal session timeout would.
  if (res.status === 401 && auth) {
    clearSession();
    window.location.href = 'index.html?sessionExpired=1';
    throw new Error('Session expired');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Something went wrong');
  }
  return data;
}

function saveSession(token, user) {
  localStorage.setItem('tc_token', token);
  localStorage.setItem('tc_user', JSON.stringify(user));
}

function getSession() {
  const token = localStorage.getItem('tc_token');
  const userRaw = localStorage.getItem('tc_user');
  if (!token || !userRaw) return null;
  try {
    return { token, user: JSON.parse(userRaw) };
  } catch {
    return null;
  }
}

function clearSession() {
  localStorage.removeItem('tc_token');
  localStorage.removeItem('tc_user');
}

function requireAuthOrRedirect() {
  const session = getSession();
  if (!session) {
    window.location.href = 'index.html';
    return null;
  }
  return session;
}
