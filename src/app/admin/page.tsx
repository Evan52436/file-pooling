"use client";

import { useState, useEffect } from "react";

interface FileRecord {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  storage_key: string;
  parent_folder: string;
  created_at: string;
  password?: string;
}

const FolderIcon = () => (
  <svg
    className="w-5 h-5 text-[#9cb4d4] shrink-0"
    fill="currentColor"
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
  </svg>
);

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [folders, setFolders] = useState<FileRecord[]>([]);
  const [lockItem, setLockItem] = useState<{ id: string, name: string } | null>(null);
  const [passwordInput, setPasswordInput] = useState("");

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === "161112") {
      setIsAuthenticated(true);
      fetchFolders();
    } else {
      alert("Incorrect PIN");
      setPinInput("");
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch("/api/files");
      if (res.ok) {
        const data: FileRecord[] = await res.json();
        setFolders(data.filter((f) => f.mime_type === "application/x-directory"));
      }
    } catch (err) {
      console.error("Error fetching folders:", err);
    }
  };

  const handleLockAction = (id: string, name: string) => {
    setLockItem({ id, name });
    setPasswordInput("");
  };

  const handleLockSubmit = async () => {
    if (!lockItem) return;
    try {
      const res = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: lockItem.id, password: passwordInput.trim() }),
      });
      if (!res.ok) throw new Error("Lock failed");
      setLockItem(null);
      setPasswordInput("");
      fetchFolders();
    } catch (error) {
      console.error("Lock failed:", error);
      alert("Failed to set password.");
    }
  };

  if (!isAuthenticated) {
    return (
      <main className="min-h-screen bg-[#f0f4f8] text-slate-900 flex items-center justify-center p-8 font-sans selection:bg-[#9cb4d4] selection:text-white">
        <form 
          onSubmit={handlePinSubmit}
          className="bg-white shadow-sm border border-slate-200 rounded-2xl p-8 max-w-sm w-full space-y-6 text-center"
        >
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Admin Login</h1>
          <p className="text-sm text-slate-500">Please enter your PIN to access the password management panel.</p>
          <input
            type="password"
            placeholder="PIN"
            value={pinInput}
            onChange={(e) => setPinInput(e.target.value)}
            className="w-full px-4 py-3 text-center border border-slate-200 rounded-lg focus:outline-none focus:border-[#9cb4d4] font-mono text-lg tracking-[0.3em]"
            autoFocus
          />
          <button
            type="submit"
            className="w-full bg-[#9cb4d4] border border-[#9cb4d4] text-white hover:bg-white hover:text-[#9cb4d4] active:bg-white active:text-[#9cb4d4] font-bold py-3 px-4 rounded-lg transition-colors shadow-sm cursor-pointer"
          >
            Access Panel
          </button>
        </form>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f0f4f8] text-slate-900 p-8 font-sans selection:bg-[#9cb4d4] selection:text-white">
      <div className="max-w-4xl mx-auto space-y-8 mt-12 relative">
        <header className="border-b border-slate-200 pb-6 flex items-center justify-between">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Admin Panel</h1>
          <a
            href="/"
            className="bg-white border border-slate-300 text-slate-500 hover:bg-slate-50 hover:text-slate-700 hover:border-slate-400 text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 flex items-center gap-1 cursor-pointer"
          >
            ← Back to Dashboard
          </a>
        </header>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Folder Password Management</h2>
          <div className="bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
            {folders.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm font-medium">
                No folders found.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {folders.map((folder) => (
                  <li
                    key={folder.id}
                    className="p-5 flex items-center justify-between text-sm hover:bg-slate-50 transition-colors duration-200 group"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0 pr-6">
                      <FolderIcon />
                      <p className="font-mono font-bold text-base text-slate-800 truncate">
                        {folder.name}
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      {folder.password ? (
                        <span className="text-xs font-bold text-[#eab308] bg-[#fefce8] px-2 py-1 rounded border border-[#fef08a] mr-2">
                          Locked
                        </span>
                      ) : (
                        <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded border border-slate-200 mr-2">
                          Unlocked
                        </span>
                      )}
                      
                      <button
                        onClick={() => handleLockAction(folder.id, folder.name)}
                        className="bg-white border border-[#eab308] text-[#eab308] hover:!bg-[#eab308] hover:!text-white hover:!border-[#eab308] active:!bg-[#eab308] active:!text-white active:!border-[#eab308] text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
                      >
                        {folder.password ? "Change Password" : "Set Password"}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* --- LOCK FOLDER MODAL --- */}
      {lockItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-opacity"
          onClick={() => setLockItem(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-mono font-bold text-slate-800">Set Password for "{lockItem.name}"</h3>
              <button
                onClick={() => setLockItem(null)}
                className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-md text-sm font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4">
              <input
                type="password"
                placeholder="Enter new password (leave blank to remove)"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#eab308] font-mono text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleLockSubmit();
                  }
                }}
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setLockItem(null)}
                  className="bg-white border border-slate-200 text-slate-500 text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLockSubmit}
                  className="bg-[#eab308] hover:bg-white hover:text-[#eab308] border border-[#eab308] text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
