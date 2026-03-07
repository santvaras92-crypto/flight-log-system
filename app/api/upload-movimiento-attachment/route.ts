import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { promises as fs } from 'fs';
import path from 'path';
import { uploadToR2 } from '@/lib/r2-storage';

/**
 * POST /api/upload-movimiento-attachment
 * Uploads a file attachment for a bank movement.
 * FormData: { file: File, correlativo: string }
 */
export async function POST(req: NextRequest) {
    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const correlativo = formData.get('correlativo') as string | null;

        if (!file || !correlativo) {
            return NextResponse.json({ ok: false, error: 'file y correlativo son requeridos' }, { status: 400 });
        }

        // Validate file size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
            return NextResponse.json({ ok: false, error: 'Archivo muy grande (máx 10MB)' }, { status: 400 });
        }

        // Validate file type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(file.type)) {
            return NextResponse.json({ ok: false, error: 'Solo se aceptan imágenes (JPG, PNG, WebP) y PDFs' }, { status: 400 });
        }

        const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
        const timestamp = Date.now();
        const filename = `mov-${correlativo}-${timestamp}.${ext}`;
        const r2Key = `movimientos/${filename}`;

        const buffer = Buffer.from(await file.arrayBuffer());

        // Try R2 first
        const r2Success = await uploadToR2({
            key: r2Key,
            contentType: file.type,
            body: buffer,
        });

        // Save locally as fallback
        const subdir = 'movimientos';
        const volumePath = process.env.RAILWAY_VOLUME_MOUNT_PATH
            ? path.join(process.env.RAILWAY_VOLUME_MOUNT_PATH, subdir)
            : null;
        const publicDir = path.join(process.cwd(), 'public', 'uploads', subdir);

        // Save to volume (production) or public (dev)
        const saveDir = volumePath || publicDir;
        await fs.mkdir(saveDir, { recursive: true });
        await fs.writeFile(path.join(saveDir, filename), buffer);

        // Build the URL: use the API route for serving
        const attachmentUrl = `/api/uploads/movimiento/${filename}`;

        // Update DB
        await prisma.bankMovement.update({
            where: { correlativo: Number(correlativo) },
            data: { attachmentUrl },
        });

        return NextResponse.json({
            ok: true,
            correlativo: Number(correlativo),
            attachmentUrl,
            r2: r2Success,
            message: `Archivo adjuntado al movimiento #${correlativo}`,
        });
    } catch (err: any) {
        if (err.code === 'P2025') {
            return NextResponse.json({ ok: false, error: 'Correlativo no encontrado' }, { status: 404 });
        }
        console.error('Error uploading movimiento attachment:', err);
        return NextResponse.json({ ok: false, error: err.message || 'Error interno' }, { status: 500 });
    }
}

/**
 * DELETE /api/upload-movimiento-attachment
 * Removes the attachment from a bank movement.
 * Body: { correlativo: number }
 */
export async function DELETE(req: NextRequest) {
    try {
        const body = await req.json();
        const { correlativo } = body;

        if (!correlativo) {
            return NextResponse.json({ ok: false, error: 'correlativo es requerido' }, { status: 400 });
        }

        await prisma.bankMovement.update({
            where: { correlativo: Number(correlativo) },
            data: { attachmentUrl: null },
        });

        return NextResponse.json({
            ok: true,
            correlativo: Number(correlativo),
            message: `Adjunto eliminado del movimiento #${correlativo}`,
        });
    } catch (err: any) {
        if (err.code === 'P2025') {
            return NextResponse.json({ ok: false, error: 'Correlativo no encontrado' }, { status: 404 });
        }
        console.error('Error deleting attachment:', err);
        return NextResponse.json({ ok: false, error: err.message || 'Error interno' }, { status: 500 });
    }
}
