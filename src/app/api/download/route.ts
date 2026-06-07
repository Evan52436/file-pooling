// File: src/app/api/download/route.ts
import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../../../lib/s3";

export async function POST(request: Request) {
  try {
    const { storageKey } = await request.json();

    if (!storageKey) {
      return NextResponse.json({ error: "Missing storage key" }, { status: 400 });
    }

    // Create a command to fetch the specific file
    const command = new GetObjectCommand({
      Bucket: process.env.MINIO_BUCKET_NAME!,
      Key: storageKey,
    });

    // Generate a temporary download URL valid for 60 seconds
    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    return NextResponse.json({ downloadUrl }, { status: 200 });
  } catch (error) {
    console.error("Download URL generation failed:", error);
    return NextResponse.json({ error: "Failed to generate download link" }, { status: 500 });
  }
}