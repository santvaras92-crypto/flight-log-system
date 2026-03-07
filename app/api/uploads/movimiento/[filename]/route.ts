import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { r2Client } from '@/lib/r2-storage';

async function streamToBuffer(stream: any) {
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
}

export async function GET(
    request: NextRequest,
    { params }: { params: { filename: string } }
) {
    try {
        const filename = params.filename;
        if (!filename) {
            return NextResponse.json({ error: 'Missing filename' }, { status: 400 });
        }

        const ext = filename.split('.').pop()?.toLowerCase();
        const contentType =
            ext === 'png' ? 'image/png' :
                ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
                    ext === 'webp' ? 'image/webp' :
                        ext === 'pdf' ? 'application/pdf' :
                            'application/octet-stream';

        const r2Key = `movimientos/${filename}`;

        // Try R2 first
        if (r2Client && process.env.R2_BUCKET) {
            try {
                const object = await r2Client.send(new GetObjectCommand({
                    Bucket: process.env.R2_BUCKET,
                    Key: r2Key,
                }));

                if (object.Body) {
                    const data = await streamToBuffer(object.Body);
                    return new NextResponse(new Uint8Array(data), {
                        headers: {
                            'Content-Type': contentType,
                            'Cache-Control': 'public, max-age=31536000, immutable',
                        },
                    });
                }
            } catch {
                // Fallback to local
            }
        }

        // Try Railway volume
        const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
            ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, 'movimientos', filename)
            : null;

        const publicPath = path.join(process.cwd(), 'public', 'uploads', 'movimientos', filename);

        let data: Buffer | null = null;

        if (volumePath) {
            try {
                data = await fs.readFile(volumePath);
            } catch { }
        }

        if (!data) {
            try {
                data = await fs.readFile(publicPath);
            } catch { }
        }

        if (data) {
            return new NextResponse(new Uint8Array(data), {
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': 'public, max-age=31536000, immutable',
                },
            });
        }

        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    } catch (error: any) {
        console.error('Error serving movimiento attachment:', error);
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
}
