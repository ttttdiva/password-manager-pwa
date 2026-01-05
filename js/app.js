/**
 * Password Manager PWA - メインアプリケーション
 */

const App = {
    // 状態
    encryptionKey: null,
    encryptionSalt: null,
    passwords: [],
    currentPasswordId: null,
    isNewUser: false,
    editMode: false,

    /**
     * アプリケーション初期化
     */
    async init() {
        try {
            // IndexedDBの初期化
            await Storage.init();

            // マスターパスワードの存在確認
            const masterHash = await Storage.getSetting('masterHash');
            this.isNewUser = !masterHash;

            if (this.isNewUser) {
                document.getElementById('login-btn-text').textContent = '設定する';
                document.getElementById('confirm-password-group').style.display = 'block';
            }

            // イベントリスナーの設定
            this.setupEventListeners();

            // Service Workerの登録
            this.registerServiceWorker();

        } catch (error) {
            console.error('初期化エラー:', error);
            this.showToast('アプリの初期化に失敗しました', 'error');
        }
    },

    /**
     * イベントリスナーのセットアップ
     */
    setupEventListeners() {
        // ログインフォーム
        document.getElementById('login-form').addEventListener('submit', (e) => this.handleLogin(e));
        document.getElementById('toggle-password').addEventListener('click', () => this.togglePasswordVisibility('master-password'));

        // パスワード一覧
        document.getElementById('add-btn').addEventListener('click', () => this.showAddScreen());
        document.getElementById('search-input').addEventListener('input', (e) => this.handleSearch(e.target.value));
        document.getElementById('settings-btn').addEventListener('click', () => this.showScreen('settings-screen'));

        // パスワード詳細
        document.getElementById('detail-back-btn').addEventListener('click', () => this.showScreen('list-screen'));
        document.getElementById('toggle-detail-password').addEventListener('click', () => this.toggleDetailPassword());
        document.getElementById('edit-btn').addEventListener('click', () => this.showEditScreen());
        document.getElementById('delete-btn').addEventListener('click', () => this.showDeleteModal());

        // コピーボタン
        document.querySelectorAll('.copy-btn').forEach(btn => {
            btn.addEventListener('click', (e) => this.handleCopy(e.target.closest('.copy-btn').dataset.field));
        });

        // 編集画面
        document.getElementById('edit-back-btn').addEventListener('click', () => this.handleEditBack());
        document.getElementById('edit-form').addEventListener('submit', (e) => this.handleSave(e));
        document.getElementById('toggle-edit-password').addEventListener('click', () => this.togglePasswordVisibility('edit-password'));
        document.getElementById('generate-password-btn').addEventListener('click', () => this.generatePassword());
        document.getElementById('edit-password').addEventListener('input', (e) => this.updateStrengthIndicator(e.target.value));

        // 設定画面
        document.getElementById('settings-back-btn').addEventListener('click', () => this.showScreen('list-screen'));
        document.getElementById('export-btn').addEventListener('click', () => this.exportData());
        document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());
        document.getElementById('import-file').addEventListener('change', (e) => this.importData(e));
        document.getElementById('logout-btn').addEventListener('click', () => this.logout());

        // GitHub同期
        document.getElementById('save-config-btn').addEventListener('click', () => this.saveGitHubConfig());
        document.getElementById('sync-pull-btn').addEventListener('click', () => this.handleSyncPull());
        document.getElementById('sync-push-btn').addEventListener('click', () => this.handleSyncPush());
        document.getElementById('clear-config-btn').addEventListener('click', () => this.clearGitHubConfig());

        // 削除モーダル
        document.getElementById('cancel-delete').addEventListener('click', () => this.hideDeleteModal());
        document.getElementById('confirm-delete').addEventListener('click', () => this.handleDelete());

    },

    /**
     * ログイン処理
     */
    async handleLogin(e) {
        e.preventDefault();

        const password = document.getElementById('master-password').value;

        if (this.isNewUser) {
            // 新規ユーザー: マスターパスワード設定
            const confirmPassword = document.getElementById('confirm-password').value;

            if (password !== confirmPassword) {
                this.showToast('パスワードが一致しません', 'error');
                return;
            }

            if (password.length < 8) {
                this.showToast('パスワードは8文字以上で設定してください', 'error');
                return;
            }

            try {
                // マスターパスワードをハッシュ化して保存
                const { hash, salt } = await CryptoUtils.hashMasterPassword(password);
                await Storage.saveSetting('masterHash', hash);
                await Storage.saveSetting('masterSalt', salt);

                // 暗号化用のソルトを生成
                const encryptionSalt = CryptoUtils.arrayBufferToBase64(CryptoUtils.getRandomBytes(16));
                await Storage.saveSetting('encryptionSalt', encryptionSalt);
                this.encryptionSalt = encryptionSalt;

                // 暗号化キーを導出
                this.encryptionKey = await CryptoUtils.deriveKey(password, encryptionSalt);

                this.showToast('マスターパスワードを設定しました');
                this.showScreen('list-screen');

            } catch (error) {
                console.error('パスワード設定エラー:', error);
                this.showToast('設定に失敗しました', 'error');
            }

        } else {
            // 既存ユーザー: ログイン
            try {
                const storedHash = await Storage.getSetting('masterHash');
                const storedSalt = await Storage.getSetting('masterSalt');

                const isValid = await CryptoUtils.verifyMasterPassword(password, storedHash, storedSalt);

                if (!isValid) {
                    this.showToast('パスワードが正しくありません', 'error');
                    return;
                }

                // 暗号化キーを導出
                this.encryptionSalt = await Storage.getSetting('encryptionSalt');
                this.encryptionKey = await CryptoUtils.deriveKey(password, this.encryptionSalt);

                // パスワード一覧を読み込み
                await this.loadPasswords();

                this.showScreen('list-screen');

            } catch (error) {
                console.error('ログインエラー:', error);
                this.showToast('ログインに失敗しました', 'error');
            }
        }
    },

    /**
     * パスワード一覧を読み込み
     */
    async loadPasswords() {
        try {
            const encryptedPasswords = await Storage.getAllPasswords();
            this.passwords = [];
            const invalidIds = [];

            for (const ep of encryptedPasswords) {
                try {
                    const decrypted = await CryptoUtils.decrypt(ep.ciphertext, ep.iv, this.encryptionKey);
                    this.passwords.push({ id: ep.id, ...decrypted });
                } catch (error) {
                    console.error('復号化エラー (削除対象):', error);
                    invalidIds.push(ep.id);
                }
            }

            // 復号できないゴミデータを自動削除
            if (invalidIds.length > 0) {
                console.log(`削除対象の破損データ: ${invalidIds.length}件`);
                for (const id of invalidIds) {
                    await Storage.deletePassword(id);
                }
                this.showToast(`${invalidIds.length}件の破損データを削除しました`, 'warning');
            }

            this.renderPasswordList();

        } catch (error) {
            console.error('パスワード読み込みエラー:', error);
            this.showToast('データの読み込みに失敗しました', 'error');
        }
    },

    /**
     * パスワード一覧を描画
     */
    renderPasswordList(filter = '') {
        const listEl = document.getElementById('password-list');
        const emptyEl = document.getElementById('empty-state');
        const countEl = document.getElementById('password-count');

        const filtered = filter
            ? this.passwords.filter(p =>
                p.service.toLowerCase().includes(filter.toLowerCase()) ||
                p.username.toLowerCase().includes(filter.toLowerCase()) ||
                (p.email && p.email.toLowerCase().includes(filter.toLowerCase()))
            )
            : this.passwords;

        countEl.textContent = `${filtered.length}件のパスワード`;

        if (filtered.length === 0) {
            listEl.innerHTML = '';
            emptyEl.style.display = 'flex';
            return;
        }

        emptyEl.style.display = 'none';

        listEl.innerHTML = filtered.map(p => `
      <div class="password-item" data-id="${p.id}">
        <div class="password-icon">${p.service.charAt(0).toUpperCase()}</div>
        <div class="password-info">
          <div class="password-service">${this.escapeHtml(p.service)}</div>
          <div class="password-username">${this.escapeHtml(p.username)}</div>
        </div>
        <button class="btn btn-icon btn-secondary list-copy-btn" title="パスワードをコピー">📋</button>
        <span class="password-arrow">→</span>
      </div>
    `).join('');

        // クリックイベントを設定
        listEl.querySelectorAll('.password-item').forEach(item => {
            const id = parseInt(item.dataset.id);

            item.addEventListener('click', () => this.showDetail(id));

            // コピーボタンのイベント
            const copyBtn = item.querySelector('.list-copy-btn');
            if (copyBtn) {
                copyBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.handleCopy('password', id);
                });
            }
        });
    },

    /**
     * 検索処理
     */
    handleSearch(query) {
        this.renderPasswordList(query);
    },

    /**
     * パスワード詳細を表示
     */
    showDetail(id) {
        const password = this.passwords.find(p => p.id === id);
        if (!password) return;

        this.currentPasswordId = id;

        document.getElementById('detail-service-name').textContent = password.service;
        document.getElementById('detail-icon').textContent = password.service.charAt(0).toUpperCase();
        document.getElementById('detail-service').textContent = password.service;
        document.getElementById('detail-username').textContent = password.username;
        document.getElementById('detail-password').textContent = '••••••••';
        document.getElementById('detail-password').dataset.value = password.password;
        document.getElementById('detail-password').dataset.visible = 'false';

        // メールアドレス
        const emailField = document.getElementById('detail-email-field');
        if (password.email) {
            emailField.style.display = 'flex';
            document.getElementById('detail-email').textContent = password.email;
        } else {
            emailField.style.display = 'none';
        }

        // メモ
        const memoField = document.getElementById('detail-memo-field');
        if (password.memo) {
            memoField.style.display = 'flex';
            document.getElementById('detail-memo').textContent = password.memo;
        } else {
            memoField.style.display = 'none';
        }

        this.showScreen('detail-screen');
    },

    /**
     * パスワードの表示/非表示を切り替え
     */
    toggleDetailPassword() {
        const el = document.getElementById('detail-password');
        const isVisible = el.dataset.visible === 'true';

        if (isVisible) {
            el.textContent = '••••••••';
            el.dataset.visible = 'false';
        } else {
            el.textContent = el.dataset.value;
            el.dataset.visible = 'true';
        }
    },

    /**
     * コピー処理
     */
    async handleCopy(field, targetId = null) {
        const id = targetId !== null ? targetId : this.currentPasswordId;
        const password = this.passwords.find(p => p.id === id);
        if (!password) return;

        let value;
        switch (field) {
            case 'email':
                value = password.email;
                break;
            case 'username':
                value = password.username;
                break;
            case 'password':
                value = password.password;
                break;
            default:
                return;
        }

        try {
            await navigator.clipboard.writeText(value);
            this.showToast('クリップボードにコピーしました');

            // 10秒後にクリアする警告
            setTimeout(() => {
                this.showToast('セキュリティのため、クリップボードをクリアしてください', 'warning');
            }, 10000);

        } catch (error) {
            console.error('コピーエラー:', error);
            this.showToast('コピーに失敗しました', 'error');
        }
    },

    /**
     * 追加画面を表示
     */
    showAddScreen() {
        this.editMode = false;
        this.currentPasswordId = null;

        document.getElementById('edit-title').textContent = 'パスワードを追加';
        document.getElementById('edit-form').reset();
        this.updateStrengthIndicator('');

        this.showScreen('edit-screen');
    },

    /**
     * 編集画面を表示
     */
    showEditScreen() {
        const password = this.passwords.find(p => p.id === this.currentPasswordId);
        if (!password) return;

        this.editMode = true;

        document.getElementById('edit-title').textContent = 'パスワードを編集';
        document.getElementById('edit-service').value = password.service;
        document.getElementById('edit-email').value = password.email || '';
        document.getElementById('edit-username').value = password.username;
        document.getElementById('edit-password').value = password.password;
        document.getElementById('edit-memo').value = password.memo || '';

        this.updateStrengthIndicator(password.password);

        this.showScreen('edit-screen');
    },

    /**
     * 編集画面から戻る
     */
    handleEditBack() {
        if (this.editMode) {
            this.showScreen('detail-screen');
        } else {
            this.showScreen('list-screen');
        }
    },

    /**
     * パスワード保存
     */
    async handleSave(e) {
        e.preventDefault();

        const data = {
            service: document.getElementById('edit-service').value.trim(),
            email: document.getElementById('edit-email').value.trim(),
            username: document.getElementById('edit-username').value.trim(),
            password: document.getElementById('edit-password').value,
            memo: document.getElementById('edit-memo').value.trim()
        };

        try {
            const encrypted = await CryptoUtils.encrypt(data, this.encryptionKey);

            if (this.editMode) {
                // 更新
                await Storage.updatePassword(this.currentPasswordId, encrypted);

                const index = this.passwords.findIndex(p => p.id === this.currentPasswordId);
                if (index !== -1) {
                    this.passwords[index] = { id: this.currentPasswordId, ...data };
                }

                this.showToast('更新しました');
                this.showDetail(this.currentPasswordId);

            } else {
                // 新規追加
                const id = await Storage.addPassword(encrypted);
                this.passwords.push({ id, ...data });

                this.showToast('追加しました');
                this.showScreen('list-screen');
                this.renderPasswordList();
            }

        } catch (error) {
            console.error('保存エラー:', error);
            this.showToast('保存に失敗しました', 'error');
        }
    },

    /**
     * パスワード生成
     */
    generatePassword() {
        const password = PasswordGenerator.generate({ length: 16 });
        const input = document.getElementById('edit-password');
        input.value = password;
        input.type = 'text'; // 生成されたパスワードを表示
        this.updateStrengthIndicator(password);

        this.showToast('パスワードを生成しました');
    },

    /**
     * パスワード強度インジケータを更新
     */
    updateStrengthIndicator(password) {
        const bars = document.querySelectorAll('#strength-indicator .strength-bar');
        const label = document.getElementById('strength-label');

        if (!password) {
            bars.forEach(bar => bar.style.background = 'var(--bg-input)');
            label.textContent = '';
            return;
        }

        const strength = PasswordGenerator.evaluateStrength(password);

        bars.forEach((bar, index) => {
            bar.style.background = index <= strength.score ? strength.color : 'var(--bg-input)';
        });

        label.textContent = strength.label;
        label.style.color = strength.color;
    },

    /**
     * 削除モーダルを表示
     */
    showDeleteModal() {
        document.getElementById('delete-modal').classList.add('active');
    },

    /**
     * 削除モーダルを非表示
     */
    hideDeleteModal() {
        document.getElementById('delete-modal').classList.remove('active');
    },

    /**
     * パスワード削除
     */
    async handleDelete() {
        try {
            await Storage.deletePassword(this.currentPasswordId);

            this.passwords = this.passwords.filter(p => p.id !== this.currentPasswordId);
            this.currentPasswordId = null;

            this.hideDeleteModal();
            this.showToast('削除しました');
            this.showScreen('list-screen');
            this.renderPasswordList();

        } catch (error) {
            console.error('削除エラー:', error);
            this.showToast('削除に失敗しました', 'error');
        }
    },

    /**
     * データエクスポート
     */
    async exportData() {
        try {
            const json = await Storage.exportData();
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            const a = document.createElement('a');
            a.href = url;
            a.download = `password-manager-backup-${new Date().toISOString().slice(0, 10)}.json`;
            a.click();

            URL.revokeObjectURL(url);
            this.showToast('エクスポートしました');

        } catch (error) {
            console.error('エクスポートエラー:', error);
            this.showToast('エクスポートに失敗しました', 'error');
        }
    },

    /**
     * データインポート
     */
    async importData(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            if (data.version !== 1) {
                throw new Error('サポートされていないデータ形式です');
            }

            // 暗号化キーが必要（ログイン済みである必要がある）
            if (!this.encryptionKey) {
                throw new Error('先にログインしてください');
            }

            let count = 0;

            // パスワードをインポート
            for (const pw of data.passwords) {
                // pwが平文か暗号化済みか判定
                // ciphertextがあれば暗号化済み、なければ平文
                if (pw.ciphertext && pw.iv) {
                    // 暗号化済みデータ（そのまま保存）
                    await Storage.addPassword(pw);
                } else if (pw.service !== undefined) {
                    // 平文データ（暗号化して保存）
                    const passwordData = {
                        service: pw.service || '',
                        email: pw.email || '',
                        username: pw.username || '',
                        password: pw.password || '',
                        memo: pw.memo || ''
                    };
                    const encrypted = await CryptoUtils.encrypt(passwordData, this.encryptionKey);
                    await Storage.addPassword(encrypted);
                }
                count++;
            }

            await this.loadPasswords();

            this.showToast(`${count}件のパスワードをインポートしました`);
            e.target.value = '';

        } catch (error) {
            console.error('インポートエラー:', error);
            this.showToast(error.message || 'インポートに失敗しました', 'error');
        }
    },

    /**
     * ログアウト
     */
    logout() {
        this.encryptionKey = null;
        this.passwords = [];
        this.currentPasswordId = null;

        document.getElementById('master-password').value = '';
        document.getElementById('search-input').value = '';

        this.showScreen('login-screen');
        this.showToast('ロックしました');
    },

    /**
     * 画面を切り替え
     */
    showScreen(screenId) {
        document.querySelectorAll('.screen').forEach(screen => {
            screen.classList.remove('active');
        });
        document.getElementById(screenId).classList.add('active');

        // 設定画面表示時にGitHub同期の状態を更新
        if (screenId === 'settings-screen') {
            this.updateSyncUI();
        }
    },

    /**
     * GitHub同期UIの状態を更新
     */
    async updateSyncUI() {
        const isConfigured = await GitHubSync.init();
        const configGroup = document.getElementById('sync-config-group');
        const actionsGroup = document.getElementById('sync-actions');
        const statusEl = document.getElementById('sync-status');
        const repoInfoEl = document.getElementById('sync-repo-info');

        if (isConfigured) {
            configGroup.style.display = 'none';
            actionsGroup.style.display = 'block';
            statusEl.textContent = '✅ 同期設定済み';
            statusEl.style.color = 'var(--success)';
            repoInfoEl.textContent = `${GitHubSync.REPO_OWNER}/${GitHubSync.REPO_NAME}`;
        } else {
            configGroup.style.display = 'block';
            actionsGroup.style.display = 'none';
            statusEl.textContent = '未設定';
            statusEl.style.color = 'var(--text-secondary)';
        }
    },

    /**
     * GitHub設定を保存
     */
    async saveGitHubConfig() {
        const repoOwner = document.getElementById('github-repo-owner').value.trim();
        const repoName = document.getElementById('github-repo-name').value.trim();
        const token = document.getElementById('github-token').value.trim();

        if (!repoOwner || !repoName || !token) {
            this.showToast('すべての項目を入力してください', 'error');
            return;
        }

        this.showToast('トークンを検証中...');

        try {
            const isValid = await GitHubSync.validateToken(token, repoOwner, repoName);

            if (!isValid) {
                this.showToast('無効なトークンです', 'error');
                return;
            }

            await GitHubSync.saveConfig(token, repoOwner, repoName);
            this.showToast('設定を保存しました');

            // 入力フィールドをクリア
            document.getElementById('github-repo-owner').value = '';
            document.getElementById('github-repo-name').value = '';
            document.getElementById('github-token').value = '';

            this.updateSyncUI();

        } catch (error) {
            console.error('設定保存エラー:', error);
            this.showToast('設定の保存に失敗しました', 'error');
        }
    },

    /**
     * GitHubからPull
     */
    async handleSyncPull() {
        this.showToast('Pull中...');

        try {
            const result = await GitHubSync.pull();

            if (!result) {
                this.showToast('リモートにデータがありません');
                return;
            }

            // リモートデータをインポート
            const data = JSON.parse(result.content);

            if (data.version !== 1) {
                throw new Error('サポートされていないデータ形式です');
            }

            // 既存データをクリアして新しいデータをインポート
            await Storage.clearAll();

            // 設定を復元
            if (data.masterHash) await Storage.saveSetting('masterHash', data.masterHash);
            if (data.masterSalt) await Storage.saveSetting('masterSalt', data.masterSalt);
            if (data.encryptionSalt) await Storage.saveSetting('encryptionSalt', data.encryptionSalt);

            // GitHub設定を復元（クリアされたので）
            await GitHubSync.saveConfig(
                GitHubSync.token,
                GitHubSync.REPO_OWNER,
                GitHubSync.REPO_NAME
            );

            // パスワードを復元（復号可能なもののみ）
            let successCount = 0;
            const validPasswords = [];

            // まず暗号化キーを生成（復号チェック用）
            // 注意: ここでthis.encryptionKeyが無いとチェックできない
            // 再ログイン前だが、マスターハッシュ等は更新されている。
            // しかし、パスワード入力がないとキーは作れない...

            // 修正方針変更:
            // キーがない状態では復号チェックができない。
            // したがって、とりあえず全件保存し、「読み込み時（loadPasswords）」に無効なデータを削除するロジックにするか、
            // あるいは、ユーザーに「クリーンアップボタン」を提供するか。

            // いや、Pullの最後で「再ログイン」させている。
            // 再ログイン後、loadPasswordsが呼ばれる。
            // そこで「復号できないデータ」をDBから削除してしまえばいい。

            // ここではそのまま保存するしかない（キーがないから）。
            for (const pw of data.passwords) {
                await Storage.addPassword(pw);
            }

            // セッションをクリアして再ログインを要求
            this.encryptionKey = null;
            this.encryptionSalt = null;

            this.showToast(`${data.passwords.length}件のパスワードを同期しました。再ログインしてください`, 'success');

            // ログイン画面に戻る
            setTimeout(() => {
                this.isNewUser = false;
                document.getElementById('confirm-password-group').style.display = 'none';
                document.getElementById('login-btn-text').textContent = 'ロック解除';
                document.querySelector('.login-subtitle').textContent = 'マスターパスワードでロック解除';
                document.getElementById('master-password').value = '';
                this.showScreen('login-screen');
            }, 1500);

        } catch (error) {
            console.error('Pullエラー:', error);
            this.showToast(error.message || 'Pullに失敗しました', 'error');
        }
    },

    /**
     * GitHubへPush
     */
    async handleSyncPush() {
        this.showToast('Push中...');

        try {
            const data = await Storage.exportData();
            await GitHubSync.push(data, `Update passwords - ${new Date().toISOString().slice(0, 10)}`);
            this.showToast('Pushしました');
        } catch (error) {
            console.error('Pushエラー:', error);
            this.showToast(error.message || 'Pushに失敗しました', 'error');
        }
    },

    /**
     * GitHub設定をクリア
     */
    async clearGitHubConfig() {
        await GitHubSync.clearConfig();
        this.showToast('設定をクリアしました');
        this.updateSyncUI();
    },

    /**
     * パスワード表示/非表示を切り替え
     */
    togglePasswordVisibility(inputId) {
        const input = document.getElementById(inputId);
        input.type = input.type === 'password' ? 'text' : 'password';
    },

    /**
     * トースト通知を表示
     */
    showToast(message, type = 'success') {
        const container = document.getElementById('toast-container');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = message;

        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    },

    /**
     * HTMLエスケープ
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    /**
     * Service Workerを登録
     */
    async registerServiceWorker() {
        if ('serviceWorker' in navigator) {
            try {
                const registration = await navigator.serviceWorker.register('sw.js');
                console.log('Service Worker registered:', registration.scope);
            } catch (error) {
                console.error('Service Worker registration failed:', error);
            }
        }
    }
};

// アプリ起動
document.addEventListener('DOMContentLoaded', () => App.init());

