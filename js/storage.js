/**
 * IndexedDBストレージ管理
 * パスワードデータの永続化を担当
 */

const Storage = {
    DB_NAME: 'PasswordManagerDB',
    DB_VERSION: 1,
    db: null,

    /**
     * データベースを初期化
     */
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.DB_NAME, this.DB_VERSION);

            request.onerror = () => reject(request.error);
            request.onsuccess = () => {
                this.db = request.result;
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // パスワードストア
                if (!db.objectStoreNames.contains('passwords')) {
                    const passwordStore = db.createObjectStore('passwords', {
                        keyPath: 'id',
                        autoIncrement: true
                    });
                    passwordStore.createIndex('service', 'service', { unique: false });
                }

                // 設定ストア
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };
        });
    },

    /**
     * 設定を保存
     */
    async saveSetting(key, value) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('settings', 'readwrite');
            const store = tx.objectStore('settings');
            const request = store.put({ key, value });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 設定を取得
     */
    async getSetting(key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('settings', 'readonly');
            const store = tx.objectStore('settings');
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result?.value);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * パスワードを追加
     * @returns {Promise<number>} 追加されたパスワードのID
     */
    async addPassword(encryptedData) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('passwords', 'readwrite');
            const store = tx.objectStore('passwords');
            const request = store.add(encryptedData);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * パスワードを更新
     */
    async updatePassword(id, encryptedData) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('passwords', 'readwrite');
            const store = tx.objectStore('passwords');
            const request = store.put({ ...encryptedData, id });
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * パスワードを削除
     */
    async deletePassword(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('passwords', 'readwrite');
            const store = tx.objectStore('passwords');
            const request = store.delete(id);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * 全パスワードを取得
     */
    async getAllPasswords() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('passwords', 'readonly');
            const store = tx.objectStore('passwords');
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * パスワードを1件取得
     */
    async getPassword(id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction('passwords', 'readonly');
            const store = tx.objectStore('passwords');
            const request = store.get(id);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    /**
     * データをエクスポート（JSON形式）
     */
    async exportData() {
        const passwords = await this.getAllPasswords();
        const masterHash = await this.getSetting('masterHash');
        const masterSalt = await this.getSetting('masterSalt');
        const encryptionSalt = await this.getSetting('encryptionSalt');

        return JSON.stringify({
            version: 1,
            exportDate: new Date().toISOString(),
            masterHash,
            masterSalt,
            encryptionSalt,
            passwords
        }, null, 2);
    },

    /**
     * データをインポート（JSON形式）
     */
    async importData(jsonString) {
        const data = JSON.parse(jsonString);

        if (data.version !== 1) {
            throw new Error('サポートされていないデータ形式です');
        }

        // 設定を復元
        if (data.masterHash) await this.saveSetting('masterHash', data.masterHash);
        if (data.masterSalt) await this.saveSetting('masterSalt', data.masterSalt);
        if (data.encryptionSalt) await this.saveSetting('encryptionSalt', data.encryptionSalt);

        // パスワードを復元
        for (const pw of data.passwords) {
            await this.addPassword(pw);
        }

        return data.passwords.length;
    },

    /**
     * 全データを削除
     */
    async clearAll() {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(['passwords', 'settings'], 'readwrite');
            tx.objectStore('passwords').clear();
            tx.objectStore('settings').clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }
};

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
}
