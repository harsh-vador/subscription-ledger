import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

// Claude artifacts provide `window.storage` for persistence. Outside that
// environment (e.g. running this as a standalone site) we shim the same
// tiny API on top of localStorage so the app works unmodified either way.
if (!window.storage) {
  window.storage = {
    async get(key) {
      const raw = localStorage.getItem(key);
      return raw !== null ? { key, value: raw, shared: false } : null;
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return { key, value, shared: false };
    },
    async delete(key) {
      localStorage.removeItem(key);
      return { key, deleted: true, shared: false };
    },
    async list(prefix) {
      const keys = Object.keys(localStorage).filter((k) => !prefix || k.startsWith(prefix));
      return { keys };
    },
  };
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
