// Reads whatever Supabase put in the URL and shows one of a few calm states.
// No secrets, no Supabase client, no network calls — by the time this page
// loads, Supabase has already confirmed (or rejected) the link server-side.
// We're just here to say so in plain language and point back to the app.

(() => {
  const params = new URLSearchParams(window.location.search);
  // Supabase's implicit flow puts tokens/errors in the URL fragment instead
  // of the query string.
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));

  const get = (key) => params.get(key) ?? hash.get(key);

  const errorCode = get("error_code");
  const error = get("error");
  const errorDescription = get("error_description");
  const hasToken = Boolean(hash.get("access_token"));
  const hasCode = Boolean(params.get("code"));

  const state = document.getElementById("state");
  const heading = document.getElementById("heading");
  const message = document.getElementById("message");
  const actions = document.getElementById("actions");

  const render = ({ mood, title, body }) => {
    state.dataset.mood = mood;
    heading.textContent = title;
    message.textContent = body;
  };

  if (error || errorDescription) {
    const detail = `${errorCode ?? ""} ${errorDescription ?? ""}`.toLowerCase();
    const expiredOrUsed =
      detail.includes("expired") || detail.includes("already") || detail.includes("used");

    if (expiredOrUsed) {
      render({
        mood: "gentle",
        title: "That link has had its day",
        body:
          "Confirmation links only work once, and only for a little while. No harm done — just open the app and ask for a new one.",
      });
    } else {
      render({
        mood: "gentle",
        title: "That didn't quite work",
        body:
          "Something about this link wasn't right. Head back to the app and try confirming again — your account is still there and still private.",
      });
    }
  } else if (hasToken || hasCode) {
    render({
      mood: "good",
      title: "You're confirmed",
      body:
        "Your email is verified and your journal is still just yours. Head back in whenever you're ready.",
    });
  } else {
    render({
      mood: "neutral",
      title: "Waiting on your link",
      body:
        "Open this page from the confirmation email in your inbox and we'll take it from there.",
    });
  }

  actions.hidden = false;
})();

// "Open Unravel" tries the custom URL scheme first (see mobile/app.json) so
// a phone with Unravel installed jumps straight in. If that doesn't take
// (app not installed, or we're on desktop), we fall back to APP_URL — or,
// while APP_URL is unset, just say so in plain language instead of
// navigating anywhere. Both are defined at the top of config.js.
function openApp() {
  const fallback = window.setTimeout(() => {
    if (APP_URL) {
      window.location.href = APP_URL;
    } else {
      document.getElementById("message").textContent =
        "Open Unravel on your phone to continue.";
    }
  }, 800);

  window.addEventListener(
    "blur",
    () => window.clearTimeout(fallback),
    { once: true },
  );

  window.location.href = APP_SCHEME;
}

