import React, { useEffect, useState } from "react";

// BookmarkletHub
// Single-file React app (default export) using Tailwind classes.
// Features:
// - Add bookmarklets (name, description, JS code)
// - Generate installable bookmarklet link
// - Save bookmarklets to localStorage
// - Shareable permalinks (encoded in URL hash)
// - Search, import/export JSON, delete, edit
// - Responsive, simple UI

// Usage notes for embedding into a project:
// - This component is a complete page. Drop it into a React app and render it.
// - Tailwind classes are used; if you don't have Tailwind, change classes or include Tailwind.

const STORAGE_KEY = "bookmarklethub_bookmarklets_v1";

function encodeBookmarkletPayload(payload) {
  // payload is an object -> JSON -> base64url
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeBookmarkletPayload(token) {
  try {
    const padded = token + "=="; // forgiving
    const b = padded.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(escape(atob(b)));
    return JSON.parse(json);
  } catch (e) {
    return null;
  }
}

function normalizeCode(code) {
  // Remove surrounding ``` if present and trim
  let c = code.trim();
  if (c.startsWith("````")) c = c.replace(/```(?:js|javascript)?/g, "");
  if (c.startsWith("```)")) c = c.replace(/```(?:js|javascript)?/g, "");
  if (c.startsWith("``")) c = c.replace(/```(?:js|javascript)?/g, "");
  if (c.startsWith("javascript:")) return c;
  // If it's a function or code not starting with javascript:, wrap
  // We try to minify whitespace lightly
  c = c.replace(/^\s+|\s+$/g, "");
  return "javascript:(function(){try{\n" + c + "\n}catch(e){alert('Bookmarklet error: '+e);}})();";
}

export default function BookmarkletHub() {
  const [bookmarklets, setBookmarklets] = useState([]);
  const [query, setQuery] = useState("");
  const [form, setForm] = useState({ name: "", description: "", code: "" });
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        setBookmarklets(JSON.parse(raw));
      } catch (e) {
        setBookmarklets([]);
      }
    }

    // If URL hash contains an encoded bookmarklet, offer to import
    const hash = window.location.hash.slice(1);
    if (hash) {
      const payload = decodeBookmarkletPayload(hash);
      if (payload && payload.name && payload.code) {
        setMessage({ type: "info", text: `Found share link for \"${payload.name}\" — you can import it.` });
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarklets));
  }, [bookmarklets]);

  function saveForm() {
    if (!form.name.trim() || !form.code.trim()) {
      setMessage({ type: "error", text: "Name and code are required." });
      return;
    }

    const normalized = normalizeCode(form.code);
    if (editingId) {
      setBookmarklets((prev) => prev.map((b) => (b.id === editingId ? { ...b, name: form.name, description: form.description, code: normalized, updatedAt: Date.now() } : b)));
      setEditingId(null);
    } else {
      const newItem = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
        name: form.name,
        description: form.description,
        code: normalized,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      setBookmarklets((prev) => [newItem, ...prev]);
    }
    setForm({ name: "", description: "", code: "" });
    setMessage({ type: "success", text: "Saved." });
  }

  function editItem(item) {
    setEditingId(item.id);
    setForm({ name: item.name, description: item.description || "", code: item.code });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function deleteItem(id) {
    if (!confirm("Delete this bookmarklet?")) return;
    setBookmarklets((prev) => prev.filter((b) => b.id !== id));
  }

  function generateShareLink(item) {
    const token = encodeBookmarkletPayload({ name: item.name, description: item.description, code: item.code });
    const url = `${window.location.origin}${window.location.pathname}#${token}`;
    return url;
  }

  function installHref(code) {
    // code should already start with javascript:
    return code;
  }

  function importFromHash() {
    const hash = window.location.hash.slice(1);
    if (!hash) return setMessage({ type: "error", text: "No share token in URL." });
    const payload = decodeBookmarkletPayload(hash);
    if (!payload) return setMessage({ type: "error", text: "Invalid token." });
    const newItem = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      name: payload.name,
      description: payload.description || "",
      code: payload.code,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setBookmarklets((prev) => [newItem, ...prev]);
    window.location.hash = "";
    setMessage({ type: "success", text: `Imported \"${payload.name}\"` });
  }

  function exportAll() {
    const dataStr = JSON.stringify(bookmarklets, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bookmarklets.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result);
        if (!Array.isArray(parsed)) throw new Error("Not an array");
        // normalize items
        const normalized = parsed.map((p) => ({
          id: p.id || Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
          name: p.name || "Untitled",
          description: p.description || "",
          code: normalizeCode(p.code || ""),
          createdAt: p.createdAt || Date.now(),
          updatedAt: p.updatedAt || Date.now(),
        }));
        setBookmarklets((prev) => [...normalized, ...prev]);
        setMessage({ type: "success", text: `Imported ${normalized.length} bookmarklets.` });
      } catch (err) {
        setMessage({ type: "error", text: "Failed to import JSON." });
      }
    };
    reader.readAsText(file);
  }

  const filtered = bookmarklets.filter((b) => (b.name + " " + (b.description || "")).toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-6">
          <h1 className="text-3xl font-extrabold mb-1">BookmarkletHub</h1>
          <p className="text-sm text-gray-600">Upload, share, and install bookmarklets — like YouTube but for tiny scripts.</p>
        </header>

        {/* Message */}
        {message && (
          <div className={`p-3 rounded mb-4 ${message.type === "error" ? "bg-red-100 text-red-800" : message.type === "success" ? "bg-green-100 text-green-800" : "bg-blue-100 text-blue-800"}`}>
            {message.text}
            <button className="ml-4 text-sm underline" onClick={() => setMessage(null)}>
              dismiss
            </button>
          </div>
        )}

        {/* Form */}
        <div className="bg-white p-4 rounded shadow">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium">Name</label>
              <input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} className="mt-1 block w-full rounded border p-2" placeholder="My super bookmarklet" />

              <label className="block text-sm font-medium mt-3">Description</label>
              <textarea value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} className="mt-1 block w-full rounded border p-2" rows={3} placeholder="What it does, usage notes..." />
            </div>

            <div>
              <label className="block text-sm font-medium">JavaScript (paste code)</label>
              <textarea value={form.code} onChange={(e) => setForm((s) => ({ ...s, code: e.target.value }))} className="mt-1 block w-full rounded border p-2 h-40" placeholder="Paste raw JS or a full javascript:... bookmarklet" />

              <div className="mt-3 flex gap-2">
                <button onClick={saveForm} className="px-3 py-2 rounded bg-sky-600 text-white">{editingId ? "Update" : "Add"}</button>
                {editingId && <button onClick={() => { setEditingId(null); setForm({ name: "", description: "", code: "" }); }} className="px-3 py-2 rounded border">Cancel</button>}
              </div>
            </div>
          </div>
        </div>

        {/* Utilities */}
        <div className="mt-4 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
          <div className="flex gap-2 w-full md:w-auto">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search bookmarklets..." className="rounded border px-3 py-2 w-full md:w-64" />
            <button onClick={() => { setQuery(""); }} className="px-3 py-2 rounded border">Clear</button>
          </div>

          <div className="flex gap-2">
            <button onClick={() => exportAll()} className="px-3 py-2 rounded border">Export JSON</button>
            <label className="px-3 py-2 rounded border cursor-pointer">
              Import JSON
              <input type="file" accept="application/json" className="hidden" onChange={(e) => importJSON(e.target.files[0])} />
            </label>
            <button onClick={importFromHash} className="px-3 py-2 rounded border">Import from URL</button>
          </div>
        </div>

        {/* List */}
        <div className="mt-4 grid gap-3">
          {filtered.length === 0 && (
            <div className="text-center p-8 bg-white rounded shadow">No bookmarklets found.</div>
          )}

          {filtered.map((b) => (
            <div key={b.id} className="bg-white p-4 rounded shadow flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <div className="flex items-baseline gap-3">
                  <h3 className="text-lg font-semibold">{b.name}</h3>
                  <span className="text-sm text-gray-500">{new Date(b.updatedAt).toLocaleString()}</span>
                </div>
                {b.description && <p className="text-sm text-gray-700 mt-1">{b.description}</p>}
              </div>

              <div className="flex gap-2 items-center">
                <a href={installHref(b.code)} title="Drag this to your bookmarks bar or right-click and bookmark this link" className="px-3 py-2 rounded border inline-block text-sm">Install</a>
                <button onClick={() => { navigator.clipboard.writeText(generateShareLink(b)); setMessage({ type: "success", text: "Share link copied to clipboard." }); }} className="px-3 py-2 rounded border">Copy share link</button>
                <button onClick={() => { navigator.clipboard.writeText(b.code); setMessage({ type: "success", text: "Raw code copied to clipboard." }); }} className="px-3 py-2 rounded border">Copy code</button>
                <button onClick={() => editItem(b)} className="px-3 py-2 rounded border">Edit</button>
                <button onClick={() => deleteItem(b.id)} className="px-3 py-2 rounded border text-red-600">Delete</button>
              </div>
            </div>
          ))}
        </div>

        <footer className="mt-8 text-center text-sm text-gray-500">Built with ❤️ — BookmarkletHub local demo. Consider adding a server for public hosting, moderation, and persistence.</footer>
      </div>
    </div>
  );
}
