import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { promises as fs } from 'fs';
import path from 'path';

const hasR2Config = !!(
  process.env.R2_ENDPOINT &&
  process.env.R2_BUCKET &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY
);

const r2Client = hasR2Config
  ? new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
      },
    })
  : null;

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key'); // e.g., "fuel/123456-uuid.jpg"
    
    if (!key) {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    // Try R2 first
    if (r2Client && process.env.R2_BUCKET) {
      try {
        const command = new GetObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
        });

        const response = await r2Client.send(command);
        
        if (response.Body) {
          const chunks: Uint8Array[] = [];
          for await (const chunk of response.Body as any) {
            chunks.push(chunk);
          }
          const buffer = Buffer.concat(chunks);

          // Determine content type from key extension
          const ext = key.split('.').pop()?.toLowerCase();
          const contentType = 
            ext === 'png' ? 'image/png' :
            ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
            ext === 'webp' ? 'image/webp' :
            ext === 'pdf' ? 'application/pdf' :
            'application/octet-stream';

          return new NextResponse(buffer, {
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        }
      } catch (r2Error) {
        console.error('R2 fetch failed:', r2Error);
        // Fall through to local storage
      }
    }

    // Fallback to local storage
    const filename = key.split('/').pop();
    if (!filename) {
      return NextResponse.json({ error: 'Invalid key format' }, { status: 400 });
    }

    const subdir = key.startsWith('fuel/') ? 'fuel' : 'deposit';
    
    const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
      ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, subdir, filename)
      : null;
    
    const publicPath = path.join(process.cwd(), 'public', 'uploads', subdir, filename);
    
    let data: Buffer;
    
    if (volumePath) {
      try {
        data = await fs.readFile(volumePath);
      } catch {
        data = await fs.readFile(publicPath);
      }
    } else {
      data = await fs.readFile(publicPath);
    }
    
    const ext = filename.split('.').pop()?.toLowerCase();
    const contentType = 
      ext === 'png' ? 'image/png' :
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'webp' ? 'image/webp' :
      ext === 'pdf' ? 'application/pdf' :
      'application/octet-stream';

    return new NextResponse(new Uint8Array(data), {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error('Error serving image:', error);
    return NextResponse.json(
      { error: 'Image not found' },
      { status: 404 }
    );
  }
}
