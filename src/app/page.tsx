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

interface PreviewState {
  url: string;
  type: string;
  name: string;
}

export default function DriveDashboard() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  // New state to control the in-app preview modal
  const [previewData, setPreviewData] = useState<PreviewState | null>(null);

  useEffect(() => {
    fetchFiles();
  }, []);

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

  const handleFileSelection = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      setUploadProgress(10);

      const handshakeResponse = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: selectedFile.name, contentType: selectedFile.type }),
      });

      if (!handshakeResponse.ok) throw new Error("Handshake failed");
      const { uploadUrl, storageKey } = await handshakeResponse.json();
      setUploadProgress(40);

      const uploadResponse = await fetch(uploadUrl, {
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
          storageKey: storageKey,
        }),
      });

      if (!metadataResponse.ok) throw new Error("Ledger failed");
      
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

  // 1. The Row Click (In-App Modal Preview)
  const handlePreviewRowClick = async (file: FileRecord) => {
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey: file.storage_key, action: "preview" }),
      });

      if (!res.ok) throw new Error("Failed to get preview link");
      const { downloadUrl } = await res.json();
      
      // Instead of opening a tab, we set the state to trigger our beautiful UI modal
      setPreviewData({
        url: downloadUrl,
        type: file.mime_type,
        name: file.name
      });
    } catch (error) {
      console.error("Preview failed:", error);
      alert("Failed to load preview.");
    }
  };

 // 2. The Download Click (Direct Intercept Hack)
  const handleDownloadAction = async (e: React.MouseEvent, storageKey: string, filename: string) => {
    e.stopPropagation(); // Stops the preview modal from opening

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey, action: "download", filename }),
      });

      if (!res.ok) throw new Error("Failed to get download link");
      const { downloadUrl } = await res.json();
      
      // Because the backend now perfectly formats the Content-Disposition header,
      // window.location.assign will trigger a silent download without leaving the page.
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

  return (
    <main className="min-h-screen bg-[#f0f4f8] text-slate-900 p-8 font-sans selection:bg-[#9cb4d4] selection:text-white">
      <div className="max-w-4xl mx-auto space-y-8 mt-12 relative">
        
        <header className="border-b border-slate-200 pb-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Decoupled Object Storage</h1>
        </header>

        <section className="bg-white shadow-sm border border-slate-200 rounded-2xl p-6 flex flex-col items-center justify-center border-dashed relative overflow-hidden transition-all hover:border-[#9cb4d4]">
          {isUploading ? (
            <div className="w-full space-y-4 text-center py-4">
              <span className="text-sm font-bold text-[#6a87aa]">Streaming Data Payload... {uploadProgress}%</span>
              <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-[#9cb4d4] h-full rounded-full transition-all duration-300 ease-out" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          ) : (
            <label className="cursor-pointer text-center p-6 w-full">
              <span className="text-slate-800 block text-xl font-bold mb-2">Select File to Upload</span>
              <span className="text-slate-500 text-sm block">Payload bypasses serverless functions and streams direct to disk</span>
              <input type="file" className="hidden" onChange={handleFileSelection} />
            </label>
          )}
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">Storage Node Matrix</h2>
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
                    onClick={() => handlePreviewRowClick(file)}
                    className="p-5 flex items-center justify-between text-sm hover:bg-slate-50 transition-colors duration-200 cursor-pointer group"
                    title="Click to Preview"
                  >
                    <div className="space-y-1 max-w-[50%]">
                      <p className="font-mono font-bold text-base truncate text-slate-800 group-hover:text-[#9cb4d4] transition-colors">{file.name}</p>
                      <p className="text-xs text-slate-500 font-medium">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • {file.mime_type}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <button 
                        onClick={(e) => handleDownloadAction(e, file.storage_key, file.name)}
                        className="bg-[#9cb4d4] hover:bg-[#86a1c4] text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95"
                      >
                        Download
                      </button>

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
          onClick={() => setPreviewData(null)} // Clicking the dark background closes it
        >
          <div 
            className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()} // Prevents clicks inside the modal from closing it
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-mono font-bold text-slate-800 truncate pr-4">{previewData.name}</h3>
              <button 
                onClick={() => setPreviewData(null)}
                className="text-slate-400 hover:text-slate-700 bg-white border border-slate-200 px-3 py-1 rounded-md text-sm font-bold transition-colors"
              >
                Close
              </button>
            </div>

            {/* Modal Content / Rendering Engine */}
            <div className="flex-1 bg-[#f8fafc] overflow-auto flex items-center justify-center p-4">
              {previewData.type.startsWith('image/') ? (
                <img src={previewData.url} alt={previewData.name} className="max-w-full max-h-full object-contain rounded-md shadow-sm" />
              ) : previewData.type.startsWith('audio/') ? (
                <audio src={previewData.url} controls className="w-full max-w-md" />
              ) : previewData.type.startsWith('video/') ? (
                <video src={previewData.url} controls className="max-w-full max-h-full rounded-md shadow-sm" />
              ) : (
                // Fallback for PDFs, text files, and documents
                <iframe src={previewData.url} className="w-full h-full border-0 bg-white rounded-md shadow-sm" title="Document Preview" />
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}