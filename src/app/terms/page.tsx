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

const FileIcon = () => (
  <svg
    className="w-5 h-5 text-slate-400 shrink-0"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
  </svg>
);

const LockIcon = () => (
  <svg
    className="w-3.5 h-3.5 text-amber-500 shrink-0"
    fill="currentColor"
    viewBox="0 0 20 20"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
  </svg>
);

export default function AdminPanel() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [folders, setFolders] = useState<FileRecord[]>([]);
  const [lockItem, setLockItem] = useState<{ id: string, name: string } | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [alertModal, setAlertModal] = useState<{ title: string; message: string; isError?: boolean } | null>(null);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Close menus on click outside
  useEffect(() => {
    const handleOutsideClick = () => {
      setActiveMenuId(null);
    };
    window.addEventListener("click", handleOutsideClick);
    return () => {
      window.removeEventListener("click", handleOutsideClick);
    };
  }, []);

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput === process.env.NEXT_PUBLIC_ADMIN_PIN) {
      setIsAuthenticated(true);
      fetchFolders();
    } else {
      setAlertModal({ title: "Access Denied", message: "The PIN you entered is incorrect. Please try again.", isError: true });
      setPinInput("");
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch("/api/files");
      if (res.ok) {
        const data: FileRecord[] = await res.json();
        setFolders(data);
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
      setAlertModal({ title: "Operation Failed", message: "Failed to set the password. Please try again.", isError: true });
    }
  };

  const handleRemovePassword = async (id: string) => {
    if (!confirm("Are you sure you want to remove the password for this item?")) return;
    try {
      const res = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, password: "" }),
      });
      if (!res.ok) throw new Error("Remove password failed");
      fetchFolders();
    } catch (error) {
      console.error("Remove password failed:", error);
      setAlertModal({ title: "Operation Failed", message: "Failed to remove the password. Please try again.", isError: true });
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

        <section className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Folders Column */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <FolderIcon />
                <span>Folders</span>
              </h2>
              <div className="min-h-[200px] overflow-visible">
                {folders.filter(f => f.mime_type === "application/x-directory").length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-sm font-medium bg-white rounded-2xl border border-slate-200">
                    No folders found.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {folders
                      .filter(f => f.mime_type === "application/x-directory")
                      .map((folder) => (
                        <div
                          key={folder.id}
                          className="flex items-center justify-between p-3.5 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-all duration-200 relative group shadow-sm"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <FolderIcon />
                            <span className="font-sans font-semibold text-sm text-slate-800 truncate" title={folder.name}>
                              {folder.name}
                            </span>
                            {folder.password && <LockIcon />}
                          </div>

                          <div className="relative shrink-0 flex items-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(activeMenuId === folder.id ? null : folder.id);
                              }}
                              className="p-1.5 hover:bg-slate-200/80 rounded-full transition-colors cursor-pointer text-slate-500 hover:text-slate-800 shrink-0"
                              title="More Actions"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                              </svg>
                            </button>

                            {activeMenuId === folder.id && (
                              <div 
                                className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-200/80 p-1 flex flex-col gap-0.5 z-30 animate-in fade-in slide-in-from-top-2 duration-150"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => {
                                    handleLockAction(folder.id, folder.name);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
                                >
                                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                  <span>{folder.password ? "Change Password" : "Set Password"}</span>
                                </button>

                                {folder.password && (
                                  <button
                                    onClick={() => {
                                      handleRemovePassword(folder.id);
                                      setActiveMenuId(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
                                  >
                                    <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    <span>Remove Password</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>

            {/* Files Column */}
            <div className="space-y-4">
              <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                <FileIcon />
                <span>Files</span>
              </h2>
              <div className="min-h-[200px] overflow-visible">
                {folders.filter(f => f.mime_type !== "application/x-directory").length === 0 ? (
                  <div className="p-12 text-center text-slate-400 text-sm font-medium bg-white rounded-2xl border border-slate-200">
                    No files found.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {folders
                      .filter(f => f.mime_type !== "application/x-directory")
                      .map((file) => (
                        <div
                          key={file.id}
                          className="flex items-center justify-between p-3.5 bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 rounded-xl transition-all duration-200 relative group shadow-sm"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            <FileIcon />
                            <span className="font-sans font-semibold text-sm text-slate-800 truncate" title={file.name}>
                              {file.name}
                            </span>
                            {file.password && <LockIcon />}
                          </div>

                          <div className="relative shrink-0 flex items-center">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveMenuId(activeMenuId === file.id ? null : file.id);
                              }}
                              className="p-1.5 hover:bg-slate-200/80 rounded-full transition-colors cursor-pointer text-slate-500 hover:text-slate-800 shrink-0"
                              title="More Actions"
                            >
                              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                              </svg>
                            </button>

                            {activeMenuId === file.id && (
                              <div 
                                className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl shadow-lg border border-slate-200/80 p-1 flex flex-col gap-0.5 z-30 animate-in fade-in slide-in-from-top-2 duration-150"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <button
                                  onClick={() => {
                                    handleLockAction(file.id, file.name);
                                    setActiveMenuId(null);
                                  }}
                                  className="w-full text-left px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
                                >
                                  <svg className="w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                  </svg>
                                  <span>{file.password ? "Change Password" : "Set Password"}</span>
                                </button>

                                {file.password && (
                                  <button
                                    onClick={() => {
                                      handleRemovePassword(file.id);
                                      setActiveMenuId(null);
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer flex items-center gap-2"
                                  >
                                    <svg className="w-3.5 h-3.5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                    <span>Remove Password</span>
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </div>
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
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#9cb4d4] font-mono text-sm"
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
                  className="bg-[#9cb4d4] hover:bg-white hover:text-[#9cb4d4] border border-[#9cb4d4] text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- CUSTOM ALERT MODAL --- */}
      {alertModal && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-opacity"
          onClick={() => setAlertModal(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`flex items-center justify-between p-4 border-b ${alertModal.isError ? 'border-red-100 bg-[#fff5f5]' : 'border-slate-100 bg-slate-50'}`}>
              <h3 className={`font-mono font-bold ${alertModal.isError ? 'text-[#cf6d6d]' : 'text-slate-800'}`}>
                {alertModal.title}
              </h3>
              <button
                onClick={() => setAlertModal(null)}
                className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-md text-sm font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 font-medium whitespace-pre-line leading-relaxed">{alertModal.message}</p>
              <div className="flex justify-end pt-2">
                <button
                  onClick={() => setAlertModal(null)}
                  className={`text-xs font-bold py-2 px-5 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer ${
                    alertModal.isError 
                      ? 'bg-[#e29393] text-red-700 border border-[#e29393] hover:bg-[#cf6d6d] hover:text-white hover:border-[#cf6d6d]' 
                      : 'bg-[#9cb4d4] hover:bg-white hover:text-[#9cb4d4] border border-[#9cb4d4] text-white'
                  }`}
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
