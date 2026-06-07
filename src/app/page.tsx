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

      // STAGE 1: Handshake requesting temporary upload permission ticket from Vercel
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

      // STAGE 3: Commit the metadata entry into the remote Supabase ledger
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

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-8 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header Dashboard Status */}
        <header className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-extrabold tracking-tight">Decoupled Object Storage</h1>
          <p className="text-slate-400 text-sm mt-1">Vercel Pipeline ⚡ Cloudflare Tunnel 🕳️ Home Server NAS</p>
        </header>

        {/* Upload Control Center */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-6 flex flex-col items-center justify-center border-dashed relative overflow-hidden">
          {isUploading ? (
            <div className="w-full space-y-4 text-center py-4">
              <span className="text-sm font-semibold text-emerald-400">Streaming Data Payload... {uploadProgress}%</span>
              <div className="w-full bg-slate-800 rounded-full h-2">
                <div className="bg-emerald-500 h-2 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
              </div>
            </div>
          ) : (
            <label className="cursor-pointer text-center p-4 w-full">
              <span className="text-slate-300 block text-lg font-medium mb-1">Select File to Upload</span>
              <span className="text-slate-500 text-xs block">Payload bypasses serverless functions and streams direct to disk</span>
              <input type="file" className="hidden" onChange={handleFileSelection} />
            </label>
          )}
        </section>

        {/* Storage Drive Ledger Display */}
        <section className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-slate-300">Storage Node Matrix</h2>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            {files.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-sm">No metadata tracks verified in Supabase ledger index.</div>
            ) : (
              <ul className="divide-y divide-slate-800">
                {files.map((file) => (
                  <li key={file.id} className="p-4 flex items-center justify-between text-sm hover:bg-slate-850/50 transition">
                    <div className="space-y-1 max-w-[70%]">
                      <p className="font-mono font-medium truncate text-slate-200">{file.name}</p>
                      <p className="text-xs text-slate-500 font-sans">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • {file.mime_type}
                      </p>
                    </div>
                    <span className="text-xs font-mono bg-slate-800 px-2.5 py-1 rounded border border-slate-700 text-slate-400 select-all truncate max-w-[200px]">
                      {file.storage_key}
                    </span>
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