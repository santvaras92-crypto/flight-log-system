import { NextResponse } from 'next/server';
import path from 'path';
import { promises as fs } from 'fs';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: { filename: string } }
) {
  const { filename } = params;
  
  // Try volume path first (Railway), then public folder
  const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
    ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'deposit', filename)
    : null;
  const publicPath = path.join(process.cwd(), 'public', 'uploads', 'deposit', filename);

  let filePath: string | null = null;
  if (volumePath) {
    try {
      await fs.access(volumePath);
      filePath = volumePath;
    } catch {
      try {
        await fs.access(publicPath);
        filePath = publicPath;
      } catch {}
    }
  } else {
    try {
      await fs.access(publicPath);
      filePath = publicPath;
    } catch {}
  }

  if (!filePath) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filename).toLowerCase();
    const contentType =
      ext === '.png' ? 'image/png' :
      ext === '.gif' ? 'image/gif' :
      ext === '.webp' ? 'image/webp' :
      'image/jpeg';

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: 'Error reading file' }, { status: 500 });
  }
}
