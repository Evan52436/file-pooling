// File: src/lib/s3.ts
// -------------------------------------------------------------------------
import { S3Client } from "@aws-sdk/client-s3";

const globalForS3 = global as unknown as { s3Client: S3Client };

export const s3Client =
  globalForS3.s3Client ||
  new S3Client({
    region: "us-east-1", // Mandatory parameter for AWS SDK, safely ignored by MinIO
    endpoint: process.env.MINIO_ENDPOINT,
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    forcePathStyle: true, // CRITICAL: Forces SDK to use domain.com/bucket instead of bucket.domain.com
  });

if (process.env.NODE_ENV !== "production") globalForS3.s3Client = s3Client;