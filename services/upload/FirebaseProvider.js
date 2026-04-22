const admin = require('firebase-admin');
const crypto = require('crypto');

function safePrivateKey(value) {
  if (!value) return value;
  // When stored in env, private key newlines are usually escaped.
  return value.replace(/\\n/g, '\n');
}

class FirebaseProvider {
  /**
   * @param {Object} opts
   * @param {string} opts.bucket
   * @param {string} opts.projectId
   * @param {string} opts.clientEmail
   * @param {string} opts.privateKey
   * @param {string} opts.baseUrl - used only for returning URL if needed
   */
  constructor(opts) {
    this.bucketName = opts.bucket;
    this.baseUrl = opts.baseUrl;

    // Initialize only once per process
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: opts.projectId,
          clientEmail: opts.clientEmail,
          privateKey: safePrivateKey(opts.privateKey),
        }),
        storageBucket: this.bucketName,
      });
    }

    this.bucket = admin.storage().bucket(this.bucketName);
  }

  async healthCheck() {
    try {
      await this.bucket.exists();
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
   * @returns {Promise<any>}
   */
  async upload(input) {
    const random = crypto.randomBytes(16).toString('hex');
    const folder = input.kind === 'video' ? 'videos' : 'images';
    const objectPath = `${folder}/${random}`;

    const file = this.bucket.file(objectPath);

    await file.save(input.buffer, {
      resumable: false,
      contentType: input.mime,
      metadata: {
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    // Make public URL (works if bucket/object is publicly readable; otherwise signed URLs needed)
    const publicUrl = `https://storage.googleapis.com/${this.bucketName}/${objectPath}`;

    return {
      storage_type: 'firebase',
      url: publicUrl,
      key: objectPath,
      mime: input.mime,
      size: input.buffer.length,
      width: null,
      height: null,
    };
  }

  /**
   * @param {Object} input
   * @param {string} input.key - objectPath in bucket
   */
  async delete(input) {
    if (!input.key) return { ok: false, reason: 'Missing key' };
    try {
      await this.bucket.file(input.key).delete({ ignoreNotFound: true });
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: e?.message || String(e) };
    }
  }
}

module.exports = { FirebaseProvider };

