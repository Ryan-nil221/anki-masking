// 問い合わせの窓と、ヘッダーの印の下に出る吹き出し（09-16 Rayan様の見本どおり）。
// 送る中身の受け渡しはまだ繋いでいない。ここは見た目と開け閉めだけ。
(() => {
    const btn = document.getElementById('btn-feedback');
    const balloon = document.getElementById('feedback-balloon');
    const overlay = document.getElementById('feedback-overlay');
    const card = document.getElementById('feedback-card');
    if (!btn || !balloon || !overlay || !card) return;

    const bodyInput = document.getElementById('fb-body');
    const SHOW_AFTER = 1200;    // 開いてすぐは出さない。紙が出てから見せる
    const HIDE_AFTER = 9000;    // 放っておいたら自分で引っ込む

    // --- 吹き出し -----------------------------------------------------------

    // 印の真下に、右端を合わせて置く（09-16）。中央合わせだと 1440 幅でも右が切れる。
    function placeBalloon() {
        const r = btn.getBoundingClientRect();
        if (!r.width) return false;
        balloon.style.top = (r.bottom + 12) + 'px';
        balloon.style.right = Math.max(8, window.innerWidth - r.right - 8) + 'px';
        // 三角の先が印の真ん中を指すように、右端からの距離を合わせる
        const arrow = balloon.querySelector('.fb-arrow');
        if (arrow) {
            const fromRight = (window.innerWidth - r.right - 8);
            arrow.style.right = Math.max(10, r.width / 2 + Math.max(0, 8 - fromRight) - 6) + 'px';
        }
        return true;
    }

    let hideTimer = 0;
    function hideBalloon() {
        clearTimeout(hideTimer);
        balloon.classList.remove('is-on');
    }

    function showBalloon() {
        // 印が隠れている（狭い画面）なら出さない
        if (!btn.offsetParent) return;
        // 使い方の箱が出ている間は待つ。閉じてから出す（09-16 Rayan様）
        const welcome = document.getElementById('welcome-overlay');
        if (welcome && welcome.style.display === 'flex') { setTimeout(showBalloon, 300); return; }
        if (!placeBalloon()) return;
        balloon.classList.add('is-on');
        hideTimer = setTimeout(hideBalloon, HIDE_AFTER);
    }

    // 開くたびに毎回出す（09-16 Rayan様。一度消した人にも次から出す）
    setTimeout(showBalloon, SHOW_AFTER);

    // どこかを触ったら引っ込める（吹き出しと印の上は除く）
    document.addEventListener('pointerdown', (e) => {
        if (!balloon.classList.contains('is-on')) return;
        if (e.target instanceof Element && (e.target.closest('#feedback-balloon') || e.target.closest('#btn-feedback') || e.target.closest('#welcome-overlay'))) return;
        hideBalloon();
    }, true);
    window.addEventListener('resize', () => { if (balloon.classList.contains('is-on')) placeBalloon(); });

    // --- 窓 -----------------------------------------------------------------

    function open() {
        hideBalloon();
        card.classList.remove('is-done');
        overlay.style.display = 'flex';
        setTimeout(() => bodyInput && bodyInput.focus(), 30);
    }
    function close() {
        overlay.style.display = 'none';
    }
    window.openFeedback = open;
    window.closeFeedback = close;

    btn.addEventListener('click', open);
    document.getElementById('fb-close').addEventListener('click', close);
    // 外側の暗い所を押したら閉じる。中身の上は閉じない
    overlay.addEventListener('pointerdown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.style.display === 'flex') { e.stopPropagation(); close(); }
    }, true);

    // 種類は1つだけ選べる
    document.getElementById('fb-kinds').addEventListener('click', (e) => {
        const b = e.target instanceof Element ? e.target.closest('.fb-kind') : null;
        if (!b) return;
        document.querySelectorAll('#fb-kinds .fb-kind').forEach(x => x.classList.toggle('is-on', x === b));
    });

    // --- 送る ---------------------------------------------------------------

    const sendBtn = document.getElementById('fb-send');
    const contactInput = document.getElementById('fb-contact');
    const doneIcon = document.getElementById('fb-done-icon');
    const doneText = document.getElementById('fb-done-text');
    let sending = false;

    function selectedKind() {
        const on = document.querySelector('#fb-kinds .fb-kind.is-on');
        return on ? on.dataset.kind : 'other';
    }

    sendBtn.addEventListener('click', async () => {
        if (sending) return;
        const body = (bodyInput.value || '').trim();
        // 中身が空なら送らない。欄に印を出して気づかせる
        if (!body) {
            bodyInput.focus();
            bodyInput.style.borderColor = 'var(--c-danger)';
            setTimeout(() => { bodyInput.style.borderColor = ''; }, 1600);
            return;
        }
        sending = true;
        sendBtn.disabled = true;
        sendBtn.textContent = '送っています';
        try {
            const res = await fetch('/api/feedback', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({
                    kind: selectedKind(),
                    body,
                    contact: (contactInput.value || '').trim(),
                    page: location.pathname + location.search,
                }),
            });
            if (!res.ok) throw new Error(String(res.status));
            doneIcon.textContent = 'check_circle';   // 送れた印（09-16 Rayan様）
            doneIcon.classList.remove('is-fail');
            doneText.textContent = '送信しました。\n貴重なご意見をありがとうございます。\nいただいた内容は今後の改善に役立てます';
            card.classList.add('is-done');
            // 送れた分は消しておく。次に開いた時に前の文が残らないように
            bodyInput.value = '';
            contactInput.value = '';
            setTimeout(close, 3500);   // 文が長いので読み終わるまで待つ
        } catch (_) {
            // 送れなかった時は書いた文を消さない。そのまま押し直せる
            doneIcon.textContent = 'error';
            doneIcon.classList.add('is-fail');
            doneText.textContent = '送れませんでした。少し経ってからもう一度お試しください';
            card.classList.add('is-done');
            setTimeout(() => { card.classList.remove('is-done'); }, 2600);
        } finally {
            sending = false;
            sendBtn.disabled = false;
            sendBtn.textContent = '送る';
        }
    });
})();
