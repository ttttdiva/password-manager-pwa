/**
 * パスワード生成ユーティリティ
 */

const PasswordGenerator = {
    LOWERCASE: 'abcdefghijklmnopqrstuvwxyz',
    UPPERCASE: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    NUMBERS: '0123456789',
    SYMBOLS: '!@#$%^&*()_+-=[]{}|;:,.<>?',

    /**
     * パスワードを生成
     * @param {Object} options
     * @param {number} options.length - パスワードの長さ（デフォルト: 16）
     * @param {boolean} options.lowercase - 小文字を含む（デフォルト: true）
     * @param {boolean} options.uppercase - 大文字を含む（デフォルト: true）
     * @param {boolean} options.numbers - 数字を含む（デフォルト: true）
     * @param {boolean} options.symbols - 記号を含む（デフォルト: true）
     * @returns {string}
     */
    generate(options = {}) {
        const {
            length = 16,
            lowercase = true,
            uppercase = true,
            numbers = true,
            symbols = true
        } = options;

        let charset = '';
        if (lowercase) charset += this.LOWERCASE;
        if (uppercase) charset += this.UPPERCASE;
        if (numbers) charset += this.NUMBERS;
        if (symbols) charset += this.SYMBOLS;

        if (charset.length === 0) {
            charset = this.LOWERCASE + this.UPPERCASE + this.NUMBERS;
        }

        // 暗号学的に安全な乱数を使用
        const randomBytes = crypto.getRandomValues(new Uint8Array(length));
        let password = '';

        for (let i = 0; i < length; i++) {
            password += charset[randomBytes[i] % charset.length];
        }

        // 各文字種が少なくとも1つ含まれることを保証
        const checks = [];
        if (lowercase) checks.push({ chars: this.LOWERCASE, has: /[a-z]/ });
        if (uppercase) checks.push({ chars: this.UPPERCASE, has: /[A-Z]/ });
        if (numbers) checks.push({ chars: this.NUMBERS, has: /[0-9]/ });
        if (symbols) checks.push({ chars: this.SYMBOLS, has: /[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/ });

        for (const check of checks) {
            if (!check.has.test(password)) {
                // 足りない文字種をランダムな位置に挿入
                const pos = crypto.getRandomValues(new Uint8Array(1))[0] % length;
                const char = check.chars[crypto.getRandomValues(new Uint8Array(1))[0] % check.chars.length];
                password = password.substring(0, pos) + char + password.substring(pos + 1);
            }
        }

        return password;
    },

    /**
     * パスワードの強度を評価
     * @returns {Object} { score: number, label: string, color: string }
     */
    evaluateStrength(password) {
        let score = 0;

        // 長さによるスコア
        if (password.length >= 8) score += 1;
        if (password.length >= 12) score += 1;
        if (password.length >= 16) score += 1;

        // 文字種によるスコア
        if (/[a-z]/.test(password)) score += 1;
        if (/[A-Z]/.test(password)) score += 1;
        if (/[0-9]/.test(password)) score += 1;
        if (/[^a-zA-Z0-9]/.test(password)) score += 1;

        // 連続文字のペナルティ
        if (/(.)\1{2,}/.test(password)) score -= 1;

        // スコアを0-4にクランプ
        score = Math.max(0, Math.min(4, score));

        const levels = [
            { label: '非常に弱い', color: '#ef4444' },
            { label: '弱い', color: '#f97316' },
            { label: '普通', color: '#eab308' },
            { label: '強い', color: '#22c55e' },
            { label: '非常に強い', color: '#10b981' }
        ];

        return {
            score,
            ...levels[score]
        };
    }
};

// エクスポート
if (typeof module !== 'undefined' && module.exports) {
    module.exports = PasswordGenerator;
}
