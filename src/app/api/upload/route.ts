// File: src/app/api/upload/route.ts
// -------------------------------------------------------------------------
import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "@/lib/s3";

export async function POST(request: Request) {
  try {
    const { filename, contentType } = await request.json();

    if (!filename || !contentType) {
      return NextResponse.json(
        { error: "Missing filename or contentType parameters" },
        { status: 400 }
      );
    }

    // Sanitize and generate an immutable unique path within the bucket
    const fileExtension = filename.split(".").pop();
    const uniqueId = crypto.randomUUID();
    const storageKey = `uploads/${uniqueId}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: process.env.MINIO_BUCKET_NAME!,
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