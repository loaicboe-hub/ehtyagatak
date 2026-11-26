import fs from 'node:fs';
import path from 'node:path';
import { getEnvConfig } from '../config/env.mjs';
import { validateUpload } from '../../foundation/security/upload-policy.mjs';

export async function readRawBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        req.destroy();
        const err = new Error('Request payload exceeds maximum allowed size.');
        err.statusCode = 413;
        return reject(err);
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export async function parseRequestBody(req) {
  if (req.body) {
    if (typeof req.body === 'object') {
      return { fields: req.body, files: {}, isJson: true };
    }
    if (typeof req.body === 'string') {
      try {
        const parsed = JSON.parse(req.body);
        return { fields: parsed && typeof parsed === 'object' ? parsed : {}, files: {}, isJson: true };
      } catch {
        const params = new URLSearchParams(req.body);
        const fields = {};
        for (const [k, v] of params.entries()) {
          fields[k] = v;
        }
        return { fields, files: {}, isJson: false };
      }
    }
  }

  const cfg = getEnvConfig();
  const contentType = String(req.headers['content-type'] || '').toLowerCase();

  if (contentType.includes('application/json')) {
    const buf = await readRawBody(req, cfg.maxJsonBodyBytes);
    if (buf.length === 0) return { fields: {}, files: {} };
    try {
      const parsed = JSON.parse(buf.toString('utf8'));
      return { fields: parsed && typeof parsed === 'object' ? parsed : {}, files: {}, isJson: true };
    } catch {
      const err = new Error('Malformed JSON payload.');
      err.statusCode = 400;
      throw err;
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    const buf = await readRawBody(req, cfg.maxFormBodyBytes);
    const params = new URLSearchParams(buf.toString('utf8'));
    const fields = {};
    for (const [k, v] of params.entries()) {
      fields[k] = v;
    }
    return { fields, files: {}, isJson: false };
  }

  if (contentType.includes('multipart/form-data')) {
    const boundaryMatch = String(req.headers['content-type'] || '').match(/boundary=(?:"([^"]+)"|([^;\s]+))/i);
    if (!boundaryMatch) {
      const err = new Error('Missing multipart boundary.');
      err.statusCode = 400;
      throw err;
    }
    const boundary = boundaryMatch[1] || boundaryMatch[2];
    const buf = await readRawBody(req, cfg.maxMultipartBytes);
    return parseMultipartBuffer(buf, boundary);
  }

  return { fields: {}, files: {}, isJson: false };
}

function parseMultipartBuffer(buffer, boundary) {
  const fields = {};
  const files = {};
  const delimiter = Buffer.from(`--${boundary}`);
  let pos = buffer.indexOf(delimiter);
  if (pos === -1) return { fields, files, isJson: false };

  while (pos !== -1) {
    pos += delimiter.length;
    if (buffer.subarray(pos, pos + 2).toString('ascii') === '--') break;
    if (buffer.subarray(pos, pos + 2).toString('ascii') === '\r\n') pos += 2;

    const headerEnd = buffer.indexOf(Buffer.from('\r\n\r\n'), pos);
    if (headerEnd === -1) break;

    const headersText = buffer.subarray(pos, headerEnd).toString('utf8');
    const contentStart = headerEnd + 4;
    const nextBoundary = buffer.indexOf(delimiter, contentStart);
    if (nextBoundary === -1) break;

    let contentEnd = nextBoundary;
    if (buffer[contentEnd - 2] === 13 && buffer[contentEnd - 1] === 10) {
      contentEnd -= 2;
    }
    const bodySlice = buffer.subarray(contentStart, contentEnd);

    const nameMatch = headersText.match(/name="([^"]+)"/i);
    const filenameMatch = headersText.match(/filename="([^"]*)"/i);
    const mimeMatch = headersText.match(/Content-Type:\s*([^\r\n]+)/i);

    if (nameMatch) {
      const fieldName = nameMatch[1];
      if (filenameMatch && filenameMatch[1]) {
        files[fieldName] = {
          originalName: path.basename(filenameMatch[1]),
          mimeType: (mimeMatch ? mimeMatch[1] : 'application/octet-stream').trim(),
          buffer: bodySlice
        };
      } else {
        fields[fieldName] = bodySlice.toString('utf8');
      }
    }
    pos = nextBoundary;
  }

  return { fields, files, isJson: false };
}

export function persistValidatedUpload(fileObj, category = 'image', folder = 'general') {
  const cfg = getEnvConfig();
  const check = validateUpload({
    originalName: fileObj.originalName,
    mimeType: fileObj.mimeType,
    buffer: fileObj.buffer,
    category
  });
  if (!check.valid) {
    return { valid: false, reason: check.reason };
  }
  const safeFolder = String(folder || 'general').replace(/[^a-zA-Z0-9_-]/g, '');
  const targetDir = path.join(cfg.uploadDir, safeFolder);
  fs.mkdirSync(targetDir, { recursive: true });
  const absPath = path.join(targetDir, check.storedFilename);
  fs.writeFileSync(absPath, fileObj.buffer);

  return {
    valid: true,
    originalName: fileObj.originalName,
    storedFilename: check.storedFilename,
    storagePath: `${safeFolder}/${check.storedFilename}`,
    mimeType: fileObj.mimeType,
    extension: check.extension,
    sizeBytes: check.sizeBytes,
    sha256Checksum: check.sha256Checksum,
    folder: safeFolder
  };
}
