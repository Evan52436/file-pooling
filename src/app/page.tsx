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
      console.error("Pipeline failure executed:", error);
      alert("Upload pipeline crashed. Check terminal network execution trace.");
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handlePreview = async (storageKey: string) => {
    try {
      const res = await fetch("/api/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storageKey }),
      });

      if (!res.ok) throw new Error("Failed to get preview link");
      const { downloadUrl } = await res.json();
      
      // Opens the presigned URL. Browsers natively preview images, audio, and PDFs.
      window.open(downloadUrl, "_blank");
    } catch (error) {
      console.error("Preview failed:", error);
      alert("Failed to securely fetch the file.");
    }
  };

  const handleDelete = async (id: string, storageKey: string) => {
    if (!window.confirm("Are you sure you want to permanently delete this file?")) return;
    
    try {
      const res = await fetch("/api/files", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, storageKey }),
      });

      if (!res.ok) throw new Error("Deletion failed");
      
      // Instantly refresh the UI to remove the deleted file
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
          {/* Subtitle successfully removed as requested */}
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
                  <li key={file.id} className="p-5 flex items-center justify-between text-sm hover:bg-slate-50 transition-colors duration-200">
                    <div className="space-y-1 max-w-[50%]">
                      <p className="font-mono font-bold text-base truncate text-slate-800">{file.name}</p>
                      <p className="text-xs text-slate-500 font-medium">
                        {(file.size / 1024 / 1024).toFixed(2)} MB • {file.mime_type}
                      </p>
                    </div>
                    
                    <div className="flex items-center gap-3">
                      <span className="hidden sm:inline-block text-xs font-mono bg-slate-100 px-3 py-1.5 rounded-md border border-slate-200 text-slate-500 truncate max-w-[120px]" title={file.storage_key}>
                        {file.storage_key.split('/').pop()}
                      </span>
                      
                      <button 
                        onClick={() => handlePreview(file.storage_key)}
                        className="bg-[#9cb4d4] hover:bg-[#86a1c4] text-white text-xs font-bold py-2 px-4 rounded-lg transition-colors shadow-sm active:scale-95"
                      >
                        Preview
                      </button>

                      <button 
                        onClick={() => handleDelete(file.id, file.storage_key)}
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