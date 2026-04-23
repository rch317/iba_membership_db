const THEME_STORAGE_KEY = "iba-theme";
let inMemoryTheme = "dark";

function getFeatureFlags() {
  const flags = window.__FEATURE_FLAGS__ || {};
  return {
    themeResetEnabled: flags.themeResetEnabled !== false
  };
}

function isTheme(value) {
  return value === "dark" || value === "light";
}

function getInitialTheme() {
  let stored = null;
  try {
    stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch (_error) {
    stored = inMemoryTheme;
  }
  if (isTheme(stored)) return stored;
  return "dark";
}

function persistTheme(theme) {
  inMemoryTheme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (_error) {
    // Ignore storage write failures (private mode / restricted settings).
  }
}

function clearPersistedTheme() {
  inMemoryTheme = "dark";
  try {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
  } catch (_error) {
    // Ignore storage clear failures.
  }
}

function applyTheme(theme) {
  const root = document.documentElement;
  const body = document.body;
  root.setAttribute("data-theme", theme);
  root.style.colorScheme = theme;
  if (body) {
    body.setAttribute("data-theme", theme);
    body.classList.toggle("theme-light", theme === "light");
    body.classList.toggle("theme-dark", theme === "dark");

    if (theme === "light") {
      body.style.backgroundColor = "#eff6fb";
      body.style.backgroundImage = "radial-gradient(circle at 12% 14%, #d9efff 0, transparent 33%), radial-gradient(circle at 86% 14%, #e7f8ee 0, transparent 37%), linear-gradient(160deg, #eff6fb 0%, #e8f1f7 45%, #dfeaf3 100%)";
    } else {
      body.style.backgroundColor = "#f4f0e6";
      body.style.backgroundImage = "radial-gradient(circle at 10% 15%, #f9e6cc 0, transparent 30%), radial-gradient(circle at 85% 15%, #dbebdc 0, transparent 34%), linear-gradient(160deg, #f4f0e6 0%, #efe7d9 42%, #e7d8bf 100%)";
    }
  }

  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;

  const nextTheme = theme === "dark" ? "light" : "dark";
  const nextLabel = nextTheme === "light" ? "Light" : "Dark";
  toggle.textContent = `Switch to ${nextLabel} Mode`;
  toggle.setAttribute("aria-label", `Switch to ${nextLabel.toLowerCase()} mode`);
  toggle.setAttribute("aria-pressed", String(theme === "light"));
}

(function initializeTheme() {
  const currentTheme = getInitialTheme();
  const featureFlags = getFeatureFlags();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      applyTheme(currentTheme);
    }, { once: true });
  } else {
    applyTheme(currentTheme);
  }

  const toggle = document.getElementById("themeToggle");
  if (!toggle) return;

  toggle.addEventListener("click", () => {
    const active = document.documentElement.getAttribute("data-theme") || "dark";
    const next = active === "dark" ? "light" : "dark";
    persistTheme(next);
    applyTheme(next);
  });

  const resetButtons = document.querySelectorAll('[data-theme-reset="true"]');
  if (!featureFlags.themeResetEnabled) {
    resetButtons.forEach((button) => button.remove());
  } else {
    resetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        clearPersistedTheme();
        applyTheme("dark");
      });
    });
  }
})();
