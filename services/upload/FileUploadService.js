const sharp = require('sharp');
const { logger } = require('../logger');

function isImageMime(mime) {
  return typeof mime === 'string' && mime.startsWith('image/');
}

function isVideoMime(mime) {
  return typeof mime === 'string' && mime.startsWith('video/');
}

class FileUploadService {
  /**
   * @param {Object} deps
   * @param {any} deps.firebaseProvider
   * @param {any} deps.localProvider
   * @param {number} [deps.healthTtlMs]
   */
  constructor({ firebaseProvider, localProvider, healthTtlMs }) {
    this.firebaseProvider = firebaseProvider;
    this.localProvider = localProvider;
    this.healthTtlMs = healthTtlMs ?? 60_000;
    this._firebaseHealthCache = { ok: null, checkedAt: 0, reason: null };
  }

  async checkFirebase() {
    if (!this.firebaseProvider) return { ok: false, reason: 'Firebase provider not configured' };

    const now = Date.now();
    if (now - this._firebaseHealthCache.checkedAt < this.healthTtlMs && this._firebaseHealthCache.ok !== null) {
      return { ok: this._firebaseHealthCache.ok, reason: this._firebaseHealthCache.reason };
    }

    const result = await this.firebaseProvider.healthCheck();
    this._firebaseHealthCache = {
      ok: Boolean(result.ok),
      reason: result.reason || null,
      checkedAt: now,
    };
    return result;
  }

  /**
   * @param {Object} input
   * @param {Buffer} input.buffer
   * @param {string} input.mime
   * @param {string} input.originalName
   * @param {number} input.size
   * @param {Object} [input.options]
   * @param {boolean} [input.options.resizeImage]
   * @returns {Promise<any>}
   */
  async upload(input) {
    const kind = isVideoMime(input.mime) ? 'video' : 'image';

    let buffer = input.buffer;
    let width = null;
    let height = null;

    if (kind === 'image' && input.options?.resizeImage) {
      try {
        const img = sharp(buffer, { failOnError: false });
        const meta = await img.metadata();
        width = meta.width ?? null;
        height = meta.height ?? null;

        buffer = await img
          .rotate()
          .resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true })
          .toBuffer();
      } catch (e) {
        logger.warn('Image resize failed; continue original', { err: e?.message || String(e) });
      }
    }

    const firebaseHealth = await this.checkFirebase();
    if (firebaseHealth.ok) {
      try {
        // Retry 1 lần nếu lỗi (timeout/permission/412...)
        try {
          const uploaded = await this.firebaseProvider.upload({ buffer, mime: input.mime, kind, originalName: input.originalName });
          return { ...uploaded, width, height };
        } catch (e1) {
          logger.warn('Firebase upload failed, retrying once', { err: e1?.message || String(e1) });
          const uploaded = await this.firebaseProvider.upload({ buffer, mime: input.mime, kind, originalName: input.originalName });
          return { ...uploaded, width, height };
        }
      } catch (e) {
        logger.error('Firebase upload failed; falling back to local', { err: e?.message || String(e) });
      }
    } else {
      logger.warn('Firebase unhealthy; using local provider', { reason: firebaseHealth.reason });
    }

    const uploadedLocal = await this.localProvider.upload({ buffer, mime: input.mime, kind, originalName: input.originalName });
    return { ...uploadedLocal, width, height };
  }
}

module.exports = { FileUploadService, isImageMime, isVideoMime };

