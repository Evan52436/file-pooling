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

export default function DriveDashboard() {
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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

      if (!handshakeResponse.ok) throw new Error("Handshake authorization failed");
      const { uploadUrl, storageKey } = await handshakeResponse.json();
      setUploadProgress(40);

      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": selectedFile.type },
        body: selectedFile,
      });

      if (!uploadResponse.ok) throw new Error("Binary transfer to NAS failed");
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

      if (!metadataResponse.ok) throw new Error("Ledger recording failed");
      
      setUploadProgress(100);
      setTimeout(() => {
        setIsUploading(false);
        setUploadProgress(0);
        fetchFiles(); 
      }, 800);

    } catch (error) {
      console.error("Pipeline failure:", error);
      alert("Upload pipeline crashed. Check console.");
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  // 1. The Row Click (Preview Action)
  const handlePreviewRowClick = async (storageKey: string) => {
    // Open a blank tab instantly to bypass pop-up blockers
    const previewTab = window.open('about:blank', '_blank');
    if (!previewTab) {
      alert("Please allow pop-ups to preview files.");
      return;
    }

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey, action: "preview" }),
      });

      if (!res.ok) throw new Error("Failed to get preview link");
      const { downloadUrl } = await res.json();
      
      // Redirect the blank tab to the actual file
      previewTab.location.href = downloadUrl;
    } catch (error) {
      console.error("Preview failed:", error);
      previewTab.close();
      alert("Failed to preview the file.");
    }
  };

  // 2. The Specific Button Click (Download Action)
  const handleDownloadAction = async (e: React.MouseEvent, storageKey: string, filename: string) => {
    e.stopPropagation(); // Stops the row's preview click from firing

    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey, action: "download", filename }),
      });

      if (!res.ok) throw new Error("Failed to get download link");
      const { downloadUrl } = await res.json();
      
      // Force background download
      window.location.href = downloadUrl;
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to download the file.");
    }
  };

  // 3. The Specific Button Click (Delete Action)
  const handleDeleteAction = async (e: React.MouseEvent, id: string, storageKey: string) => {
    e.stopPropagation(); // Stops the row's preview click from firing
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
      <div className="max-w-4xl mx-auto space-y-8 mt-12">
        
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
                    onClick={() => handlePreviewRowClick(file.storage_key)}
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
                      <span className="hidden sm:inline-block text-xs font-mono bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200 text-slate-500 truncate max-w-[120px]" title={file.storage_key}>
                        {file.storage_key.split('/').pop()}
                      </span>
                      
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
    </main>
  );
}