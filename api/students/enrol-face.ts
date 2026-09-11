import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query, queryOne } from '../db/client';
import { requireStudent } from '../_lib/auth';
import { analyseFrameDemo } from '../_lib/demoAi';

const DEMO_MODE = process.env.DEMO_MODE !== 'false';
const MAX_UPLOAD_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB || '10');

/**
 * POST /api/students/enrol-face
 * Accepts multipart/form-data with a `file` field OR JSON with `image_b64`.
 * Stores the face encoding (demo: simulated 128-d vector) in the student profile.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ detail: 'Method not allowed' });

  const student = requireStudent(req, res);
  if (!student) return;

  // The frontend sends multipart; Vercel parses it if we configure bodyParser=false
  // For simplicity we accept base64 JSON body as well
  let imageB64: string | null = null;

  const contentType = (req.headers['content-type'] || '').toLowerCase();

  if (contentType.includes('multipart/form-data')) {
    // Vercel does not auto-parse multipart in Node.js functions
    // We need to read raw body and parse it. Use a simple approach.
    imageB64 = await parseMultipartImageB64(req);
  } else if (contentType.includes('application/json')) {
    imageB64 = req.body?.image_b64 || null;
  }

  if (!imageB64) {
    return res.status(400).json({ detail: 'No image provided. Send multipart/form-data with a file field.' });
  }

  // Strip data URL prefix if present
  const b64Data = imageB64.includes(',') ? imageB64.split(',')[1] : imageB64;

  // Check size
  const bytes = Buffer.from(b64Data, 'base64');
  if (bytes.length > MAX_UPLOAD_MB * 1024 * 1024) {
    return res.status(400).json({ detail: `File too large (max ${MAX_UPLOAD_MB}MB)` });
  }

  // Generate face encoding (demo mode: return simulated 128-element vector)
  let encoding: number[];
  let isDemoResult = true;

  if (DEMO_MODE) {
    // Demo: generate stable-ish random encoding based on a hash of the image bytes
    encoding = generateDemoEncoding(b64Data);
  } else {
    // Real AI: would call an external AI service (not implemented for serverless)
    // Fall back to demo
    encoding = generateDemoEncoding(b64Data);
    isDemoResult = true;
  }

  // Store the encoding and the face image (b64) in the student profile
  await query(
    `UPDATE student_profiles
     SET face_encoding = $1, face_image_b64 = $2, is_face_enrolled = TRUE, enrolled_at = NOW()
     WHERE user_id = $3`,
    [JSON.stringify(encoding), b64Data.substring(0, 50000), student.sub] // limit stored b64 to 50KB
  );

  return res.status(200).json({
    success: true,
    message: isDemoResult ? 'Face enrolled (DEMO MODE — simulated encoding)' : 'Face enrolled successfully',
    demo: isDemoResult,
  });
}

function generateDemoEncoding(b64: string): number[] {
  // Generate a 128-element pseudo-random vector seeded from image data
  const seed = b64.split('').reduce((acc, c, i) => acc + c.charCodeAt(0) * (i % 7 + 1), 0);
  return Array.from({ length: 128 }, (_, i) => {
    const x = Math.sin(seed + i * 127.1) * 43758.5453;
    return (x - Math.floor(x)) * 2 - 1; // value in [-1, 1]
  });
}

async function parseMultipartImageB64(req: VercelRequest): Promise<string | null> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks);
        const body = raw.toString('binary');
        const boundary = (req.headers['content-type'] || '').split('boundary=')[1];
        if (!boundary) { resolve(null); return; }

        // Find the file part
        const parts = body.split(`--${boundary}`);
        for (const part of parts) {
          if (part.includes('Content-Disposition') && part.includes('filename=')) {
            const headerEnd = part.indexOf('\r\n\r\n');
            if (headerEnd === -1) continue;
            const fileData = part.slice(headerEnd + 4, part.lastIndexOf('\r\n'));
            const b64 = Buffer.from(fileData, 'binary').toString('base64');
            resolve(b64);
            return;
          }
        }
        resolve(null);
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
};
