// File: src/app/api/download/route.ts
import { NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../../../lib/s3";

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { storageKey, action, filename } = await request.json();

    if (!storageKey) {
      return NextResponse.json({ error: "Missing storage key" }, { status: 400 });
    }

    const commandParams: any = {
      Bucket: process.env.MINIO_BUCKET_NAME!,
      Key: storageKey,
    };

    // If "download", inject the bulletproof RFC 5987 HTTP header
    if (action === "download" && filename) {
      // Safely encode spaces and special characters
      const safeName = encodeURIComponent(filename);
      // Forces the browser to save it to disk with the EXACT original name
      commandParams.ResponseContentDisposition = `attachment; filename="${safeName}"; filename*=UTF-8''${safeName}`;
    }

    const command = new GetObjectCommand(commandParams);
    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 60 });

    return NextResponse.json({ downloadUrl }, { status: 200 });
  } catch (error) {
    console.error("URL generation failed:", error);
    return NextResponse.json({ error: "Failed to generate link" }, { status: 500 });
  }
}