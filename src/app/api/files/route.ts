// src/app/api/files/route.ts
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../../../lib/s3";

// 1. GET handler for fetching files
export async function GET(request: Request) {
  try {
    // Add your Supabase/Database fetching logic here
    return NextResponse.json({ message: "Fetched files successfully" }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to fetch" }, { status: 500 });
  }
}

// 2. POST handler for generating the upload URL
export async function POST(request: Request) {
  try {
    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const fileExtension = filename.split(".").pop();
    const uniqueId = crypto.randomUUID();
    const storageKey = `uploads/${uniqueId}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: process.env.MINIO_BUCKET_NAME!,
      Key: storageKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    return NextResponse.json({ uploadUrl, storageKey }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}