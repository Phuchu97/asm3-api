const express = require('express');
const multer = require('multer');
const { FileUploadService, isImageMime, isVideoMime } = require('../services/upload/FileUploadService');
const { LocalStorageProvider } = require('../services/upload/LocalStorageProvider');
const { FirebaseProvider } = require('../services/upload/FirebaseProvider');
const { logger } = require('../services/logger');
const { URL } = require('url');

const router = express.Router();

const MAX_IMAGE_BYTES = parseInt(process.env.UPLOAD_MAX_IMAGE_BYTES || String(10 * 1024 * 1024), 10); // 10MB
const MAX_VIDEO_BYTES = parseInt(process.env.UPLOAD_MAX_VIDEO_BYTES || String(200 * 1024 * 1024), 10); // 200MB

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: Math.max(MAX_IMAGE_BYTES, MAX_VIDEO_BYTES),
  },
});

function buildBaseUrl(req) {
  const fromEnv = process.env.PUBLIC_BASE_URL;
  if (fromEnv && typeof fromEnv === 'string') return fromEnv;

  // Best-effort fallback
  const proto = (req.headers['x-forwarded-proto'] || req.protocol || 'http').toString().split(',')[0].trim();
  const host = (req.headers['x-forwarded-host'] || req.get('host')).toString().split(',')[0].trim();
  return `${proto}://${host}`;
}

function buildUploadService(req) {
  const baseUrl = buildBaseUrl(req);

  const localProvider = new LocalStorageProvider({ baseUrl });

  const hasFirebase =
    process.env.FIREBASE_STORAGE_BUCKET &&
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY;

  const firebaseProvider = hasFirebase
    ? new FirebaseProvider({
        bucket: process.env.FIREBASE_STORAGE_BUCKET,
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY,
        baseUrl,
      })
    : null;

  return new FileUploadService({
    firebaseProvider,
    localProvider,
    healthTtlMs: parseInt(process.env.FIREBASE_HEALTH_TTL_MS || '60000', 10),
  });
}

function detectStorageTypeByUrl(url) {
  if (!url || typeof url !== 'string') return null;
  if (url.includes('storage.googleapis.com') || url.includes('firebasestorage.googleapis.com')) return 'firebase';
  if (url.includes('/uploads/')) return 'local';
  return null;
}

function toUploadsPath(urlOrPath) {
  if (!urlOrPath || typeof urlOrPath !== 'string') return null;
  if (urlOrPath.startsWith('/uploads/')) return urlOrPath;
  try {
    const u = new URL(urlOrPath);
    if (u.pathname.startsWith('/uploads/')) return u.pathname;
    return null;
  } catch {
    return null;
  }
}

function firebaseObjectKeyFromUrl(urlStr, bucketName) {
  if (!urlStr || typeof urlStr !== 'string') return null;

  // public URL format: https://storage.googleapis.com/<bucket>/<objectPath>
  if (urlStr.includes('storage.googleapis.com/')) {
    try {
      const u = new URL(urlStr);
      const parts = u.pathname.split('/').filter(Boolean); // [bucket, ...object]
      if (parts.length >= 2 && (!bucketName || parts[0] === bucketName)) {
        return parts.slice(1).join('/');
      }
    } catch {
      return null;
    }
  }

  // If callers already stored key, allow passing it directly
  if (!urlStr.startsWith('http') && (urlStr.startsWith('images/') || urlStr.startsWith('videos/'))) {
    return urlStr;
  }

  return null;
}

// POST /upload (multipart form-data, field name: file)
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'file is required', data: null });
    }

    const { mimetype, size, originalname, buffer } = req.file;

    if (!isImageMime(mimetype) && !isVideoMime(mimetype)) {
      return res.status(400).json({ success: false, message: 'Unsupported file type', data: null });
    }

    if (isImageMime(mimetype) && size > MAX_IMAGE_BYTES) {
      return res.status(413).json({ success: false, message: `Image too large (max ${MAX_IMAGE_BYTES} bytes)`, data: null });
    }
    if (isVideoMime(mimetype) && size > MAX_VIDEO_BYTES) {
      return res.status(413).json({ success: false, message: `Video too large (max ${MAX_VIDEO_BYTES} bytes)`, data: null });
    }

    const service = buildUploadService(req);
    const uploaded = await service.upload({
      buffer,
      mime: mimetype,
      originalName: originalname,
      size,
      options: {
        resizeImage: process.env.UPLOAD_RESIZE_IMAGES === 'true',
      },
    });

    return res.status(200).json({
      success: true,
      message: null,
      data: uploaded,
    });
  } catch (e) {
    logger.error('Upload failed', { err: e?.message || String(e) });
    return res.status(500).json({ success: false, message: 'Upload failed', data: null });
  }
});

// DELETE /upload
// Body JSON: { url: string, storage_type?: 'firebase'|'local', key?: string }
router.delete('/upload', async (req, res) => {
  try {
    const { url, storage_type, key } = req.body || {};
    if (!url && !key) {
      return res.status(400).json({ success: false, message: 'url or key is required', data: null });
    }

    const service = buildUploadService(req);
    const inferred = storage_type || detectStorageTypeByUrl(url) || null;

    if (inferred === 'local') {
      const uploadsPath = toUploadsPath(url || key);
      if (!uploadsPath) return res.status(400).json({ success: false, message: 'Invalid uploads path', data: null });
      const result = await service.localProvider.delete({ keyOrUrlPath: uploadsPath });
      return res.status(result.ok ? 200 : 500).json({ success: result.ok, message: result.ok ? null : result.reason, data: null });
    }

    if (inferred === 'firebase') {
      if (!service.firebaseProvider) {
        return res.status(503).json({ success: false, message: 'Firebase provider not configured', data: null });
      }
      const objectKey = key || firebaseObjectKeyFromUrl(url, process.env.FIREBASE_STORAGE_BUCKET);
      if (!objectKey) return res.status(400).json({ success: false, message: 'Invalid firebase url/key', data: null });
      const result = await service.firebaseProvider.delete({ key: objectKey });
      return res.status(result.ok ? 200 : 500).json({ success: result.ok, message: result.ok ? null : result.reason, data: null });
    }

    return res.status(400).json({ success: false, message: 'Unknown storage type', data: null });
  } catch (e) {
    logger.error('Delete upload failed', { err: e?.message || String(e) });
    return res.status(500).json({ success: false, message: 'Delete failed', data: null });
  }
});

module.exports = { uploadRouter: router };

