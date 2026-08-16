// ===== 75-welcome.js : 初めて来た人に出す「使い方」の箱 =====
// app.js を分割したもの。素のスクリプトなので変数は全ファイルで共有される。
// index.html の読み込み順を変えると壊れる（80-images.js より前に読むこと）。
//
// 何をするか：一度も来たことがない人にだけ、画面の中央に使い方の箱を出す。
// 中の動きは説明ページ(/guide/)の冒頭と同じもの。
// 閉じ方は3通り：ばつ印・枠の外を押す・「今後は表示しない」。
// ばつ印と枠の外は「今回は閉じる」だけで、次に来た時はまた出す。
// 二度と出さないのは「今後は表示しない」を押した時だけ（Rayan様の指示・08-15）。

        const WELCOME_SEEN_KEY = 'ankimasking.welcomeSeen';

        const welcomeOverlay = document.getElementById('welcome-overlay');
        const welcomeBox = document.getElementById('welcome-box');

        function markWelcomeSeen() {
            try { localStorage.setItem(WELCOME_SEEN_KEY, '1'); } catch (_) {}
        }

        window.openWelcome = function openWelcome() {
            if (!welcomeOverlay) return;
            welcomeOverlay.style.display = 'flex';
        };

        // 今回だけ閉じる（次に来た時はまた出す）
        window.closeWelcome = function closeWelcome() {
            if (!welcomeOverlay) return;
            welcomeOverlay.style.display = 'none';
        };

        // 二度と出さない
        window.dismissWelcomeForever = function dismissWelcomeForever() {
            markWelcomeSeen();
            window.closeWelcome();
        };

        if (welcomeOverlay) {
            // ばつ印
            document.getElementById('welcome-close').addEventListener('click', window.closeWelcome);
            // 「今後は表示しない」
            document.getElementById('welcome-never').addEventListener('click', window.dismissWelcomeForever);
            // 枠の外を押す（箱の中を押した時は閉じない）
            welcomeOverlay.addEventListener('click', (e) => {
                if (e.target === welcomeOverlay) window.closeWelcome();
            });
            // 箱の中の操作が下の作業画面へ抜けないようにする
            if (welcomeBox) welcomeBox.addEventListener('pointerdown', (e) => e.stopPropagation());
        }

        // 初めての人にだけ自動で出す
        window.maybeShowWelcome = function maybeShowWelcome() {
            if (!welcomeOverlay) return;
            let seen = false;
            try { seen = !!localStorage.getItem(WELCOME_SEEN_KEY); } catch (_) {}
            if (seen) return;
            // 開いた直後にいきなり被せない。画面が出てから1秒おいて出す
            setTimeout(() => window.openWelcome(), 1000);
        };
