// File: src/app/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";

// UUID to URL-friendly base64 encoding helpers
function uuidToShortId(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  if (hex.length !== 32) return uuid;

  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
  }

  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const base64 = btoa(binary);
  
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function shortIdToUuid(shortId: string): string {
  if (shortId.length !== 22) return shortId;

  let base64 = shortId.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4) {
    base64 += "=";
  }

  try {
    const binary = atob(base64);
    let hex = "";
    for (let i = 0; i < binary.length; i++) {
      const h = binary.charCodeAt(i).toString(16);
      hex += h.length === 1 ? "0" + h : h;
    }
    if (hex.length !== 32) return shortId;

    return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20, 32)}`;
  } catch (e) {
    return shortId;
  }
}

interface FilenameDisplayProps {
  name: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  icon: React.ReactNode;
}

function FilenameDisplay({ name, isExpanded, onToggleExpand, icon }: FilenameDisplayProps) {
  const textRef = useRef<HTMLParagraphElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  const checkOverflow = () => {
    const el = textRef.current;
    if (el) {
      const originalStyle = el.style.cssText;
      el.style.whiteSpace = "nowrap";
      el.style.overflow = "hidden";
      el.style.textOverflow = "ellipsis";
      
      const overflowing = el.scrollWidth > el.clientWidth;
      el.style.cssText = originalStyle;
      setIsOverflowing(overflowing);
    }
  };

  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      checkOverflow();
    });

    window.addEventListener("resize", checkOverflow);
    return () => {
      cancelAnimationFrame(handle);
      window.removeEventListener("resize", checkOverflow);
    };
  }, [name]);

  useEffect(() => {
    checkOverflow();
  }, [isExpanded]);

  return (
    <div className="flex items-start gap-2">
      <span className="mt-1 shrink-0">
        {icon}
      </span>
      <div className="flex items-center gap-1.5 flex-1 min-w-0">
        <p
          ref={textRef}
          className={`font-mono font-bold text-base text-slate-800 group-hover:text-[#9cb4d4] transition-all duration-200 ${
            isExpanded ? "whitespace-normal break-all" : "truncate"
          }`}
        >
          {name}
        </p>
        {isOverflowing && (
          <span 
            className="p-1 hover:bg-slate-100 rounded-md transition-colors shrink-0 cursor-pointer select-none"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
            title="Click to toggle full name"
          >
            <svg
              className={`w-3.5 h-3.5 text-slate-400 group-hover:text-[#9cb4d4] transition-transform duration-200 ${
                isExpanded ? "rotate-180 text-[#9cb4d4]" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
            </svg>
          </span>
        )}
      </div>
    </div>
  );
}

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

// Added 'previewable' flag to the state interface
interface PreviewState {
  url: string;
  type: string;
  name: string;
  previewable: boolean;
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

export default function DriveDashboard() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const [previewData, setPreviewData] = useState<PreviewState | null>(null);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [currentFolderId, setCurrentFolderId] = useState<string>("/");

  const [deleteItem, setDeleteItem] = useState<{ id: string, storageKey: string, name: string } | null>(null);
  const [renameItem, setRenameItem] = useState<{ id: string, name: string } | null>(null);
  const [newName, setNewName] = useState("");
  const [lockItem, setLockItem] = useState<{ id: string, name: string } | null>(null);
  const [unlockItem, setUnlockItem] = useState<{ id: string, name: string, action: "open" | "download", correctPassword?: string } | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  const fetchFiles = async () => {
    try {
      const res = await fetch("/api/files"); 
      if (res.ok) {
        const data = await res.json();
        setFiles(data);
      }
    } catch (err) {
      console.error("Error updating files list view:", err);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchFiles();

    // Read initial URL
    const params = new URLSearchParams(window.location.search);
    const folder = params.get("folder");
    if (folder) {
      setCurrentFolderId(shortIdToUuid(folder));
    }

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      setCurrentFolderId(shortIdToUuid(params.get("folder") || "/"));
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigateToFolder = (id: string) => {
    const newUrl = id === "/" ? window.location.pathname : `?folder=${uuidToShortId(id)}`;
    window.history.pushState({}, "", newUrl);
    setCurrentFolderId(id);
  };



  const processFile = async (selectedFile: File) => {
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
    if (selectedFile.size > MAX_FILE_SIZE) {
      alert("File size exceeds 2GB limit.");
      return;
    }

    try {
      setIsUploading(true);
      setUploadProgress(10);

      const handshakeResponse = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type,
          fileSize: selectedFile.size
        }),
      });

      if (!handshakeResponse.ok) throw new Error("Handshake failed");
      const handshakeData = await handshakeResponse.json();
      setUploadProgress(20);

      if (handshakeData.uploadUrl) {
        // STANDARD UPLOAD PATH
        const uploadResponse = await fetch(handshakeData.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": selectedFile.type },
          body: selectedFile,
        });

        if (!uploadResponse.ok) throw new Error("Transfer failed");
        setUploadProgress(70);

        const metadataResponse = await fetch("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: selectedFile.name,
            size: selectedFile.size,
            mimeType: selectedFile.type,
            storageKey: handshakeData.storageKey,
            parentFolder: currentFolderId,
          }),
        });

        if (!metadataResponse.ok) throw new Error("Ledger failed");

      } else if (handshakeData.uploadId && handshakeData.partUrls) {
        // MULTIPART UPLOAD PATH
        const { uploadId, storageKey, partUrls, chunkSize } = handshakeData;
        const parts = [];

        try {
          for (let i = 0; i < partUrls.length; i++) {
            const start = i * chunkSize;
            const end = Math.min(start + chunkSize, selectedFile.size);
            const chunk = selectedFile.slice(start, end);

            const uploadResponse = await fetch(partUrls[i], {
              method: "PUT",
              body: chunk,
            });

            if (!uploadResponse.ok) throw new Error(`Chunk ${i + 1} upload failed`);

            const eTag = uploadResponse.headers.get("ETag");
            if (!eTag) {
              console.warn("ETag missing in response. Ensure MinIO CORS ExposeHeaders includes 'ETag'");
            }
            parts.push({ PartNumber: i + 1, ETag: eTag || "" });

            // Calculate progress (20% to 80%)
            const progress = 20 + Math.round(((i + 1) / partUrls.length) * 60);
            setUploadProgress(progress);
          }

          setUploadProgress(85);

          const completeResponse = await fetch("/api/upload/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "complete",
              uploadId,
              storageKey,
              parts,
            }),
          });

          if (!completeResponse.ok) throw new Error("Multipart completion failed");
          setUploadProgress(90);

          const metadataResponse = await fetch("/api/files", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: selectedFile.name,
              size: selectedFile.size,
              mimeType: selectedFile.type,
              storageKey,
              parentFolder: currentFolderId,
            }),
          });

          if (!metadataResponse.ok) throw new Error("Ledger failed");

        } catch (err) {
          console.error("Multipart failed, attempting abort...", err);
          await fetch("/api/upload/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "abort", uploadId, storageKey }),
          });
          throw err;
        }
      }

      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        fetchFiles();
      }, 800);

    } catch (error) {
      console.error("Pipeline failure:", error);
      alert("Upload crashed. Check console.");
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
    e.target.value = "";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  // 1. The Row Click (Pre-flight Validation added)
  const handlePreviewRowClick = async (file: FileRecord) => {
    if (file.mime_type === 'application/x-directory') return;
    // Check if the browser can actually render this file type
    const isPreviewable =
      file.mime_type.startsWith('image/') ||
      file.mime_type.startsWith('audio/') ||
      file.mime_type.startsWith('video/') ||
      file.mime_type === 'application/pdf' ||
      file.mime_type.startsWith('text/');

    // If it's a zip/rar/binary, skip the server fetch entirely and just show the fallback UI
    if (!isPreviewable) {
      setPreviewData({
        url: "",
        type: file.mime_type,
        name: file.name,
        previewable: false
      });
      return;
    }

    // Only fetch the S3 URL if the file is actually previewable
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey: file.storage_key, action: "preview" }),
      });

      if (!res.ok) throw new Error("Failed to get preview link");
      const { downloadUrl } = await res.json();

      setPreviewData({
        url: downloadUrl,
        type: file.mime_type,
        name: file.name,
        previewable: true
      });
    } catch (error) {
      console.error("Preview failed:", error);
      alert("Failed to load preview.");
    }
  };

  const handleDownloadAction = async (e: React.MouseEvent, storageKey: string, filename: string) => {
    e.stopPropagation();

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey, action: "download", filename }),
      });

      if (!res.ok) throw new Error("Failed to get download link");
      const { downloadUrl } = await res.json();

      window.location.assign(downloadUrl);
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download the file.");
    }
  };

  const handleFolderDownload = (folderId: string, folderName: string, password?: string) => {
    const pwdParam = password ? `&password=${encodeURIComponent(password)}` : "";
    window.location.assign(`/api/download/folder?id=${folderId}&name=${encodeURIComponent(folderName)}${pwdParam}`);
  };

  const attemptNavigateToFolder = (folder: FileRecord) => {
    if (folder.password) {
      setUnlockItem({ id: folder.id, name: folder.name, action: "open", correctPassword: folder.password });
      setPasswordInput("");
    } else {
      navigateToFolder(folder.id);
    }
  };

  const attemptDownloadFolder = (e: React.MouseEvent, folder: FileRecord) => {
    e.stopPropagation();
    if (folder.password) {
      setUnlockItem({ id: folder.id, name: folder.name, action: "download", correctPassword: folder.password });
      setPasswordInput("");
    } else {
      handleFolderDownload(folder.id, folder.name, "");
    }
  };

  const handleLockAction = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
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
      fetchFiles();
    } catch (error) {
      console.error("Lock failed:", error);
      alert("Failed to set password.");
    }
  };

  const handleUnlockSubmit = () => {
    if (!unlockItem) return;
    if (passwordInput.trim() !== unlockItem.correctPassword) {
      alert("Incorrect password");
      return;
    }
    const { action, id, name, correctPassword } = unlockItem;
    setUnlockItem(null);
    setPasswordInput("");
    if (action === "open") {
      navigateToFolder(id);
    } else if (action === "download") {
      handleFolderDownload(id, name, correctPassword);
    }
  };

  const handleDeleteAction = (e: React.MouseEvent, id: string, storageKey: string, name: string) => {
    e.stopPropagation();
    setDeleteItem({ id, storageKey, name });
  };

  const confirmDelete = async () => {
    if (!deleteItem) return;
    try {
      const res = await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deleteItem.id, storageKey: deleteItem.storageKey }),
      });

      if (!res.ok) throw new Error("Deletion failed");
      setDeleteItem(null);
      fetchFiles();
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Failed to delete the file.");
    }
  };

  const handleRenameAction = (e: React.MouseEvent, id: string, name: string) => {
    e.stopPropagation();
    setRenameItem({ id, name });
    setNewName(name);
  };

  const handleRenameSubmit = async () => {
    if (!renameItem || !newName || !newName.trim() || newName.trim() === renameItem.name) return;
    try {
      const res = await fetch("/api/files", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: renameItem.id, newName: newName.trim() }),
      });
      if (!res.ok) throw new Error("Rename failed");
      setRenameItem(null);
      fetchFiles();
    } catch (error) {
      console.error("Rename failed:", error);
      alert("Failed to rename.");
    }
  };

  const handleAddFolder = () => {
    setFolderName("");
    setShowFolderModal(true);
  };

  const handleFolderSubmit = async () => {
    if (!folderName || !folderName.trim()) return;

    try {
      const res = await fetch("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: folderName.trim(),
          size: 0,
          mimeType: "application/x-directory",
          storageKey: `folders/${crypto.randomUUID()}`,
          parentFolder: currentFolderId,
        }),
      });

      if (!res.ok) throw new Error("Failed to create folder");
      setShowFolderModal(false);
      fetchFiles();
    } catch (error) {
      console.error("Failed to create folder:", error);
      alert("Failed to create folder.");
    }
  };

  return (
    <main className="min-h-screen bg-[#f0f4f8] text-slate-900 p-8 font-sans selection:bg-[#9cb4d4] selection:text-white">
      <div className="max-w-4xl mx-auto space-y-8 mt-12 relative">

        <header className="border-b border-slate-200 pb-6 flex items-center justify-between">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Decoupled Storage System (DSS)</h1>
          {currentFolderId !== "/" && (
            <button 
              onClick={() => {
                const folder = files.find(f => f.id === currentFolderId);
                if (folder) {
                  navigateToFolder(folder.parent_folder);
                } else {
                  navigateToFolder("/");
                }
              }}
              className="bg-white border border-[#9cb4d4] text-[#9cb4d4] hover:bg-[#9cb4d4] hover:text-white hover:border-[#9cb4d4] active:bg-[#9cb4d4] active:text-white active:border-[#9cb4d4] text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 flex items-center gap-1 cursor-pointer"
            >
              ← Back
            </button>
          )}
        </header>

        <section 
          className={`bg-white shadow-sm border rounded-2xl p-6 flex flex-col items-center justify-center border-dashed relative overflow-hidden transition-all ${
            isDragging ? 'border-[#9cb4d4] bg-[#f0f4f8] shadow-[0_0_15px_rgba(156,180,212,0.6)]' : 'border-slate-200 hover:border-[#9cb4d4]'
          }`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {isUploading ? (
            <div className="w-full space-y-4 text-center py-4">
              <span className="text-sm font-bold text-[#6a87aa]">Uploading Your Files... {uploadProgress}%</span>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div
                  className="bg-[#9cb4d4] h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          ) : (
            <label className="cursor-pointer text-center p-6 w-full">
              <span className="text-slate-800 block text-xl font-bold mb-2">Click Here to Start Uploading</span>
              <span className="text-slate-500 text-sm block">Upload this file here. Supports large files beyond 100MB via chunking.</span>
              <input type="file" className="hidden" onChange={handleFileSelection} />
            </label>
          )}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Storage Node Matrix</h2>
            <button
              onClick={handleAddFolder}
              className="bg-white border border-[#9cb4d4] text-[#9cb4d4] hover:bg-[#9cb4d4] hover:text-white hover:border-[#9cb4d4] active:bg-[#9cb4d4] active:text-white active:border-[#9cb4d4] text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
            >
              Add Folder
            </button>
          </div>

          {currentFolderId !== "/" && (
            <div className="flex items-center gap-2 text-sm text-[#6a87aa] font-medium font-mono pb-2">
              <span
                className="hover:underline cursor-pointer"
                onClick={() => navigateToFolder("/")}
              >
                root
              </span>
              {(() => {
                const path = [];
                let tempId: string | null = currentFolderId;
                while (tempId && tempId !== "/") {
                  const folder = files.find(f => f.id === tempId);
                  if (folder) {
                    path.unshift({ id: folder.id, name: folder.name });
                    tempId = folder.parent_folder;
                  } else {
                    break;
                  }
                }
                return path.map((crumb) => (
                  <span key={crumb.id} className="flex items-center gap-2">
                    <span className="text-slate-300">/</span>
                    <span
                      className="hover:underline cursor-pointer font-bold"
                      onClick={() => navigateToFolder(crumb.id)}
                    >
                      {crumb.name}
                    </span>
                  </span>
                ));
              })()}
            </div>
          )}

          <div className="bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
            {files.filter(f => f.parent_folder === currentFolderId).length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm font-medium">
                {currentFolderId === "/"
                  ? "No metadata tracks verified in Supabase ledger index."
                  : "This folder is empty."}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {files
                  .filter((file) => file.parent_folder === currentFolderId)
                  .map((file) => (
                    <li
                      key={file.id}
                      onClick={() => {
                        if (file.mime_type === 'application/x-directory') {
                          attemptNavigateToFolder(file);
                        } else {
                          handlePreviewRowClick(file);
                        }
                      }}
                      className="p-5 flex items-center justify-between text-sm hover:bg-slate-50 transition-colors duration-200 cursor-pointer group"
                      title={file.mime_type === 'application/x-directory' ? "Open Folder" : "Click to Preview"}
                    >
                      <div className="space-y-1 flex-1 min-w-0 pr-6 md:pr-10">
                        <FilenameDisplay
                          name={file.name}
                          isExpanded={!!expandedFiles[file.id]}
                          onToggleExpand={() => {
                            setExpandedFiles((prev) => ({ ...prev, [file.id]: !prev[file.id] }));
                          }}
                          icon={file.mime_type === 'application/x-directory' ? <FolderIcon /> : <FileIcon />}
                        />
                        <p className="text-xs text-slate-500 font-medium ml-7">
                          {file.mime_type === 'application/x-directory'
                            ? 'Folder'
                            : `${(file.size / 1024 / 1024).toFixed(2)} MB • ${file.mime_type}`}
                        </p>
                      </div>

                      <div className="relative flex items-center">
                        {/* Mobile Kebab Menu */}
                        <div className="md:hidden">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setOpenDropdownId(openDropdownId === file.id ? null : file.id);
                            }}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
                          >
                            <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M5 14a2 2 0 100-4 2 2 0 000 4zm7 0a2 2 0 100-4 2 2 0 000 4zm7 0a2 2 0 100-4 2 2 0 000 4z" />
                            </svg>
                          </button>
                          
                          {openDropdownId === file.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setOpenDropdownId(null); }} />
                              <div 
                                className="absolute right-0 top-full mt-2 w-40 bg-white/95 backdrop-blur-md rounded-xl shadow-xl border border-slate-100 p-2 flex flex-col gap-1 z-20"
                                onClick={(e) => e.stopPropagation()}
                              >
                              {file.mime_type !== 'application/x-directory' ? (
                                <button
                                  onClick={(e) => { handleDownloadAction(e, file.storage_key, file.name); setOpenDropdownId(null); }}
                                  className="w-full text-left px-3 py-2 text-sm text-[#9cb4d4] hover:bg-[#9cb4d4] hover:text-white active:bg-[#9cb4d4] active:text-white rounded-lg font-bold transition-colors cursor-pointer"
                                >
                                  Download
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={(e) => { attemptDownloadFolder(e, file); setOpenDropdownId(null); }}
                                    className="w-full text-left px-3 py-2 text-sm text-[#9cb4d4] hover:bg-[#9cb4d4] hover:text-white active:bg-[#9cb4d4] active:text-white rounded-lg font-bold transition-colors cursor-pointer"
                                  >
                                    Download
                                  </button>
                                  <button
                                    onClick={(e) => { handleLockAction(e, file.id, file.name); setOpenDropdownId(null); }}
                                    className="w-full text-left px-3 py-2 text-sm text-[#eab308] hover:bg-[#eab308] hover:text-white active:bg-[#eab308] active:text-white rounded-lg font-bold transition-colors cursor-pointer"
                                  >
                                    {file.password ? "Change Password" : "Set Password"}
                                  </button>
                                </>
                              )}
                              <button
                                onClick={(e) => { handleRenameAction(e, file.id, file.name); setOpenDropdownId(null); }}
                                className="w-full text-left px-3 py-2 text-sm text-slate-500 hover:bg-slate-500 hover:text-white active:bg-slate-500 active:text-white rounded-lg font-bold transition-colors cursor-pointer"
                              >
                                Rename
                              </button>
                              <button
                                onClick={(e) => { handleDeleteAction(e, file.id, file.storage_key, file.name); setOpenDropdownId(null); }}
                                className="w-full text-left px-3 py-2 text-sm text-[#cf6d6d] hover:bg-[#cf6d6d] hover:text-white active:bg-[#cf6d6d] active:text-white rounded-lg font-bold transition-colors cursor-pointer"
                              >
                                Delete
                              </button>
                            </div>
                            </>
                          )}
                        </div>

                        {/* Desktop Buttons */}
                        <div className="hidden md:flex items-center gap-3">
                          {file.mime_type !== 'application/x-directory' ? (
                            <button
                              onClick={(e) => handleDownloadAction(e, file.storage_key, file.name)}
                              className="bg-[#9cb4d4] border border-[#9cb4d4] text-white hover:!bg-white hover:!text-[#9cb4d4] hover:!border-[#9cb4d4] active:!bg-white active:!text-[#9cb4d4] active:!border-[#9cb4d4] text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
                            >
                              Download
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={(e) => attemptDownloadFolder(e, file)}
                                className="bg-[#9cb4d4] border border-[#9cb4d4] text-white hover:!bg-white hover:!text-[#9cb4d4] hover:!border-[#9cb4d4] active:!bg-white active:!text-[#9cb4d4] active:!border-[#9cb4d4] text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
                              >
                                Download
                              </button>
                              <button
                                onClick={(e) => handleLockAction(e, file.id, file.name)}
                                className="bg-white border border-[#eab308] text-[#eab308] hover:!bg-[#eab308] hover:!text-white hover:!border-[#eab308] active:!bg-[#eab308] active:!text-white active:!border-[#eab308] text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
                              >
                                {file.password ? "Change Password" : "Set Password"}
                              </button>
                            </>
                          )}

                          <button
                            onClick={(e) => handleRenameAction(e, file.id, file.name)}
                            className="bg-white border border-slate-400 text-slate-500 hover:!bg-slate-500 hover:!text-white hover:!border-slate-500 active:!bg-slate-500 active:!text-white active:!border-slate-500 text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
                          >
                            Rename
                          </button>

                          <button
                            onClick={(e) => handleDeleteAction(e, file.id, file.storage_key, file.name)}
                            className="bg-white border border-[#e29393] text-[#cf6d6d] hover:!bg-[#cf6d6d] hover:!text-white hover:!border-[#cf6d6d] active:!bg-[#cf6d6d] active:!text-white active:!border-[#cf6d6d] text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* --- IN-APP PREVIEW MODAL --- */}
      {previewData && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 transition-opacity"
          onClick={() => setPreviewData(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-mono font-bold text-slate-800 truncate pr-4">{previewData.name}</h3>
              <button
                onClick={() => setPreviewData(null)}
                className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-md text-sm font-bold transition-colors"
              >
                Close
              </button>
            </div>

            <div className="flex-1 bg-[#f8fafc] overflow-auto flex items-center justify-center p-4">
              {/* Fallback UI for Zips/Rars/Binaries */}
              {!previewData.previewable ? (
                <div className="text-center space-y-4">
                  <div className="w-20 h-20 bg-slate-200 rounded-2xl mx-auto flex items-center justify-center shadow-sm border border-slate-300">
                    <span className="text-3xl" aria-hidden="true">📄</span>
                  </div>
                  <h4 className="text-xl font-extrabold text-slate-800">Preview is not available</h4>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    The browser cannot render <span className="font-mono bg-slate-100 px-1 rounded">{previewData.type || 'this type of'}</span> files inline. Please use the download button on the main dashboard to access this file.
                  </p>
                </div>
              ) : previewData.type.startsWith('image/') ? (
                <img src={previewData.url} alt={previewData.name} className="max-w-full max-h-full object-contain rounded-md shadow-sm" />
              ) : previewData.type.startsWith('audio/') ? (
                <audio src={previewData.url} controls className="w-full max-w-md" />
              ) : previewData.type.startsWith('video/') ? (
                <video src={previewData.url} controls className="max-w-full max-h-full rounded-md shadow-sm" />
              ) : (
                <iframe src={previewData.url} className="w-full h-full border-0 bg-white rounded-md shadow-sm" title="Document Preview" />
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- ADD FOLDER MODAL --- */}
      {showFolderModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-opacity"
          onClick={() => setShowFolderModal(false)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-mono font-bold text-slate-800">Create New Folder</h3>
              <button
                onClick={() => setShowFolderModal(false)}
                className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-md text-sm font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4">
              <input
                type="text"
                placeholder="Folder name"
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#9cb4d4] font-mono text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleFolderSubmit();
                  }
                }}
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setShowFolderModal(false)}
                  className="bg-white border border-slate-200 text-slate-500 text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFolderSubmit}
                  className="bg-[#9cb4d4] hover:bg-white hover:text-[#9cb4d4] border border-[#9cb4d4] text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
                >
                  Create
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- RENAME MODAL --- */}
      {renameItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-opacity"
          onClick={() => setRenameItem(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-mono font-bold text-slate-800">Rename Item</h3>
              <button
                onClick={() => setRenameItem(null)}
                className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-md text-sm font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4">
              <input
                type="text"
                placeholder="New name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#9cb4d4] font-mono text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRenameSubmit();
                  }
                }}
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setRenameItem(null)}
                  className="bg-white border border-slate-200 text-slate-500 text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleRenameSubmit}
                  className="bg-[#9cb4d4] hover:bg-white hover:text-[#9cb4d4] border border-[#9cb4d4] text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
                >
                  Rename
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- DELETE CONFIRM MODAL --- */}
      {deleteItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-opacity"
          onClick={() => setDeleteItem(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-[#fdf3f3] bg-[#fff5f5]">
              <h3 className="font-mono font-bold text-[#cf6d6d]">Confirm Deletion</h3>
              <button
                onClick={() => setDeleteItem(null)}
                className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-md text-sm font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4 text-center">
              <p className="text-sm text-slate-600 font-medium">
                Are you sure you want to permanently delete <span className="font-bold text-slate-800">"{deleteItem.name}"</span>?
              </p>
              <p className="text-xs text-[#cf6d6d]">This action cannot be undone.</p>
              
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={() => setDeleteItem(null)}
                  className="bg-white border border-slate-200 text-slate-500 text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="bg-white border border-[#e29393] text-[#cf6d6d] hover:bg-[#cf6d6d] hover:text-white hover:border-[#cf6d6d] text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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

      {/* --- UNLOCK FOLDER MODAL --- */}
      {unlockItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-opacity"
          onClick={() => setUnlockItem(null)}
        >
          <div
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-mono font-bold text-slate-800">Folder is Locked</h3>
              <button
                onClick={() => setUnlockItem(null)}
                className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-md text-sm font-bold transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600 font-medium">
                Please enter the password to {unlockItem.action} <span className="font-bold text-slate-800">"{unlockItem.name}"</span>
              </p>
              <input
                type="password"
                placeholder="Password"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#9cb4d4] font-mono text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleUnlockSubmit();
                  }
                }}
              />
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={() => setUnlockItem(null)}
                  className="bg-white border border-slate-200 text-slate-500 text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleUnlockSubmit}
                  className="bg-[#9cb4d4] hover:bg-white hover:text-[#9cb4d4] border border-[#9cb4d4] text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
                >
                  Unlock
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}