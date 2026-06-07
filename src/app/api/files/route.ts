// File: src/app/api/files/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Initialize the Supabase client using environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  try {
    // Fetch all files from the 'files' table, newest first
    const { data, error } = await supabase.from("files").select("*").order("created_at", { ascending: false });
    
    if (error) throw error;
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error("Ledger read error:", error);
    return NextResponse.json({ error: "Failed to fetch ledger" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { name, size, mimeType, storageKey } = body;

    if (!name || !storageKey) {
      return NextResponse.json({ error: "Missing ledger data" }, { status: 400 });
    }

    // Insert the metadata record into Supabase
    const { error } = await supabase.from("files").insert([
      { name, size, mime_type: mimeType, storage_key: storageKey }
    ]);
    
    if (error) throw error;
    return NextResponse.json({ message: "Ledger updated successfully" }, { status: 200 });
  } catch (error) {
    console.error("Ledger write error:", error);
    return NextResponse.json({ error: "Ledger recording failed" }, { status: 500 });
  }
}