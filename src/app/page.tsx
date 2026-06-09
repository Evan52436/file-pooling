// File: src/app/page.tsx
"use client";

import { useState, useEffect } from "react";

interface FileRecord {
  id: string;
  name: string;
  size: number;
  mime_type: string;
  storage_key: string;
  created_at: string;
}

// Added 'previewable' flag to the state interface
interface PreviewState {
  url: string;
  type: string;
  name: string;
  previewable: boolean;
}

export default function DriveDashboard() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const [previewData, setPreviewData] = useState<PreviewState | null>(null);

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
  }, []);

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

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

  const handleDeleteAction = async (e: React.MouseEvent, id: string, storageKey: string) => {
    e.stopPropagation(); 
    if (!window.confirm("Are you sure you want to permanently delete this file?")) return;
    
    try {
      const res = await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, storageKey }),
      });

      if (!res.ok) throw new Error("Deletion failed");
      fetchFiles();
    } catch (error) {
      console.error("Delete failed:", error);
      alert("Failed to delete the file.");
    }
  };

  const handleAddFolder = async () => {
    const folderName = prompt("Enter folder name:");
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
        }),
      });

      if (!res.ok) throw new Error("Failed to create folder");
      fetchFiles();
    } catch (error) {
      console.error("Failed to create folder:", error);
      alert("Failed to create folder.");
    }
  };

  return (
    <main className="min-h-screen bg-[#f0f4f8] text-slate-900 p-8 font-sans selection:bg-[#9cb4d4] selection:text-white">
      <div className="max-w-4xl mx-auto space-y-8 mt-12 relative">
        
        <header className="border-b border-slate-200 pb-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Decoupled Storage System</h1>
        </header>

        <section className="bg-white shadow-sm border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center border-dashed relative overflow-hidden transition-all hover:border-[#9cb4d4]">
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
              className="bg-white border border-[#9cb4d4] text-[#9cb4d4] hover:bg-[#f4f7fa] text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95"
            >
              Add Folder
            </button>
          </div>
          <div className="bg-white shadow-sm border border-slate-200 rounded-2xl overflow-hidden">
            {files.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-sm font-medium">
                No metadata tracks verified in Supabase ledger index.
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {files.map((file) => (
                  <li 
                    key={file.id} 
                    onClick={() => {
                      if (file.mime_type !== 'application/x-directory') {
                        handlePreviewRowClick(file);
                      }
                    }}
                    className={`p-5 flex items-center justify-between text-sm hover:bg-slate-50 transition-colors duration-200 ${
                      file.mime_type === 'application/x-directory' ? 'cursor-default' : 'cursor-pointer'
                    } group`}
                    title={file.mime_type === 'application/x-directory' ? undefined : "Click to Preview"}
                  >
                    <div className="space-y-1 max-w-[50%]">
                      <p className="font-mono font-bold text-base truncate text-slate-800 group-hover:text-[#9cb4d4] transition-colors">
                        {file.mime_type === 'application/x-directory' ? '📁 ' : ''}{file.name}
                      </p>
                      <p className="text-xs text-slate-500 font-medium">
                        {file.mime_type === 'application/x-directory' 
                          ? 'Folder' 
                          : `${(file.size / 1024 / 1024).toFixed(2)} MB • ${file.mime_type}`}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      {file.mime_type !== 'application/x-directory' && (
                        <button 
                          onClick={(e) => handleDownloadAction(e, file.storage_key, file.name)}
                          className="bg-[#9cb4d4] hover:bg-[#86a1c4] text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95"
                        >
                          Download
                        </button>
                      )}

                      <button 
                        onClick={(e) => handleDeleteAction(e, file.id, file.storage_key)}
                        className="bg-white border border-[#e29393] text-[#cf6d6d] hover:bg-[#fdf3f3] text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95"
                      >
                        Delete
                      </button>
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
    </main>
  );
}