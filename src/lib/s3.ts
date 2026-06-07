import { S3Client } from "@aws-sdk/client-s3";

// 1. Runtime guard: Tells TypeScript these MUST exist as strings
if (!process.env.MINIO_ENDPOINT || !process.env.MINIO_ACCESS_KEY || !process.env.MINIO_SECRET_KEY) {
  throw new Error("Critical Configuration Failure: Missing MinIO environment variables in .env.local");
}

// 2. Initialize the client safely with path-style routing enabled
export const s3Client = new S3Client({
  endpoint: process.env.MINIO_ENDPOINT,
  region: "us-east-1", 
  forcePathStyle: true, 
  credentials: {
    accessKeyId: process.env.MINIO_ACCESS_KEY,
    secretAccessKey: process.env.MINIO_SECRET_KEY,
  },
});