import crypto from 'crypto';
import { env } from '$env/dynamic/private';

/**
 * Get the shared API encryption key from environment variables.
 * Decodes the base64-encoded key.
 */
function getKey(): Buffer {
    const key = env.API_ENCRYPTION_KEY;
    if (!key) {
        throw new Error('API_ENCRYPTION_KEY is not defined in environment variables');
    }
    const keyBytes = Buffer.from(key, 'base64');
    if (keyBytes.length !== 32) {
        throw new Error('API_ENCRYPTION_KEY must be 32 bytes (256 bits) when base64 decoded');
    }
    return keyBytes;
}

/**
 * Encrypts data using AES-256-GCM.
 * Returns payload, IV, authentication tag, and timestamp.
 */
export function encrypt(data: any): { payload: string; iv: string; tag: string; timestamp: number } {
    const key = getKey();
    const iv = crypto.randomBytes(12); // GCM standard IV size is 12 bytes
    const plaintext = typeof data === 'string' ? data : JSON.stringify(data);
    
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
    ciphertext += cipher.final('base64');
    
    const tag = cipher.getAuthTag().toString('base64');
    
    return {
        payload: ciphertext,
        iv: iv.toString('base64'),
        tag: tag,
        timestamp: Math.floor(Date.now() / 1000)
    };
}

/**
 * Decrypts data using AES-256-GCM.
 * Replays are blocked by verifying the request timestamp.
 */
export function decrypt(payload: string, iv: string, tag: string, timestamp: number): any {
    const key = getKey();
    
    // Prevent replay attacks (allow 120 seconds maximum clock skew)
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTimestamp - timestamp) > 120) {
        throw new Error('Decryption failed: Payload timestamp expired or clock out of sync');
    }
    
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    
    let decrypted = decipher.update(payload, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    
    return JSON.parse(decrypted);
}
