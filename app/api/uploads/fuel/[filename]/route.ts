import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export async function GET(
  _req: Request,
  { params }: { params: { filename: string } }
) {
  try {
    const filename = params.filename;
    
    // Try Railway volume first, fallback to public/uploads
    const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'fuel', filename)
      : null;
    
    const publicPath = path.join(process.cwd(), 'public', 'uploads', 'fuel', filename);
    
    let data: Buffer;
    let filePath = publicPath;
    
    if (volumePath) {
      try {
        data = await fs.readFile(volumePath);
        filePath = volumePath;
      } catch {
        // Fallback to public if volume file not found
        data = await fs.readFile(publicPath);
      }
    } else {
      data = await fs.readFile(publicPath);
    }
    
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentType = ext === 'png'
      ? 'image/png'
      : ext === 'webp'
      ? 'image/webp'
      : ext === 'gif'
      ? 'image/gif'
      : 'image/jpeg';

    return new NextResponse(data as any, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (e) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
