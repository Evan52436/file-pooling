import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../../../lib/s3";

// ============================================================================
// GET: Handles frontend requests to read the ledger/metadata
// ============================================================================
export async function GET(request: Request) {
  try {
    // NOTE: This is where your Supabase fetching logic will go
    // const { data, error } = await supabase.from('files').select('*');
    
    return NextResponse.json({ message: "Ledger route ready and listening" }, { status: 200 });
  } catch (error) {
    console.error("Ledger fetch failure:", error);
    return NextResponse.json({ error: "Failed to fetch ledger data" }, { status: 500 });
  }
}

// ============================================================================
// POST: Handles presigned S3 URLs and Ledger writes
// ============================================================================
export async function POST(request: Request) {
  // 1. Strict Infrastructure Guard
  if (!process.env.MINIO_BUCKET_NAME) {
    console.error("CRITICAL: MINIO_BUCKET_NAME environment variable is missing.");
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  // 2. Safe JSON Parsing
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return NextResponse.json({ error: "Malformed or missing JSON body" }, { status: 400 });
  }

  const { filename, contentType } = body;

  // 3. Payload Validation
  if (!filename || !contentType) {
    return NextResponse.json(
      { error: "Missing filename or contentType parameters" },
      { status: 400 }
    );
  }

  try {
    // 4. Bulletproof Extension Extraction
    const fileParts = filename.split(".");
    const fileExtension = fileParts.length > 1 ? fileParts.pop() : "bin"; // Defaults to .bin if no extension exists
    const uniqueId = crypto.randomUUID();
    const storageKey = `uploads/${uniqueId}.${fileExtension}`;

    // 5. Cryptographic Signing
    const command = new PutObjectCommand({
      Bucket: process.env.MINIO_BUCKET_NAME,
      Key: storageKey,
      ContentType: contentType,
    });

    // Authorize an upload window valid for exactly 15 minutes (900 seconds)
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    return NextResponse.json({ uploadUrl, storageKey }, { status: 200 });
  } catch (error) {
    console.error("Presigned URL generation failure:", error);
    return NextResponse.json(
      { error: "Internal Server Error during token signing" },
      { status: 500 }
    );
  }
}