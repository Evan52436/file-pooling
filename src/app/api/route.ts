// File: src/app/api/files/route.ts
// -------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize the Supabase Client dynamically using the Database environment variables
const supabaseUrl = process.env.DATABASE_URL ? "https://" + process.env.DATABASE_URL.split("@")[1]?.split(":")[0] : "";
// Note: Alternatively, replace with your exact standard SUPABASE_URL and SUPABASE_ANON_KEY 
// if you prefer using the standard client initialization.
const supabase = createClient(supabaseUrl, "your-supabase-anon-key-here");

export async function GET(request: Request) {
  try {
    // Queries the database tracking table for records ordered by upload time
    const { data: files, error } = await supabase
      .from("files")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json(files, { status: 200 });
  } catch (error) {
    console.error("Database selection error:", error);
    return NextResponse.json({ error: "Failed to fetch file records" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, size, mimeType, storageKey } = await request.json();

    if (!name || !size || !mimeType || !storageKey) {
      return NextResponse.json({ error: "Missing metadata attributes" }, { status: 400 });
    }

    // Insert the tracking data directly into the Postgres ledger
    const { data, error } = await supabase
      .from("files")
      .insert([{ name, size, mime_type: mimeType, storage_key: storageKey }])
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("Database mutation error:", error);
    return NextResponse.json({ error: "Failed to record file metadata" }, { status: 500 });
  }
}