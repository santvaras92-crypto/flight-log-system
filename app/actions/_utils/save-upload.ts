'use server';

import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { uploadToR2 } from '@/lib/r2-storage';

// Plain upload payload (base64 string only)
export interface PlainUpload {
  name: string;
  base64: string; // raw base64 WITHOUT data url prefix
}

export async function saveUpload(file: PlainUpload, subdir: 'fuel' | 'deposit') {
  const buf = Buffer.from(file.base64, 'base64');
  const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
  const name = `${Date.now()}-${randomUUID()}.${ext}`;
  const key = `${subdir}/${name}`;
  
  // Detect content type
  const contentTypeMap: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    pdf: 'application/pdf',
  };
  const contentType = contentTypeMap[ext] || 'application/octet-stream';

  // Always save to local storage first (Railway volume for persistence)
  const baseDir = process.env.RAILWAY_VOLUME_MOUNT_PATH 
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, subdir)
    : path.join(process.cwd(), 'public', 'uploads', subdir);
  
  await fs.mkdir(baseDir, { recursive: true });
  const full = path.join(baseDir, name);
  await fs.writeFile(full, buf);
  console.log(`[Local] Saved to ${full}`);

  // Try R2 upload in background (non-blocking)
  uploadToR2({ key, contentType, body: buf })
    .then(success => {
      if (success) {
        console.log(`[R2] Also uploaded ${key}`);
      } else {
        console.log(`[R2] Upload failed for ${key}, local copy exists`);
      }
    })
    .catch(err => {
      console.error(`[R2] Error uploading ${key}:`, err.message);
    });

  // Return API endpoint URL that will serve from local or R2
  return `/api/uploads/fuel-image?key=${encodeURIComponent(key)}`;
}
