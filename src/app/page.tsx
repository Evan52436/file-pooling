// File: src/app/page.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { sha256 } from "../lib/hash";

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
  subtitle?: React.ReactNode;
}

function FilenameDisplay({ name, isExpanded, onToggleExpand, icon, subtitle }: FilenameDisplayProps) {
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
    <div className="flex items-center gap-3">
      <span className="shrink-0 flex items-center justify-center">
        {icon}
      </span>
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <div className="flex items-center gap-1.5 min-w-0">
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
        {subtitle}
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

interface PendingUpload {
  id: string;
  file: File;
  customName: string;
  uploaderName: string;
  password?: string;
  expiration: "1d" | "1w" | "2w" | "1m" | "2m" | "forever";
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

async function fetchWithRetry(url: RequestInfo | URL, options?: RequestInit, maxRetries: number = 3, backoff: number = 1000): Promise<Response> {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, options);
      if (!res.ok) {
        if ((res.status >= 500 || res.status === 429) && attempt < maxRetries) {
          attempt++;
          await new Promise(r => setTimeout(r, backoff * Math.pow(2, attempt - 1)));
          continue;
        }
      }
      return res;
    } catch (error) {
      if (attempt < maxRetries) {
        attempt++;
        await new Promise(r => setTimeout(r, backoff * Math.pow(2, attempt - 1)));
        continue;
      }
      throw error;
    }
  }
  throw new Error("Unreachable");
}

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
  const [unlockItem, setUnlockItem] = useState<{ id: string, name: string, action: "open" | "download", correctPassword?: string } | null>(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Record<string, boolean>>({});

  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [showUploadConfigModal, setShowUploadConfigModal] = useState(false);
  const [alertModal, setAlertModal] = useState<{ title: string; message: string; isError?: boolean } | null>(null);
  const [renderTrigger, setRenderTrigger] = useState(0);
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const listRef = useRef<HTMLDivElement>(null);
  const [showScrollIndicator, setShowScrollIndicator] = useState(false);

  const checkScrollable = () => {
    const el = listRef.current;
    if (el) {
      const isScrollable = el.scrollHeight > el.clientHeight;
      const isAtBottom = el.scrollHeight - el.scrollTop <= el.clientHeight + 15;
      setShowScrollIndicator(isScrollable && !isAtBottom);
    }
  };

  useEffect(() => {
    const timer = setTimeout(checkScrollable, 100);
    window.addEventListener("resize", checkScrollable);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", checkScrollable);
    };
  }, [files, currentFolderId, renderTrigger]);

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



  const getExpirationDate = (exp: string) => {
    if (exp === "forever") return null;
    const date = new Date();
    if (exp === "1d") date.setDate(date.getDate() + 1);
    if (exp === "1w") date.setDate(date.getDate() + 7);
    if (exp === "2w") date.setDate(date.getDate() + 14);
    if (exp === "1m") date.setMonth(date.getMonth() + 1);
    if (exp === "2m") date.setMonth(date.getMonth() + 2);
    return date.toISOString();
  };

  const processSingleUpload = async (pu: PendingUpload, setProgress: (p: number) => void) => {
    const selectedFile = pu.file;
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB
    if (selectedFile.size > MAX_FILE_SIZE) {
      throw new Error(`File ${pu.customName} exceeds 2GB limit.`);
    }

    setProgress(10);
    const handshakeResponse = await fetchWithRetry("/api/upload", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: pu.customName,
        contentType: selectedFile.type,
        fileSize: selectedFile.size
      }),
    });

    if (!handshakeResponse.ok) throw new Error("Handshake failed");
    const handshakeData = await handshakeResponse.json();
    setProgress(20);

    const metadataPayload: any = {
      name: pu.customName,
      size: selectedFile.size,
      mimeType: selectedFile.type,
      storageKey: handshakeData.storageKey || handshakeData.uploadId,
      parentFolder: currentFolderId,
      uploaderName: pu.uploaderName.trim(),
      password: pu.password,
      expiresAt: getExpirationDate(pu.expiration)
    };

    if (handshakeData.uploadUrl) {
      // STANDARD UPLOAD PATH
      const uploadResponse = await fetchWithRetry(handshakeData.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": selectedFile.type },
        body: selectedFile,
      });

      if (!uploadResponse.ok) throw new Error("Transfer failed");
      setProgress(70);

      metadataPayload.storageKey = handshakeData.storageKey;
      const metadataResponse = await fetchWithRetry("/api/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadataPayload),
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

          const uploadResponse = await fetchWithRetry(partUrls[i], {
            method: "PUT",
            body: chunk,
          });

          if (!uploadResponse.ok) throw new Error(`Chunk ${i + 1} upload failed`);

          const eTag = uploadResponse.headers.get("ETag");
          parts.push({ PartNumber: i + 1, ETag: eTag || "" });
          setProgress(20 + Math.round(((i + 1) / partUrls.length) * 60));
        }

        setProgress(85);
        const completeResponse = await fetchWithRetry("/api/upload/complete", {
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
        setProgress(90);

        metadataPayload.storageKey = storageKey;
        const metadataResponse = await fetchWithRetry("/api/files", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metadataPayload),
        });

        if (!metadataResponse.ok) throw new Error("Ledger failed");

      } catch (err) {
        console.error("Multipart failed, attempting abort...", err);
        await fetchWithRetry("/api/upload/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "abort", uploadId, storageKey }),
        });
        throw err;
      }
    }
    setProgress(100);
  };

  const handleConfirmUploads = async () => {
    // Validation
    for (const pu of pendingUploads) {
      if (!pu.uploaderName.trim()) {
        setAlertModal({ title: "Validation Error", message: `Uploader name is required for "${pu.customName}".`, isError: true });
        return;
      }
    }

    setShowUploadConfigModal(false);
    setIsUploading(true);
    setUploadProgress(0);

    for (let i = 0; i < pendingUploads.length; i++) {
      const pu = pendingUploads[i];
      try {
        await processSingleUpload(pu, (p) => {
          const baseProgress = (i / pendingUploads.length) * 100;
          const fileContrib = (p / 100) * (100 / pendingUploads.length);
          setUploadProgress(Math.round(baseProgress + fileContrib));
        });
      } catch (error) {
        console.error("Pipeline failure for", pu.customName, error);
        setAlertModal({ 
          title: "Upload Failed", 
          message: error instanceof Error ? error.message : `Upload failed for "${pu.customName}".`, 
          isError: true 
        });
      }
    }

    setIsUploading(false);
    setUploadProgress(0);
    setPendingUploads([]);
    fetchFiles();
  };

  const startUploadConfig = (filesArray: File[]) => {
    const newUploads = filesArray.map(f => ({
      id: crypto.randomUUID(),
      file: f,
      customName: f.name,
      uploaderName: "",
      expiration: "2w" as const
    }));
    setPendingUploads(newUploads);
    setShowUploadConfigModal(true);
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      startUploadConfig(Array.from(e.target.files));
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
      startUploadConfig(Array.from(e.dataTransfer.files));
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
      setAlertModal({ title: "Preview Failed", message: "Could not load the file preview. Please try again or download the file.", isError: true });
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
      setAlertModal({ title: "Download Failed", message: "Failed to download the file. Please check your network connection.", isError: true });
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

  const handleUnlockSubmit = async () => {
    if (!unlockItem) return;
    const plaintextPassword = passwordInput.trim();
    const hashedInput = await sha256(plaintextPassword);
    if (hashedInput !== unlockItem.correctPassword) {
      setAlertModal({ title: "Access Denied", message: "The password you entered is incorrect. Please try again.", isError: true });
      return;
    }
    const { action, id, name } = unlockItem;
    setUnlockItem(null);
    setPasswordInput("");
    if (action === "open") {
      navigateToFolder(id);
    } else if (action === "download") {
      handleFolderDownload(id, name, plaintextPassword);
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
      setAlertModal({ title: "Delete Failed", message: "Failed to delete the selected item. Please try again.", isError: true });
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
      setAlertModal({ title: "Rename Failed", message: "Failed to rename the item. Please try again.", isError: true });
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
      setAlertModal({ title: "Folder Creation Failed", message: "Failed to create the folder. Please try again.", isError: true });
    }
  };

  const getSortedItems = () => {
    const currentItems = files.filter(f => f.parent_folder === currentFolderId);
    const foldersList = currentItems.filter(f => f.mime_type === 'application/x-directory');
    const filesList = currentItems.filter(f => f.mime_type !== 'application/x-directory');

    const sortByDate = (a: FileRecord, b: FileRecord) => {
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    };
    
    foldersList.sort(sortByDate);
    filesList.sort(sortByDate);

    const savedOrderStr = typeof window !== 'undefined' ? localStorage.getItem(`dss_order_${currentFolderId}`) : null;
    if (savedOrderStr) {
      try {
        const savedOrder: string[] = JSON.parse(savedOrderStr);
        const orderByCustom = (list: FileRecord[]) => {
          return list.sort((a, b) => {
            const idxA = savedOrder.indexOf(a.id);
            const idxB = savedOrder.indexOf(b.id);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return sortByDate(a, b);
          });
        };
        orderByCustom(foldersList);
        orderByCustom(filesList);
      } catch (e) {
        console.error("Failed to parse custom order", e);
      }
    }

    return [...foldersList, ...filesList];
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.effectAllowed = "move";
    // Delay setting draggedId state so the browser captures the fully-opaque card layout as the floating drag image first
    setTimeout(() => {
      setDraggedId(id);
    }, 0);
  };

  const handleDragOverRow = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDropRow = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    const sourceId = e.dataTransfer.getData("text/plain") || draggedId;
    if (!sourceId || sourceId === targetId) return;

    const sorted = getSortedItems();
    const sourceItem = sorted.find(item => item.id === sourceId);
    const targetItem = sorted.find(item => item.id === targetId);

    if (!sourceItem || !targetItem) return;
    const sourceIsFolder = sourceItem.mime_type === 'application/x-directory';
    const targetIsFolder = targetItem.mime_type === 'application/x-directory';
    if (sourceIsFolder !== targetIsFolder) return;

    const sameTypeList = sorted.filter(item => 
      (item.mime_type === 'application/x-directory') === sourceIsFolder
    );

    const sourceIdx = sameTypeList.findIndex(item => item.id === sourceId);
    const targetIdx = sameTypeList.findIndex(item => item.id === targetId);

    if (sourceIdx === -1 || targetIdx === -1) return;

    const reorderedList = [...sameTypeList];
    const [removed] = reorderedList.splice(sourceIdx, 1);
    reorderedList.splice(targetIdx, 0, removed);

    const otherTypeList = sorted.filter(item => 
      (item.mime_type === 'application/x-directory') !== sourceIsFolder
    );

    const newFullList = sourceIsFolder 
      ? [...reorderedList, ...otherTypeList]
      : [...otherTypeList, ...reorderedList];

    const newOrderIds = newFullList.map(item => item.id);
    localStorage.setItem(`dss_order_${currentFolderId}`, JSON.stringify(newOrderIds));
    
    setRenderTrigger(prev => prev + 1);
    setDraggedId(null);
  };

  return (
    <main className="h-screen overflow-hidden flex flex-col bg-[#f0f4f8] text-slate-900 p-4 sm:p-8 font-sans selection:bg-[#9cb4d4] selection:text-white">
      <div className="flex-1 min-h-0 max-w-4xl w-full mx-auto flex flex-col gap-6 sm:gap-8 mt-2 sm:mt-8 relative">

        <header className="shrink-0 border-b border-slate-200 pb-6 flex items-center justify-between">
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
          className={`shrink-0 bg-white shadow-sm border rounded-2xl p-6 flex flex-col items-center justify-center border-dashed relative overflow-hidden transition-all duration-300 ${
            isDragging ? 'border-[#9cb4d4] bg-[#e6eef5] shadow-[0_0_30px_rgba(156,180,212,0.95),_0_0_15px_rgba(156,180,212,0.6)] ring-4 ring-[#9cb4d4]/40 scale-[1.02]' : 'border-slate-200 hover:border-[#9cb4d4] hover:shadow-[0_0_15px_rgba(156,180,212,0.2)]'
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
              <span className="text-slate-500 text-sm block">Upload your files here. The maximum upload limit is 2GB.</span>
              <input type="file" className="hidden" onChange={handleFileSelection} multiple />
            </label>
          )}
        </section>

        <section className="flex-1 min-h-0 flex flex-col gap-4 pb-2 sm:pb-4">
          <div className="shrink-0 flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">Our Uploaded Files</h2>
            <button
              onClick={handleAddFolder}
              className="bg-white border border-[#9cb4d4] text-[#9cb4d4] hover:bg-[#9cb4d4] hover:text-white hover:border-[#9cb4d4] active:bg-[#9cb4d4] active:text-white active:border-[#9cb4d4] text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer"
            >
              Add Folder
            </button>
          </div>

          {currentFolderId !== "/" && (
            <div className="shrink-0 flex items-center gap-2 text-sm text-[#6a87aa] font-medium font-mono pb-2">
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

          <div className="relative flex-1 min-h-0">
            <div
              ref={listRef}
              onScroll={checkScrollable}
              className="h-full bg-white shadow-sm border border-slate-200 rounded-2xl overflow-y-auto"
            >
              {files.filter(f => f.parent_folder === currentFolderId).length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm font-medium">
                {currentFolderId === "/"
                  ? "No metadata tracks verified in Supabase ledger index."
                  : "This folder is empty."}
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {getSortedItems().map((file) => (
                    <li
                      key={file.id}
                      onDragOver={handleDragOverRow}
                      onDrop={(e) => handleDropRow(e, file.id)}
                      onClick={() => {
                        if (file.mime_type === 'application/x-directory') {
                          attemptNavigateToFolder(file);
                        } else {
                          handlePreviewRowClick(file);
                        }
                      }}
                      className={`p-5 flex items-center justify-between text-sm hover:bg-slate-50 transition-colors duration-200 cursor-pointer group select-none ${
                        draggedId === file.id ? 'opacity-40 bg-slate-100' : ''
                      }`}
                      title={file.mime_type === 'application/x-directory' ? "Open Folder" : "Click to Preview"}
                    >
                      <div className="flex-1 min-w-0 flex items-center gap-2 pr-4 md:pr-10">
                        {/* Drag Handle (Hamburger Icon) */}
                        <div 
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            handleDragStart(e, file.id);
                          }}
                          className="text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0 flex items-center p-1"
                          onClick={(e) => e.stopPropagation()}
                          title="Drag to rearrange"
                        >
                          <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M4 9h16M4 15h16" />
                          </svg>
                        </div>
 
                        <div className="flex-1 min-w-0">
                          <FilenameDisplay
                            name={file.name}
                            isExpanded={!!expandedFiles[file.id]}
                            onToggleExpand={() => {
                              setExpandedFiles((prev) => ({ ...prev, [file.id]: !prev[file.id] }));
                            }}
                            icon={file.mime_type === 'application/x-directory' ? <FolderIcon /> : <FileIcon />}
                            subtitle={
                              <p className="text-xs text-slate-500 font-medium">
                                {file.mime_type === 'application/x-directory'
                                  ? 'Folder'
                                  : `${(file.size / 1024 / 1024).toFixed(2)} MB • ${file.mime_type}`}
                              </p>
                            }
                          />
                        </div>
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
                                  className="w-full text-left px-3 py-2 text-sm text-[#9cb4d4] hover:bg-[#9cb4d4] hover:text-white active:bg-[#9cb4d4] active:text-white rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-2"
                                >
                                  <svg
                                    className="w-4 h-4 shrink-0"
                                    fill="none; stroke=currentColor"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    viewBox="0 0 24 24"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" x2="12" y1="15" y2="3" />
                                  </svg>
                                  <span>Download</span>
                                </button>
                              ) : (
                                <button
                                  onClick={(e) => { attemptDownloadFolder(e, file); setOpenDropdownId(null); }}
                                  className="w-full text-left px-3 py-2 text-sm text-[#9cb4d4] hover:bg-[#9cb4d4] hover:text-white active:bg-[#9cb4d4] active:text-white rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-2"
                                >
                                  <svg
                                    className="w-4 h-4 shrink-0"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    viewBox="0 0 24 24"
                                    xmlns="http://www.w3.org/2000/svg"
                                  >
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                    <polyline points="7 10 12 15 17 10" />
                                    <line x1="12" x2="12" y1="15" y2="3" />
                                  </svg>
                                  <span>Download</span>
                                </button>
                              )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setRenameItem(file); setOpenDropdownId(null); }}
                                  className='w-full text-left px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-2'
                                >
                                  <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z' /></svg>
                                  <span>Rename</span>
                                </button>
                                <button
                                  onClick={(e) => { e.stopPropagation(); setDeleteItem({ id: file.id, storageKey: file.storage_key, name: file.name }); setOpenDropdownId(null); }}
                                  className='w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-2'
                                >
                                  <svg className='w-4 h-4' fill='none' stroke='currentColor' viewBox='0 0 24 24'><path strokeLinecap='round' strokeLinejoin='round' strokeWidth={2} d='M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16' /></svg>
                                  <span>Delete</span>
                                </button>
                              </div>
                            </>
                          )}
                        </div>

                      {/* Desktop Buttons */}
                      <div className='hidden md:flex items-center gap-2'>
                        {file.mime_type !== 'application/x-directory' ? (
                          <button
                            onClick={(e) => handleDownloadAction(e, file.storage_key, file.name)}
                            className='group/btn flex items-center justify-center gap-0 hover:gap-1.5 px-2.5 hover:px-4 py-2.5 bg-[#9cb4d4] border border-[#9cb4d4] text-white hover:!bg-white hover:!text-[#9cb4d4] hover:!border-[#9cb4d4] rounded-lg transition-all duration-300 ease-in-out shadow-sm active:scale-95 cursor-pointer overflow-hidden whitespace-nowrap'
                            title='Download File'
                            aria-label='Download file'
                          >
                            <svg
                              className='w-4.5 h-4.5 shrink-0'
                              fill='none'
                              stroke='currentColor'
                              strokeWidth={2}
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              viewBox='0 0 24 24'
                              xmlns='http://www.w3.org/2000/svg'
                            >
                              <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
                              <polyline points='7 10 12 15 17 10' />
                              <line x1='12' x2='12' y1='15' y2='3' />
                            </svg>
                            <span className='inline-block max-w-0 opacity-0 overflow-hidden group-hover/btn:max-w-[100px] group-hover/btn:opacity-100 transition-all duration-300 ease-in-out font-bold text-xs'>
                              Download
                            </span>
                          </button>
                        ) : (
                          <button
                            onClick={(e) => attemptDownloadFolder(e, file)}
                            className='group/btn flex items-center justify-center gap-0 hover:gap-1.5 px-2.5 hover:px-4 py-2.5 bg-[#9cb4d4] border border-[#9cb4d4] text-white hover:!bg-white hover:!text-[#9cb4d4] hover:!border-[#9cb4d4] rounded-lg transition-all duration-300 ease-in-out shadow-sm active:scale-95 cursor-pointer overflow-hidden whitespace-nowrap'
                            title='Download Folder'
                            aria-label='Download folder'
                          >
                            <svg
                              className='w-4.5 h-4.5 shrink-0'
                              fill='none'
                              stroke='currentColor'
                              strokeWidth={2}
                              strokeLinecap='round'
                              strokeLinejoin='round'
                              viewBox='0 0 24 24'
                              xmlns='http://www.w3.org/2000/svg'
                            >
                              <path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' />
                              <polyline points='7 10 12 15 17 10' />
                              <line x1='12' x2='12' y1='15' y2='3' />
                            </svg>
                            <span className='inline-block max-w-0 opacity-0 overflow-hidden group-hover/btn:max-w-[100px] group-hover/btn:opacity-100 transition-all duration-300 ease-in-out font-bold text-xs'>
                              Download
                            </span>
                          </button>
                        )}

                        <button
                          onClick={(e) => handleRenameAction(e, file.id, file.name)}
                          className='group/btn flex items-center justify-center gap-0 hover:gap-1.5 px-2.5 hover:px-4 py-2.5 bg-white border border-slate-400 text-slate-500 hover:!bg-slate-500 hover:!text-white hover:!border-slate-500 rounded-lg transition-all duration-300 ease-in-out shadow-sm active:scale-95 cursor-pointer overflow-hidden whitespace-nowrap'
                          title='Rename'
                          aria-label='Rename item'
                        >
                          <svg
                            className='w-4.5 h-4.5 shrink-0'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth={0}
                            viewBox='0 0 24 24'
                            xmlns='http://www.w3.org/2000/svg'
                          >
                            <path d='M9.75 2h4a.75.75 0 0 1 .1 1.5H12.5v17h1.25c.37 0 .69.28.74.65v.1c0 .38-.28.7-.64.74l-.1.01h-4a.75.75 0 0 1-.1-1.5H11v-17H9.75a.75.75 0 0 1-.74-.65L9 2.75c0-.38.28-.7.65-.74l.1-.01h-4-4Zm8.5 3c1.79 0 3.24 1.45 3.25 3.25v7.5A3.25 3.25 0 0 1 18.25 19h-4a.75.75 0 0 1-.1-1.5h4c.97 0 1.75-.78 1.75-1.75v-7.5c0-.97-.78-1.75-1.75-1.75h-4a.75.75 0 0 1-.1-1.5h4ZM4.75 5h4c.38 0 .7.28.74.65v.1c0 .38-.28.7-.64.74l-.1.01h-4c-.97 0-1.75.78-1.75 1.75v7.5c0 .97.78 1.75 1.75 1.75h4a.75.75 0 0 1 .1 1.5h-4a3.25 3.25 0 0 1-3.25-3.25v-7.5c0-1.8 1.45-3.25 3.25-3.25Z' fill='currentColor'/>
                          </svg>
                          <span className='inline-block max-w-0 opacity-0 overflow-hidden group-hover/btn:max-w-[100px] group-hover/btn:opacity-100 transition-all duration-300 ease-in-out font-bold text-xs'>
                            Rename
                          </span>
                        </button>

                        <button
                          onClick={(e) => handleDeleteAction(e, file.id, file.storage_key, file.name)}
                          className='group/btn flex items-center justify-center gap-0 hover:gap-1.5 px-2.5 hover:px-4 py-2.5 bg-white border border-[#e29393] text-[#cf6d6d] hover:!bg-[#cf6d6d] hover:!text-white hover:!border-[#cf6d6d] rounded-lg transition-all duration-300 ease-in-out shadow-sm active:scale-95 cursor-pointer overflow-hidden whitespace-nowrap'
                          title='Delete'
                          aria-label='Delete item'
                        >
                          <svg
                            className='w-4.5 h-4.5 shrink-0'
                            fill='none'
                            stroke='currentColor'
                            strokeWidth={2}
                            strokeLinecap='round'
                            strokeLinejoin='round'
                            viewBox='0 0 24 24'
                            xmlns='http://www.w3.org/2000/svg'
                          >
                            <path d='M3 6h18' />
                            <path d='M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' />
                            <path d='M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' />
                            <line x1='10' x2='10' y1='11' y2='17' />
                            <line x1='14' x2='14' y1='11' y2='17' />
                          </svg>
                          <span className='inline-block max-w-0 opacity-0 overflow-hidden group-hover/btn:max-w-[100px] group-hover/btn:opacity-100 transition-all duration-300 ease-in-out font-bold text-xs'>
                            Delete
                          </span>
                        </button>
                      </div>
                    </div>
                    </li>
                  ))}
              </ul>
            )}
            </div>

            {/* Bottom Fade-out Effect */}
            <div
              className={`pointer-events-none absolute bottom-[1px] left-[1px] right-[1px] h-12 bg-gradient-to-t from-white via-white/80 to-transparent rounded-b-2xl transition-opacity duration-300 z-10 ${
                showScrollIndicator ? "opacity-100" : "opacity-0"
              }`}
            />

            {/* Scroll indicator arrow */}
            <div
              className={`absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-none transition-all duration-300 ${
                showScrollIndicator ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
              }`}
            >
              <div className="bg-[#9cb4d4] text-white p-1.5 rounded-full shadow-lg border border-white/50 animate-bounce">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
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

      {/* --- UPLOAD CONFIG MODAL --- */}
      {showUploadConfigModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-opacity">
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[90vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <h3 className='font-mono font-bold text-slate-800'>Configure Uploads</h3>
              <button onClick={() => setShowUploadConfigModal(false)} className='text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-md text-sm font-bold transition-colors'>Close</button>
            </div>
            <div className='p-6 overflow-y-auto space-y-6'>
              <div className='flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-blue-50 text-blue-800 text-sm p-4 rounded-lg font-medium border border-blue-100'>
                <span>ℹ️ By default, files are deleted after 2 weeks. You can change this below.</span>
                <label className='bg-white border border-[#9cb4d4] text-[#9cb4d4] hover:bg-[#9cb4d4] hover:text-white active:bg-[#9cb4d4] active:text-white text-xs font-bold py-1.5 px-3 rounded-lg transition-colors shadow-sm active:scale-95 cursor-pointer select-none shrink-0 text-center'>
                  Add More Files
                  <input
                    type='file'
                    className='hidden'
                    multiple
                    onChange={(e) => {
                      if (e.target.files && e.target.files.length > 0) {
                        const filesArray = Array.from(e.target.files);
                        const newUploads = filesArray.map(f => ({
                          id: crypto.randomUUID(),
                          file: f,
                          customName: f.name,
                          uploaderName: pendingUploads[0]?.uploaderName || '',
                          expiration: '2w' as const
                        }));
                        setPendingUploads(prev => [...prev, ...newUploads]);
                      }
                      e.target.value = '';
                    }}
                  />
                </label>
              </div>
              {pendingUploads.map((pu, idx) => (
                <div key={pu.id} className='border border-slate-200 rounded-xl p-4 space-y-4 bg-slate-50 relative'>
                  <div className='flex justify-between items-center'>
                    <span className='text-xs font-bold text-slate-400 uppercase'>File #{idx + 1}</span>
                    {pendingUploads.length > 1 && (
                      <button
                        onClick={() => {
                          setPendingUploads(prev => prev.filter(item => item.id !== pu.id));
                        }}
                        className='text-xs text-red-500 hover:text-red-700 font-bold hover:underline cursor-pointer'
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  <div className='flex flex-col gap-1'>
                    <label className='text-xs font-bold text-slate-500 uppercase'>Filename</label>
                    <input type='text' value={pu.customName} onChange={e => {
                      const newUploads = [...pendingUploads];
                      newUploads[idx].customName = e.target.value;
                      setPendingUploads(newUploads);
                    }} className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#9cb4d4] font-mono text-sm' />
                  </div>
                  <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
                    <div className='flex flex-col gap-1'>
                      <label className='text-xs font-bold text-slate-500 uppercase'>Uploader Name *</label>
                      <input type='text' value={pu.uploaderName} onChange={e => {
                        const newUploads = [...pendingUploads];
                        newUploads[idx].uploaderName = e.target.value;
                        setPendingUploads(newUploads);
                      }} placeholder='Required' className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#9cb4d4] font-sans text-sm' />
                    </div>
                    <div className='flex flex-col gap-1'>
                      <label className='text-xs font-bold text-slate-500 uppercase'>Password (Optional)</label>
                      <input type='password' value={pu.password || ''} onChange={e => {
                        const newUploads = [...pendingUploads];
                        newUploads[idx].password = e.target.value;
                        setPendingUploads(newUploads);
                      }} placeholder='Leave blank for public' className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#eab308] font-mono text-sm' />
                    </div>
                    <div className='flex flex-col gap-1'>
                      <label className='text-xs font-bold text-slate-500 uppercase'>Expiration</label>
                      <select 
                        value={pu.expiration} 
                        onChange={e => {
                          const newUploads = [...pendingUploads];
                          newUploads[idx].expiration = e.target.value as any;
                          setPendingUploads(newUploads);
                        }} 
                        className='w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:border-[#9cb4d4] font-sans text-sm bg-white'
                        style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}
                      >
                        <option value='1d' style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>1 Day</option>
                        <option value='1w' style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>1 Week</option>
                        <option value='2w' style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>2 Weeks (Default)</option>
                        <option value='1m' style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>1 Month</option>
                        <option value='2m' style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>2 Months</option>
                        <option value='forever' style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}>Keep Forever</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className='p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3'>
              <button onClick={() => setShowUploadConfigModal(false)} className="bg-white border border-slate-200 text-slate-500 text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95 hover:bg-slate-50">Cancel</button>
              <button onClick={handleConfirmUploads} className="bg-[#9cb4d4] hover:bg-white hover:text-[#9cb4d4] border border-[#9cb4d4] text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95">Start Upload</button>
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