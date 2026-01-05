/**
 * GitHub Repository Sync
 * Privateリポジトリ内のファイルを直接読み書きする同期機能
 * GitHub Contents APIを使用（CORSサポート確認済み）
 */

const GitHubSync = {
    // 設定
    REPO_OWNER: null,
    REPO_NAME: null,
    FILE_PATH: 'pwa/data/passwords.json',
    token: null,

    /**
     * 初期化
     */
    async init() {
        this.token = await Storage.getSetting('githubToken');
        this.REPO_OWNER = await Storage.getSetting('githubRepoOwner');
        this.REPO_NAME = await Storage.getSetting('githubRepoName');
        return !!(this.token && this.REPO_OWNER && this.REPO_NAME);
    },

    /**
     * 設定を保存
     */
    async saveConfig(token, repoOwner, repoName) {
        await Storage.saveSetting('githubToken', token);
        await Storage.saveSetting('githubRepoOwner', repoOwner);
        await Storage.saveSetting('githubRepoName', repoName);
        this.token = token;
        this.REPO_OWNER = repoOwner;
        this.REPO_NAME = repoName;
    },

    /**
     * 設定をクリア
     */
    async clearConfig() {
        await Storage.saveSetting('githubToken', null);
        await Storage.saveSetting('githubRepoOwner', null);
        await Storage.saveSetting('githubRepoName', null);
        this.token = null;
        this.REPO_OWNER = null;
        this.REPO_NAME = null;
    },

    /**
     * トークンを検証（リポジトリへのアクセスで確認）
     */
    async validateToken(token, repoOwner, repoName) {
        try {
            // Contents APIでリポジトリにアクセスできるか確認（CORSサポート済み）
            const url = `https://api.github.com/repos/${repoOwner}/${repoName}/contents/`;
            const response = await fetch(url, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Accept': 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            });
            // 200 または 404（空リポジトリ）なら成功
            return response.ok || response.status === 404;
        } catch (error) {
            console.error('Token validation error:', error);
            return false;
        }
    },

    /**
     * ファイルを取得（Pull）
     */
    async pull() {
        if (!this.token || !this.REPO_OWNER || !this.REPO_NAME) {
            throw new Error('GitHub設定が未完了です');
        }

        const url = `https://api.github.com/repos/${this.REPO_OWNER}/${this.REPO_NAME}/contents/${this.FILE_PATH}`;

        const response = await fetch(url, {
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });

        if (response.status === 404) {
            // ファイルが存在しない
            return null;
        }

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Pull失敗');
        }

        const data = await response.json();
        // Base64デコード
        const content = atob(data.content.replace(/\n/g, ''));
        return {
            content: content,
            sha: data.sha  // 更新時に必要
        };
    },

    /**
     * ファイルを保存（Push）
     */
    async push(content, message = 'Update passwords.json') {
        if (!this.token || !this.REPO_OWNER || !this.REPO_NAME) {
            throw new Error('GitHub設定が未完了です');
        }

        const url = `https://api.github.com/repos/${this.REPO_OWNER}/${this.REPO_NAME}/contents/${this.FILE_PATH}`;

        // 既存ファイルのSHAを取得（更新の場合必要）
        let sha = null;
        try {
            const existing = await this.pull();
            if (existing) {
                sha = existing.sha;
            }
        } catch (e) {
            // ファイルが存在しない場合は新規作成
        }

        const body = {
            message: message,
            content: btoa(unescape(encodeURIComponent(content))),  // UTF-8対応Base64エンコード
        };

        if (sha) {
            body.sha = sha;
        }

        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                'Authorization': `Bearer ${this.token}`,
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': '2022-11-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Push失敗');
        }

        return await response.json();
    }
};

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GitHubSync;
}
