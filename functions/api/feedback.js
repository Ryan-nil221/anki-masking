// 問い合わせの受け口（Cloudflare Pages Functions）。
// 画面から送られた内容を Discord へ流すだけ。資料の中身は受け取らない。
// 送り先は Cloudflare の環境変数 DISCORD_FEEDBACK_WEBHOOK に入れる（秘密なのでコードに書かない）。

const KIND_LABEL = { bug: '不具合', request: 'こうしてほしい', other: 'その他' };
const MAX_BODY = 2000;      // 本文の上限。これより長い分は切る
const MAX_CONTACT = 200;

// 見せたくない文字を落とす（Discord の書式や名指しが効いてしまわないように）
function clean(s, max) {
    return String(s == null ? '' : s)
        .slice(0, max)
        .replace(/@(everyone|here)/gi, '@​$1')
        .replace(/```/g, '⁠```');
}

export async function onRequestPost({ request, env }) {
    const url = env.DISCORD_FEEDBACK_WEBHOOK;
    if (!url) {
        return json({ ok: false, error: 'not-configured' }, 500);
    }

    let data;
    try {
        data = await request.json();
    } catch (_) {
        return json({ ok: false, error: 'bad-request' }, 400);
    }

    const body = clean(data.body, MAX_BODY).trim();
    if (!body) return json({ ok: false, error: 'empty' }, 400);

    const kind = KIND_LABEL[data.kind] || KIND_LABEL.other;
    const contact = clean(data.contact, MAX_CONTACT).trim();
    const page = clean(data.page, 300).trim();
    const agent = clean(request.headers.get('user-agent') || '', 300);
    // 国だけ控えておく（どこから来た声かの目安。個人は特定しない）
    const country = request.headers.get('cf-ipcountry') || '';

    const lines = [
        `**${kind}**`,
        '```',
        body,
        '```',
        contact ? `返事先: ${contact}` : '返事先: （なし）',
        page ? `画面: ${page}` : '',
        `環境: ${country} / ${agent}`,
    ].filter(Boolean);

    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
            username: '暗記マスキング 問い合わせ',
            content: lines.join('\n').slice(0, 1900),
            allowed_mentions: { parse: [] },
        }),
    });

    if (!res.ok) {
        return json({ ok: false, error: 'send-failed' }, 502);
    }
    return json({ ok: true });
}

// 直接開かれた時に中身を見せない
export async function onRequestGet() {
    return json({ ok: false, error: 'post-only' }, 405);
}

function json(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { 'content-type': 'application/json; charset=utf-8' },
    });
}
