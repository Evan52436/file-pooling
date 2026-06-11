// File: src/app/api/files/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../../../lib/s3";
import { sha256 } from "../../../lib/hash";

export const dynamic = 'force-dynamic'; 

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

// READ: Fetch all files for the UI
export async function GET() {
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  try {
    const { data, error } = await supabase.from("files").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json(data, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Failed to fetch ledger" }, { status: 500 });
  } 
}

// CREATE: Write new file metadata to the ledger
export async function POST(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  try {
    const body = await request.json();
    const { name, size, mimeType, storageKey, parentFolder, uploaderName, password, expiresAt } = body;

    const isFolder = mimeType === "application/x-directory";
    if (!name || !storageKey || (!isFolder && !uploaderName)) {
      return NextResponse.json({ error: "Missing required ledger data" }, { status: 400 });
    }

    let hashedPassword = undefined;
    if (password) {
      hashedPassword = await sha256(password);
    }

    const insertData: any = { 
      name, 
      size, 
      mime_type: mimeType, 
      storage_key: storageKey, 
      parent_folder: parentFolder || "/"
    };
    
    if (uploaderName) insertData.uploader_name = uploaderName.trim();
    if (hashedPassword) insertData.password = hashedPassword;
    if (expiresAt) insertData.expires_at = expiresAt;

    const { error } = await supabase.from("files").insert([insertData]);
    
    if (error) throw error;
    return NextResponse.json({ message: "Ledger updated successfully" }, { status: 200 });
  } catch {
    return NextResponse.json({ error: "Ledger recording failed" }, { status: 500 });
  }
}

// DELETE: Erase from MinIO and remove from Ledger
export async function DELETE(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  try {
    const { id, storageKey } = await request.json();
    
    if (!id || !storageKey) return NextResponse.json({ error: "Missing deletion parameters" }, { status: 400 });

    // 1. Erase the binary payload from MinIO
    if (process.env.MINIO_BUCKET_NAME) {
      const command = new DeleteObjectCommand({
        Bucket: process.env.MINIO_BUCKET_NAME,
        Key: storageKey,
      });
      // We use .catch so that if the file is already missing in MinIO (ghost file), it doesn't crash the Supabase cleanup
      await s3Client.send(command).catch(err => console.warn("MinIO file already missing:", err));
    }

    // 2. Erase the metadata record from Supabase
    const { error } = await supabase.from("files").delete().eq("id", id);
    if (error) throw error;

    return NextResponse.json({ message: "File obliterated from matrix" }, { status: 200 });
  } catch (error) {
    console.error("Deletion sequence failed:", error);
    return NextResponse.json({ error: "Deletion failed" }, { status: 500 });
  }
}

// UPDATE: Rename file or folder or set password
export async function PATCH(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  try {
    const { id, newName, password } = await request.json();
    if (!id || (!newName && password === undefined)) return NextResponse.json({ error: "Missing update parameters" }, { status: 400 });

    const updateData: any = {};
    if (newName) updateData.name = newName;
    if (password !== undefined) updateData.password = password ? await sha256(password) : "";

    const { error } = await supabase.from("files").update(updateData).eq("id", id);
    if (error) throw error;

    return NextResponse.json({ message: "Update successful" }, { status: 200 });
  } catch (error) {
    console.error("Update failed:", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}