import { NextResponse } from "next/server";
import { PutObjectCommand, CreateMultipartUploadCommand, UploadPartCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../../../lib/s3";

const CHUNK_SIZE = 50 * 1024 * 1024; // 50MB

export async function POST(request: Request) {
  if (!process.env.MINIO_BUCKET_NAME) return NextResponse.json({ error: "Missing Bucket config" }, { status: 500 });

  let body;
  try { body = await request.json(); } 
  catch { return NextResponse.json({ error: "Malformed JSON" }, { status: 400 }); }

  const { filename, contentType, fileSize } = body;
  if (!filename || !contentType || fileSize === undefined) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  try {
    const fileParts = filename.split(".");
    const fileExtension = fileParts.length > 1 ? fileParts.pop() : "bin";
    const uniqueId = crypto.randomUUID();
    const storageKey = `uploads/${uniqueId}.${fileExtension}`;

    if (fileSize > CHUNK_SIZE) {
      // MULTIPART UPLOAD PATH
      const createCommand = new CreateMultipartUploadCommand({
        Bucket: process.env.MINIO_BUCKET_NAME,
        Key: storageKey,
        ContentType: contentType,
      });

      const multipartUpload = await s3Client.send(createCommand);
      const uploadId = multipartUpload.UploadId;

      if (!uploadId) throw new Error("Failed to initialize multipart upload");

      const numParts = Math.ceil(fileSize / CHUNK_SIZE);
      const partUrls = [];

      for (let i = 1; i <= numParts; i++) {
        const partCommand = new UploadPartCommand({
          Bucket: process.env.MINIO_BUCKET_NAME,
          Key: storageKey,
          UploadId: uploadId,
          PartNumber: i,
        });
        const url = await getSignedUrl(s3Client, partCommand, { expiresIn: 3600 }); // 1 hour for large files
        partUrls.push(url);
      }

      return NextResponse.json({ uploadId, storageKey, partUrls, chunkSize: CHUNK_SIZE }, { status: 200 });

    } else {
      // STANDARD UPLOAD PATH
      const command = new PutObjectCommand({
        Bucket: process.env.MINIO_BUCKET_NAME,
        Key: storageKey,
        ContentType: contentType,
      });

      const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
      return NextResponse.json({ uploadUrl, storageKey }, { status: 200 });
    }
  } catch (error) {
    console.error("Upload initiation failed:", error);
    return NextResponse.json({ error: "Upload initiation failed" }, { status: 500 });
  }
}