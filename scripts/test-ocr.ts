#!/usr/bin/env -S node --import tsx

import "dotenv/config";
import { extractMeterValue, extractBothMeters } from "@/lib/ocr-service";
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv: string[]) {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      args[key] = val;
    }
  }
  return args;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY not set in environment");
    process.exit(1);
  }

  const args = parseArgs(process.argv.slice(2));

  const hobbsUrl = args["hobbs"];
  const tachUrl = args["tach"];
  const single = args["single"];
  const filePath = args["file"]; // local file path for single image
  const type = (args["type"] as "HOBBS" | "TACH") || "HOBBS";

  try {
    if (filePath) {
      const abs = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase().replace(".", "");
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const dataUrl = `data:${mime};base64,${buf.toString("base64")}`;
      const res = await extractMeterValue(dataUrl, type);
      console.log(JSON.stringify({ ok: true, mode: "file", type, result: res }, null, 2));
      return;
    }

    if (hobbsUrl && tachUrl) {
      const res = await extractBothMeters(hobbsUrl, tachUrl);
      console.log(JSON.stringify({ ok: true, mode: "both", result: res }, null, 2));
      return;
    }

    if (single) {
      const res = await extractMeterValue(single, type);
      console.log(JSON.stringify({ ok: true, mode: "single", type, result: res }, null, 2));
      return;
    }

    console.error(
      "Usage: tsx scripts/test-ocr.ts --single <imageUrl> [--type HOBBS|TACH] OR --hobbs <url> --tach <url> OR --file <localPath> [--type HOBBS|TACH]"
    );
    process.exit(2);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({ ok: false, error: message }));
    process.exit(1);
  }
}

main();
