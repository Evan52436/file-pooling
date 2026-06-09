import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "../../../../lib/s3";
import { ZipArchive } from "archiver";
import { PassThrough } from "stream";

export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// Helper to recursively find all files in a folder
const getAllNestedFiles = (allFiles: any[], folderId: string, currentPath: string = "") => {
  let result: { file: any, path: string }[] = [];
  const children = allFiles.filter(f => f.parent_folder === folderId);
  
  for (const child of children) {
    if (child.mime_type === "application/x-directory") {
      result = result.concat(getAllNestedFiles(allFiles, child.id, `${currentPath}${child.name}/`));
    } else {
      result.push({ file: child, path: `${currentPath}${child.name}` });
    }
  }
  return result;
};

export async function GET(request: Request) {
  if (!supabase) return NextResponse.json({ error: "Database not configured" }, { status: 500 });
  
  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("id");
  const folderName = searchParams.get("name") || "folder";

  if (!folderId) return NextResponse.json({ error: "Missing folder id" }, { status: 400 });

  try {
    // 1. Fetch all files to build the tree in memory (efficient enough for normal use cases)
    const { data: allFiles, error } = await supabase.from("files").select("*");
    if (error) throw error;

    // 2. Recursively find all files under the given folderId
    const filesToDownload = getAllNestedFiles(allFiles, folderId, "");

    // 3. Prepare ZIP Stream using archiver
    const passThrough = new PassThrough();
    const archive = new ZipArchive({ zlib: { level: 5 } });

    // Handle archiver errors
    archive.on("error", (err) => {
      console.error("Archiver error:", err);
      passThrough.destroy(err);
    });

    archive.pipe(passThrough);

    // 4. Fetch each file from MinIO and append to ZIP
    for (const item of filesToDownload) {
      if (!process.env.MINIO_BUCKET_NAME) continue;

      const command = new GetObjectCommand({
        Bucket: process.env.MINIO_BUCKET_NAME,
        Key: item.file.storage_key,
      });

      try {
        const minioRes = await s3Client.send(command);
        if (minioRes.Body) {
          // In AWS SDK v3, Body is typically a Readable stream in Node.js. Cast to any to bypass TS compilation constraints on web types.
          archive.append(minioRes.Body as any, { name: item.path });
        }
      } catch (err) {
        console.warn(`Could not fetch file ${item.file.name} from MinIO:`, err);
        // Continue zipping other files
      }
    }

    // Finalize the archive (this will end the passThrough stream)
    archive.finalize();

    // 5. Convert PassThrough to Web ReadableStream
    const readableStream = new ReadableStream({
      start(controller) {
        passThrough.on("data", (chunk) => controller.enqueue(chunk));
        passThrough.on("end", () => controller.close());
        passThrough.on("error", (err) => controller.error(err));
      }
    });

    // 6. Return response
    const safeName = encodeURIComponent(folderName);
    return new NextResponse(readableStream, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${safeName}.zip"; filename*=UTF-8''${safeName}.zip`,
      },
    });

  } catch (error) {
    console.error("Folder download failed:", error);
    return NextResponse.json({ error: "Folder download failed" }, { status: 500 });
  }
}
