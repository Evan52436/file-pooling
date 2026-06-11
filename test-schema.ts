import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = fs.readFileSync(".env.local", "utf-8");
const envMap = Object.fromEntries(
  env.split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => {
      const idx = line.indexOf("=");
      return [line.substring(0, idx), line.substring(idx + 1)];
    })
);

const supabaseUrl = envMap["NEXT_PUBLIC_SUPABASE_URL"] || "";
const supabaseKey = envMap["SUPABASE_SERVICE_ROLE_KEY"] || "";

const supabase = createClient(supabaseUrl, supabaseKey);

async function test() {
  const { data, error } = await supabase.from("files").insert([
    {
      name: "test.txt",
      size: 0,
      mime_type: "text/plain",
      storage_key: "test",
      parent_folder: "/",
      uploader_name: "test"
    }
  ]).select();
  console.log("Error:", error);
  console.log("Data:", data);
  if (!error) {
    await supabase.from("files").delete().eq("storage_key", "test");
  }
}

test();
