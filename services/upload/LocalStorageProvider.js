const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function ensureDirSync(dirPath) {
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function guessExtFromMime(mime) {
  if (!mime) return '';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/png') return '.png';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'video/mp4') return '.mp4';
  if (mime === 'video/webm') return '.webm';
  if (mime === 'video/quicktime') return '.mov';
  return '';
}

function safeBaseUrl(baseUrl) {
  if (!baseUrl) return '';
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

class LocalStorageProvider {
  /**
   * @param {Object} opts
   * @param {string} opts.baseUrl
   * @param {string} [opts.uploadRootAbsolute]
   */
  constructor(opts) {
    this.baseUrl = safeBaseUrl(opts.baseUrl);
    this.uploadRootAbsolute = opts.uploadRootAbsolute || path.resolve(process.cwd(), 'uploads');
  }

  async healthCheck() {
    try {
      ensureDirSync(this.uploadRootAbsolute);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e?.message || String(e) };
    }
  }

  /**
   * @param {Object} input
   * @param {Buffer} input.buffer
   * @param {string} input.mime
   * @param {'image'|'video'} input.kind
   * @param {string} [input.originalName]
   * @returns {Promise<import('./types') & any>}
   */
  async upload(input) {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');

    const folder = input.kind === 'video' ? 'videos' : 'images';
    const dateFolder = path.join(folder, yyyy, mm, dd);
    const targetDir = path.join(this.uploadRootAbsolute, dateFolder);
    ensureDirSync(targetDir);

    const random = crypto.randomBytes(16).toString('hex');
    const ext = guessExtFromMime(input.mime);
    const fileName = `${random}${ext || ''}`;
    const absPath = path.join(targetDir, fileName);

    await fs.promises.writeFile(absPath, input.buffer);

    const publicPath = `/uploads/${dateFolder.replace(/\\/g, '/')}/${fileName}`;
    const url = this.baseUrl ? `${this.baseUrl}${publicPath}` : publicPath;

    return {
      storage_type: 'local',
      url,
      key: publicPath, // keep as URL-path for delete later
      mime: input.mime,
      size: input.buffer.length,
      width: null,
      height: null,
    };
  }

  /**
   * @param {Object} input
   * @param {string} input.keyOrUrlPath - "/uploads/..." path
   */
  async delete(input) {
    const key = input.keyOrUrlPath;
    if (!key || typeof key !== 'string') return { ok: false, reason: 'Missing key' };
    if (!key.startsWith('/uploads/')) return { ok: false, reason: 'Invalid local key' };

    const relative = key.replace(/^\/uploads\//, '');
    const absPath = path.join(this.uploadRootAbsolute, relative);

    try {
      await fs.promises.unlink(absPath);
      return { ok: true };
    } catch (e) {
      // If file is already gone, treat as ok
      if (e && (e.code === 'ENOENT' || e.code === 'ENOTDIR')) return { ok: true };
      return { ok: false, reason: e?.message || String(e) };
    }
  }
}

module.exports = { LocalStorageProvider };

