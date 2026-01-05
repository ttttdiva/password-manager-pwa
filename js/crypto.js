/**
 * 暗号化ユーティリティ
 * CryptoJSを使用して全デバイス互換性を確保
 */

const CryptoUtils = {
  // 設定
  SALT_LENGTH: 16,
  IV_LENGTH: 16,  // AES-CBC用
  KEY_LENGTH: 256,
  PBKDF2_ITERATIONS: 100000,

  /**
   * ランダムバイト生成
   */
  getRandomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
  },

  /**
   * ArrayBufferをBase64に変換
   */
  arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  },

  /**
   * Base64をArrayBufferに変換
   */
  base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  },

  /**
   * WordArrayをBase64に変換（CryptoJS用）
   */
  wordArrayToBase64(wordArray) {
    return CryptoJS.enc.Base64.stringify(wordArray);
  },

  /**
   * Base64をWordArrayに変換（CryptoJS用）
   */
  base64ToWordArray(base64) {
    return CryptoJS.enc.Base64.parse(base64);
  },

  /**
   * マスターパスワードをハッシュ化（保存用）
   * @returns {Promise<{hash: string, salt: string}>}
   */
  async hashMasterPassword(password) {
    const saltBytes = this.getRandomBytes(this.SALT_LENGTH);
    const saltBase64 = this.arrayBufferToBase64(saltBytes);

    // CryptoJSを使用（全デバイス互換）
    const salt = this.base64ToWordArray(saltBase64);
    const hash = CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations: this.PBKDF2_ITERATIONS,
      hasher: CryptoJS.algo.SHA256
    });

    return {
      hash: this.wordArrayToBase64(hash),
      salt: saltBase64
    };
  },

  /**
   * マスターパスワードを検証
   * @returns {Promise<boolean>}
   */
  async verifyMasterPassword(password, storedHash, storedSalt) {
    // CryptoJSを使用（全デバイス互換）
    const salt = this.base64ToWordArray(storedSalt);
    const hash = CryptoJS.PBKDF2(password, salt, {
      keySize: 256 / 32,
      iterations: this.PBKDF2_ITERATIONS,
      hasher: CryptoJS.algo.SHA256
    });

    const computedHash = this.wordArrayToBase64(hash);
    return computedHash === storedHash;
  },

  /**
   * パスワードから暗号化キーを導出
   * @returns {Promise<WordArray>}
   */
  async deriveKey(password, salt) {
    const saltBase64 = typeof salt === 'string' ? salt : this.arrayBufferToBase64(salt);

    // CryptoJSを使用（全デバイス互換）
    const saltWordArray = this.base64ToWordArray(saltBase64);
    return CryptoJS.PBKDF2(password, saltWordArray, {
      keySize: 256 / 32,
      iterations: this.PBKDF2_ITERATIONS,
      hasher: CryptoJS.algo.SHA256
    });
  },

  /**
   * データを暗号化 (AES-CBC)
   * @returns {Promise<{ciphertext: string, iv: string}>}
   */
  async encrypt(data, key) {
    const dataString = JSON.stringify(data);

    // CryptoJS AES-CBC（全デバイス互換）
    const iv = CryptoJS.lib.WordArray.random(16);
    const encrypted = CryptoJS.AES.encrypt(dataString, key, {
      iv: iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    return {
      ciphertext: encrypted.ciphertext.toString(CryptoJS.enc.Base64),
      iv: iv.toString(CryptoJS.enc.Base64)
    };
  },

  /**
   * データを復号化 (AES-CBC)
   * @returns {Promise<any>}
   */
  async decrypt(ciphertext, iv, key) {
    const ivWordArray = this.base64ToWordArray(iv);
    const cipherParams = CryptoJS.lib.CipherParams.create({
      ciphertext: this.base64ToWordArray(ciphertext)
    });

    const decrypted = CryptoJS.AES.decrypt(cipherParams, key, {
      iv: ivWordArray,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });

    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
  }
};

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CryptoUtils;
}
