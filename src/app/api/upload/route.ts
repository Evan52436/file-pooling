import { NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3Client } from "../../../lib/s3";

export async function POST(request: Request) {
  if (!process.env.MINIO_BUCKET_NAME) return NextResponse.json({ error: "Missing Bucket config" }, { status: 500 });

  let body;
  try { body = await request.json(); } 
  catch (e) { return NextResponse.json({ error: "Malformed JSON" }, { status: 400 }); }

  const { filename, contentType } = body;
  if (!filename || !contentType) return NextResponse.json({ error: "Missing params" }, { status: 400 });

  try {
    const fileParts = filename.split(".");
    const fileExtension = fileParts.length > 1 ? fileParts.pop() : "bin";
    const uniqueId = crypto.randomUUID();
    const storageKey = `uploads/${uniqueId}.${fileExtension}`;

    const command = new PutObjectCommand({
      Bucket: process.env.MINIO_BUCKET_NAME,
      Key: storageKey,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
    return NextResponse.json({ uploadUrl, storageKey }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: "Token signing failed" }, { status: 500 });
  }
}