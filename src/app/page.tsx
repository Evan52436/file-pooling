// File: src/app/page.tsx
// -------------------------------------------------------------------------
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

  // Fetch the file ledger index when the browser interface mounts
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

      // STAGE 1: Handshake requesting temporary upload permission ticket from Vercel (/api/upload)
      const handshakeResponse = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: selectedFile.name,
          contentType: selectedFile.type,
        }),
      });

      if (!handshakeResponse.ok) throw new Error("Handshake authorization failed");
      const { uploadUrl, storageKey } = await handshakeResponse.json();
      setUploadProgress(40);

      // STAGE 2: Direct Binary streaming down Cloudflare tunnel straight into your NAS
      const uploadResponse = await fetch(uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": selectedFile.type },
        body: selectedFile,
      });

      if (!uploadResponse.ok) throw new Error("Binary transfer to NAS failed");
      setUploadProgress(70);

      // STAGE 3: Commit the metadata entry into the remote Supabase ledger (/api/files)
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
        fetchFiles(); // Re-render the folder panel view
      }, 800);

    } catch (error) {
      console.error("Pipeline failure executed:", error);
      alert("Upload pipeline crashed. Check terminal network execution trace.");
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handleDownload = async (storageKey: string) => {
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey }),
      });

      if (!res.ok) throw new Error("Failed to get download link");
      
      const { downloadUrl } = await res.json();
      
      // Force the browser to securely open/download the file from MinIO
      window.open(downloadUrl, "_blank");
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to securely fetch the file.");
    }
  };

  return (
    <main className="min-h-screen bg-[#f0f4f8] text-slate-900 p-8 font-sans selection:bg-[#9cb4d4] selection:text-white">
      <div className="max-w-4xl mx-auto space-y-8 mt-12">
        
        {/* Header Dashboard Status */}
        <header className="border-b border-slate-200 pb-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-slate-900">Decoupled Object Storage</h1>
          <p className="text-[#7c93af] font-medium text-sm mt-2">Vercel Pipeline ⚡ Cloudflare Tunnel 🕳️ Home Server NAS</p>
        </header>

        {/* Upload Control Center */}
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

        {/* Storage Drive Ledger Display */}
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
                  <li key={file.id} className="p-5 flex items-center justify-between text-sm hover:bg-slate-50 transition-colors duration-200">
                    <div className="space-y-1 max-w-[55%]">
                      <p className="font-mono font-bold text-base truncate text-slate-800">{file.name}</p>
                      <p className="text-xs text-slate-500 font-medium">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • {file.mime_type}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <span className="text-xs font-mono bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200 text-slate-500 select-all truncate max-w-[150px]" title={file.storage_key}>
                        {file.storage_key.split('/').pop()} {/* Only shows the UUID file name for cleaner UI */}
                      </span>
                      
                      <button 
                        onClick={() => handleDownload(file.storage_key)}
                        className="bg-[#9cb4d4] hover:bg-[#86a1c4] text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95"
                      >
                        Download
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