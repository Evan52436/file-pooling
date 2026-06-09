import { NextResponse } from "next/server";
import { CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../../../../lib/s3";

export async function POST(request: Request) {
  if (!process.env.MINIO_BUCKET_NAME) return NextResponse.json({ error: "Missing Bucket config" }, { status: 500 });

  let body;
  try { body = await request.json(); } 
  catch { return NextResponse.json({ error: "Malformed JSON" }, { status: 400 }); }

  const { action, storageKey, uploadId, parts } = body;
  
  if (!storageKey || !uploadId) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  try {
    if (action === "abort") {
      const abortCommand = new AbortMultipartUploadCommand({
        Bucket: process.env.MINIO_BUCKET_NAME,
        Key: storageKey,
        UploadId: uploadId,
      });
      await s3Client.send(abortCommand);
      return NextResponse.json({ message: "Upload aborted" }, { status: 200 });
    }

    if (!parts || !Array.isArray(parts)) {
      return NextResponse.json({ error: "Missing parts for completion" }, { status: 400 });
    }

    // parts should be formatted as [{ PartNumber: 1, ETag: "..." }, ...]
    const completeCommand = new CompleteMultipartUploadCommand({
      Bucket: process.env.MINIO_BUCKET_NAME,
      Key: storageKey,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts },
    });

    await s3Client.send(completeCommand);
    return NextResponse.json({ message: "Upload completed" }, { status: 200 });
  } catch (error) {
    console.error("Multipart completion failed:", error);
    return NextResponse.json({ error: "Completion failed" }, { status: 500 });
  }
}
