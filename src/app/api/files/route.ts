import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// CRITICAL: Tells Vercel NEVER to statically cache this route during the build phase
export const dynamic = 'force-dynamic'; 

// Safely pull variables without crashing the compiler
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

// Only initialize if the keys actually exist to prevent build-time panics
const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;

export async function GET(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  
  try {
    const { data, error } = await supabase.from("files").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch ledger" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 500 });

  try {
    const body = await request.json();
    const { name, size, mimeType, storageKey } = body;

    if (!name || !storageKey) return NextResponse.json({ error: "Missing ledger data" }, { status: 400 });

    const { error } = await supabase.from("files").insert([
      { name, size, mime_type: mimeType, storage_key: storageKey }
    ]);
    
    if (error) throw error;
    return NextResponse.json({ message: "Ledger updated successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Ledger recording failed" }, { status: 500 });
  }
}