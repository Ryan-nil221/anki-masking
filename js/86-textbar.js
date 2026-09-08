// 選んだテキストの上に出る道具の帯（08-16 Rayan様の案）。
//   ・箱のすぐ上に浮かせる。上に入らなければ下へ回す
//   ・左端のつまみが「掴んで動かす所」。箱の周りには破線と右の丸だけ
//   ・中身の処理は設定パネルと同じ関数を呼ぶ。二重に書かない
(() => {
    const bar = document.getElementById('text-toolbar');
    const palette = document.getElementById('tb-palette');
    const decorMenu = document.getElementById('tb-decor-menu');
    const numList = document.getElementById('tb-num-list');
    const spacingPop = document.getElementById('tb-spacing-pop');
    const linePop = document.getElementById('tb-line-pop');
    if (!bar || !palette || !decorMenu || !numList || !spacingPop || !linePop) return;

    // 数字の一覧は body の直下へ移す（09-08 Rayan様）。左の設定パネルの欄からも開くので、
    // 紙の入れ物の中に置いたままだと重なりの順でパネルの後ろに隠れてしまう。
    // 位置は画面に対して決めている（fixed）ので、どこに置いても出る場所は変わらない。
    document.body.appendChild(numList);

    // 数字の欄から出す「よく使う値」。打ち込みもできるので、目安だけ並べる。
    const SIZE_STEPS = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 64, 72];


    const GAP = 10;              // 箱と帯のすき間
    const ALIGNS = ['left', 'center', 'right'];
    const ALIGN_ICON = { left: 'format_align_left', center: 'format_align_center', right: 'format_align_right' };

    const sizeInput = document.getElementById('tb-size');
    const spacingInput = document.getElementById('tb-spacing');
    const colorBtn = document.getElementById('tb-color');
    const decorBtn = document.getElementById('tb-decor');
    const spacingBtn = document.getElementById('tb-spacing-btn');
    const lineInput = document.getElementById('tb-line');
    const lineBtn = document.getElementById('tb-line-btn');
    const alignBtn = document.getElementById('tb-align');
    const dirBtn = document.getElementById('tb-dir');

    function target() {
        const sel = document.querySelectorAll('.text-wrapper.selected');
        return sel.length === 1 ? sel[0] : null;
    }

    // --- 置き場所 -----------------------------------------------------------

    // 1コマに1回だけ置き直す。連続で呼ばれても重くならない。
    let raf = 0;
    function schedule() {
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; place(); });
    }

    // 箱の大きさが変わったら追いかける（文字を打つ・幅を引っぱる・大きさを変える）
    let watched = null;
    const sizeWatcher = (typeof ResizeObserver === 'function') ? new ResizeObserver(schedule) : null;
    function watch(el) {
        if (!sizeWatcher || watched === el) return;
        if (watched) sizeWatcher.unobserve(watched);
        watched = el;
        if (el) sizeWatcher.observe(el);
    }

    function place() {
        // 選んでいなかった箱を運んでいる最中は、帯を出さない（08-16 Rayan様）。
        // 運びたいだけなので、置くまで何も出さずにおく。
        if (typeof action !== 'undefined' && action === 'move'
            && typeof pressWasUnselected !== 'undefined' && pressWasUnselected) {
            bar.style.display = 'none';
            closeAllPopups();
            return;
        }
        const el = target();
        watch(el);
        // 箱を選んでいなければ帯は出さない。ただし左の設定パネルの欄から開いた数字の一覧は、
        // 帯とは関わりが無いので閉じない（閉じると押した瞬間に消えてしまう）。
        if (!el) {
            bar.style.display = 'none';
            closeAllPopups(numListFor && !bar.contains(numListFor) ? numList : undefined);
            return;
        }

        bar.style.display = 'flex';
        reflect(el);
        const r = el.getBoundingClientRect();
        const c = workspaceContainer.getBoundingClientRect();
        const w = bar.offsetWidth, h = bar.offsetHeight;

        // 箱の左端に揃える（08-16 Rayan様）。中心合わせだと、文字を打つたびに
        // 帯が左右へ動いて落ち着かない。左端なら箱が伸びても止まったまま。
        // ただし紙を入れている箱からはみ出さないよう端で止める。
        let left = r.left;
        left = Math.max(c.left + 6, Math.min(left, c.right - w - 6));

        // 既定は箱の上。入らなければ下へ
        let top = r.top - h - GAP;
        if (top < c.top + 6) top = r.bottom + GAP;
        bar.style.left = left + 'px';
        bar.style.top = top + 'px';
        if (palette.style.display !== 'none') placePopup(palette, colorBtn);
        if (decorMenu.style.display !== 'none') placePopup(decorMenu, decorBtn);
        if (spacingPop.style.display !== 'none') placePopup(spacingPop, spacingBtn);
        if (linePop.style.display !== 'none') placePopup(linePop, lineBtn);
        if (numListFor) placeNumList(numListFor);
    }
    window.placeTextToolbar = place;

    // 帯の色の見本は「今カーソルがいる場所の色」を映す（09-08 Rayan様）。
    // 文字の一部を選んで色を変えると中の span に色が入るので、箱の style.color を
    // 見るだけでは前の色のままになる。実際に効いている色を computed から拾う。
    function colorAt(el) {
        // 文字を打てる状態で色を選ぶと、その場では中身が変わらず「次に打つ字の色」として
        // 取り置かれる。DOM を見ても前の色のままなので、打つまで見本が変わらなかった
        // （09-08 Rayan様）。編集中は取り置きも含む今の色をブラウザに訊く。
        if (el.contains(document.activeElement)) {
            try {
                const q = document.queryCommandValue('foreColor');
                if (q) return q;
            } catch (_) { /* 使えない環境では下の見方に落とす */ }
        }
        const sel = window.getSelection();
        let node = null;
        if (sel && sel.rangeCount > 0 && sel.anchorNode && el.contains(sel.anchorNode)) node = sel.anchorNode;
        else if (typeof savedSelectionRange !== 'undefined' && savedSelectionRange
                 && el.contains(savedSelectionRange.commonAncestorContainer)) node = savedSelectionRange.commonAncestorContainer;
        if (node) {
            const e2 = (node.nodeType === 3) ? node.parentElement : node;
            if (e2) {
                const c = getComputedStyle(e2).color;
                if (c) return c;
            }
        }
        return el.style.color || '#ef4444';
    }

    // カーソルを別の色の所へ動かした時も見本を合わせる。位置は変わらないので色だけ。
    document.addEventListener('selectionchange', () => {
        if (bar.style.display === 'none') return;
        const el = target();
        if (el) colorBtn.style.background = colorAt(el);
    });

    // 今の箱の様子を帯に映す
    function reflect(el) {
        const size = parseInt(el.style.fontSize) || 20;
        if (document.activeElement !== sizeInput) sizeInput.value = size;
        reflectSpacing(el);
        reflectLine(el);
        colorBtn.style.background = colorAt(el);
        const align = el.style.textAlign || 'left';
        alignBtn.querySelector('.material-symbols-outlined').textContent = ALIGN_ICON[align] || ALIGN_ICON.left;
        const vertical = (el.style.writingMode || '').startsWith('vertical');
        dirBtn.querySelector('.material-symbols-outlined').style.transform = vertical ? 'rotate(90deg)' : '';
        dirBtn.title = vertical ? '横書きにする' : '縦書きにする';
    }

    // --- 文字の大きさ -------------------------------------------------------

    // 上下の矢印は 1 つずつ動かす。押しっぱなしにすると続けて動く。
    // （一覧の値へ飛ばす形にしたが、1 つずつに戻した・09-08 Rayan様）
    function stepSize(delta) {
        const el = target();
        if (!el) return;
        const now = parseInt(el.style.fontSize) || 20;
        setSize(now + delta);
    }

    function setSize(value) {
        const el = target();
        const size = Math.max(10, parseInt(value) || 20);
        sizeInput.value = size;
        if (!el) return;
        textSizeInput.value = size;          // 左のパネルの数字も合わせる
        applyFontSizeKeepBottomLeft(el, size);
        if (!holding) window.saveState();
        place();
    }

    // --- 文字と文字のすき間（字間） -----------------------------------------

    // 小窓の数字を今の箱に合わせる。小窓が閉じている間も呼ばれるが害はない。
    function reflectSpacing(el) {
        const t = el || target();
        if (!t || document.activeElement === spacingInput) return;
        spacingInput.value = spacingOf(t);
    }

    // 帯の数字は左のパネルではなく、今の箱の値を映す。
    // 欄に出すのは実際のすき間に 5 を足した数（マイナスを見せないため・09-08 Rayan様）。
    function spacingOf(el) {
        const v = parseFloat(el.style.letterSpacing);
        return window.spacingToShown(isNaN(v) ? 0 : v);
    }

    // 受け取るのも返すのも「欄に出す数字」。
    function setSpacing(shown) {
        const el = target();
        let v = Math.round((parseFloat(shown) || 0) * 2) / 2;   // 0.5px 刻み
        if (v < 0) v = 0;
        if (v > 35) v = 35;
        spacingInput.value = v;
        if (!el) return;
        textSpacingInput.value = v;          // 左のパネルの数字も合わせる
        applyLetterSpacingKeepBottomLeft(el, window.shownToSpacing(v));
        if (!holding) window.saveState();
        place();
    }

    function stepSpacing(delta) {
        const el = target();
        if (!el) return;
        setSpacing(spacingOf(el) + delta);
    }

    // --- 行と行のすき間（行間） ---------------------------------------------

    // 作りは字間と同じ。実際の値は箱の data-line-spacing に入っている。
    function lineOf(el) {
        const v = parseFloat(el.dataset.lineSpacing);
        return Math.round(window.lineToShown(isNaN(v) ? 0 : v, window.fontSizeOf(el)));
    }

    function reflectLine(el) {
        const t = el || target();
        if (!t || document.activeElement === lineInput) return;
        lineInput.value = lineOf(t);
    }

    function setLine(shown) {
        const el = target();
        let v = Math.round(parseFloat(shown) || 0);   // 行間は 1 刻み（09-08 Rayan様）
        if (v < 0) v = 0;
        if (v > window.LINE_SHOWN_MAX) v = window.LINE_SHOWN_MAX;
        lineInput.value = v;
        if (!el) return;
        lineSpacingInput.value = v;          // 左のパネルの数字も合わせる
        applyLineSpacingKeepBottomLeft(el, window.shownToLine(v, window.fontSizeOf(el)));
        if (!holding) window.saveState();
        place();
    }

    function stepLine(delta) {
        const el = target();
        if (!el) return;
        setLine(lineOf(el) + delta);
    }

    // --- 色 -----------------------------------------------------------------

    function buildPalette() {
        document.querySelectorAll('#color-palette .swatch:not(.custom-swatch)').forEach(sw => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tb-swatch';
            b.title = sw.title || '';
            b.style.background = sw.dataset.color;
            b.addEventListener('pointerdown', (e) => { e.preventDefault(); pickColor(sw.dataset.color); });
            palette.appendChild(b);
        });
        // その他の色は、設定パネルにある色選びをそのまま呼ぶ
        const more = document.createElement('button');
        more.type = 'button';
        more.className = 'tb-swatch tb-swatch-more';
        more.title = 'その他の色';
        more.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            closeAllPopups();
            document.getElementById('custom-color-swatch').click();
        });
        palette.appendChild(more);
    }

    function pickColor(color) {
        if (typeof currentTool !== 'undefined' && currentTool === 'text') toolColors['text'] = color;
        applyColorToSelection(color);
        closeAllPopups();
        place();
    }

    // 帯から出る小窓（色の一覧・飾りの3つ）は帯の上に出す（08-16 Rayan様）。
    // 下だと文字を隠してしまう。上に入らない時だけ下へ回す。
    function placePopup(el, anchor) {
        const b = anchor.getBoundingClientRect();
        const t = bar.getBoundingClientRect();
        const c = workspaceContainer.getBoundingClientRect();
        let left = b.left + b.width / 2 - el.offsetWidth / 2;
        left = Math.max(c.left + 6, Math.min(left, c.right - el.offsetWidth - 6));
        let top = t.top - el.offsetHeight - 6;
        if (top < c.top + 6) top = t.bottom + 6;
        el.style.left = left + 'px';
        el.style.top = top + 'px';
    }
    function openPopup(el, anchor) {
        closeAllPopups();
        el.style.display = 'flex';
        placePopup(el, anchor);
    }
    // 字間の小窓は帯の上に出す。中で数字の一覧を開いても閉じない。
    function openSpacingPop() {
        openPopup(spacingPop, spacingBtn);
        reflectSpacing();
    }
    function openLinePop() {
        openPopup(linePop, lineBtn);
        reflectLine();
    }
    // 数字の一覧は1つを使い回す。今どちらの欄のものかを覚えておく。
    let numListFor = null;
    // 矢印を押しっぱなしにしている間は true。この間は履歴に積まない。
    let holding = false;
    // 数字の欄へ移る前に文字を編集していたら、決めたあと編集へ戻す。
    // 置いたばかりの箱で大きさを決めると、そのまま打てなくなるため（09-08 Rayan様）。
    let editingBefore = null;
    function backToEditing() {
        const tc = editingBefore;
        editingBefore = null;
        if (!tc || !tc.isConnected) return;
        const el = tc.closest('.text-wrapper');
        if (!el || !el.classList.contains('selected')) return;
        tc.focus();
        // 文字カーソルは末尾へ置く
        const r = document.createRange();
        r.selectNodeContents(tc); r.collapse(false);
        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
    }
    // keep に渡したものは閉じない。数字の一覧は字間の小窓の中からも開くので、
    // その時だけ小窓を残す（閉じると欄ごと消えてしまう）。
    function closeAllPopups(keep) {
        if (palette !== keep) palette.style.display = 'none';
        if (decorMenu !== keep) decorMenu.style.display = 'none';
        if (spacingPop !== keep) spacingPop.style.display = 'none';
        if (linePop !== keep) linePop.style.display = 'none';
        if (numList !== keep) { numList.style.display = 'none'; numListFor = null; }
    }

    // --- 数字の欄から出す一覧 -----------------------------------------------

    function openNumList(input, steps, apply) {
        closeAllPopups(spacingPop.contains(input) ? spacingPop : null);
        numListFor = input;
        numList.innerHTML = '';
        const now = parseFloat(input.value);
        steps.forEach(v => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'tb-num-item';
            b.textContent = String(v);
            if (v === now) b.classList.add('is-now');
            // pointerdown で拾う。click まで待つと、先に欄から外れて一覧が閉じてしまう。
            b.addEventListener('pointerdown', (e) => {
                e.preventDefault(); e.stopPropagation();
                apply(v);
                closeAllPopups();
                backToEditing();
            });
            numList.appendChild(b);
        });
        numList.style.display = 'flex';
        placeNumList(input);
        const now2 = numList.querySelector('.is-now');
        if (now2) now2.scrollIntoView({ block: 'center' });
    }

    // 欄の真下に出す。下に入らなければ上へ回す。
    // （一度は上に出したが、下に戻した・09-08 Rayan様）
    // 左の設定パネルの欄からも開くので、紙の外にある欄では画面いっぱいを枠にする。
    // 紙の枠で押さえると、パネルの真下ではなく紙の左端まで寄ってしまう。
    function placeNumList(input) {
        const r = input.getBoundingClientRect();
        const c = workspaceContainer.contains(input)
            ? workspaceContainer.getBoundingClientRect()
            : { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
        const w = numList.offsetWidth, h = numList.offsetHeight;
        let left = r.left + r.width / 2 - w / 2;
        left = Math.max(c.left + 6, Math.min(left, c.right - w - 6));
        let top = r.bottom + 6;
        if (top + h > c.bottom - 6) top = Math.max(c.top + 6, r.top - h - 6);
        numList.style.left = left + 'px';
        numList.style.top = top + 'px';
    }

    // --- 押した時 -----------------------------------------------------------

    // 帯の中の操作で、箱の選択や文字のカーソルが外れないようにする
    bar.addEventListener('pointerdown', (e) => {
        const a = document.activeElement;
        if (a && a.classList && a.classList.contains('text-content')) editingBefore = a;
        e.stopPropagation();
        if (e.target !== sizeInput && e.target !== spacingInput) e.preventDefault();
    });
    [palette, decorMenu, numList, spacingPop, linePop].forEach(el => {
        el.addEventListener('pointerdown', (e) => {
            e.stopPropagation();
            // 欄は押して打てるように、そこだけ止めない
            if (e.target !== spacingInput && e.target !== lineInput) e.preventDefault();
        });
    });

    // 押しっぱなしにすると続けて動く（09-08 Rayan様）。
    // 押した瞬間に1回動かし、少し待ってから細かく繰り返す。
    // 繰り返している間は履歴に積まず、離した時に1回だけ積む
    // （60ms ごとに積むと「元に戻す」が何十回分にもなってしまう）。
    const HOLD_WAIT = 400, HOLD_EVERY = 60;
    function holdToRepeat(btn, run) {
        let waitId = 0, repeatId = 0;
        const stop = (e) => {
            if (!waitId && !repeatId) return;
            clearTimeout(waitId); clearInterval(repeatId);
            waitId = repeatId = 0;
            holding = false;
            window.saveState();
            if (e) { try { btn.releasePointerCapture(e.pointerId); } catch (_) {} }
        };
        btn.addEventListener('pointerdown', (e) => {
            e.preventDefault(); e.stopPropagation();
            holding = true;
            run();
            btn.setPointerCapture(e.pointerId);
            waitId = setTimeout(() => { repeatId = setInterval(run, HOLD_EVERY); }, HOLD_WAIT);
        });
        ['pointerup', 'pointercancel'].forEach(ev => btn.addEventListener(ev, stop));
    }
    holdToRepeat(document.getElementById('tb-size-up'), () => stepSize(1));
    holdToRepeat(document.getElementById('tb-size-down'), () => stepSize(-1));
    sizeInput.addEventListener('change', () => setSize(sizeInput.value));
    sizeInput.addEventListener('keydown', (e) => {
        e.stopPropagation();   // ショートカット（Delete など）に持っていかれないように
        if (e.key === 'Enter') { e.preventDefault(); setSize(sizeInput.value); sizeInput.blur(); backToEditing(); }
    });

    // 大きさの欄を押すと一覧が出る。そのまま数字を打つこともできる（09-08 Rayan様）。
    // 字間の欄には一覧を出さない（小窓の中でさらに一覧を出すと分かりにくいため）。
    // 左の設定パネルの数字の欄からも同じ一覧を使う（09-08 Rayan様）。1つを使い回す。
    window.openTextNumList = (input, apply) => openNumList(input, SIZE_STEPS, apply);
    window.closeTextNumList = () => { if (numListFor) closeAllPopups(); };
    window.isTextNumListFor = (input) => numListFor === input;

    sizeInput.addEventListener('focus', () => openNumList(sizeInput, SIZE_STEPS, (v) => setSize(v)));
    sizeInput.addEventListener('pointerdown', () => {
        if (document.activeElement === sizeInput) openNumList(sizeInput, SIZE_STEPS, (v) => setSize(v));
    });
    // 欄から外れたら閉じる。一覧の項目は pointerdown で拾うので、押す前に閉じても間に合う。
    sizeInput.addEventListener('blur', () => { if (numListFor === sizeInput) closeAllPopups(); });

    // 字間と行間は印だけを帯に置き、押すと数字の欄が上に出る（09-08 Rayan様）。
    spacingBtn.addEventListener('click', () => {
        (spacingPop.style.display === 'none') ? openSpacingPop() : closeAllPopups();
    });
    lineBtn.addEventListener('click', () => {
        (linePop.style.display === 'none') ? openLinePop() : closeAllPopups();
    });
    lineInput.addEventListener('change', () => setLine(lineInput.value));
    lineInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); setLine(lineInput.value); lineInput.blur(); backToEditing(); }
    });

    holdToRepeat(document.getElementById('tb-spacing-up'), () => stepSpacing(0.5));
    holdToRepeat(document.getElementById('tb-spacing-down'), () => stepSpacing(-0.5));
    holdToRepeat(document.getElementById('tb-line-up'), () => stepLine(1));
    holdToRepeat(document.getElementById('tb-line-down'), () => stepLine(-1));
    spacingInput.addEventListener('change', () => setSpacing(spacingInput.value));
    spacingInput.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); setSpacing(spacingInput.value); spacingInput.blur(); backToEditing(); }
    });

    colorBtn.addEventListener('click', () => {
        (palette.style.display === 'none') ? openPopup(palette, colorBtn) : closeAllPopups();
    });

    // 太字・下線・取り消し線は1つのボタンにまとめた（09-08 Rayan様）。
    // 押すと3つが出る。掛けたあとも開いたままにして、続けて重ねられるようにする。
    decorBtn.addEventListener('click', () => {
        (decorMenu.style.display === 'none') ? openPopup(decorMenu, decorBtn) : closeAllPopups();
    });

    document.getElementById('tb-bold').addEventListener('click', () => applyTextCommand('bold'));
    document.getElementById('tb-underline').addEventListener('click', () => applyTextCommand('underline'));
    document.getElementById('tb-strike').addEventListener('click', () => applyTextCommand('strikeThrough'));

    // 揃えは押すたびに 左→中央→右 と回す（ボタン1つで済ませる）
    alignBtn.addEventListener('click', () => {
        const el = target();
        if (!el) return;
        const now = el.style.textAlign || 'left';
        setTextAlign(ALIGNS[(ALIGNS.indexOf(now) + 1) % ALIGNS.length]);
        place();
    });

    dirBtn.addEventListener('click', () => {
        const el = target();
        if (!el) return;
        const vertical = (el.style.writingMode || '').startsWith('vertical');
        setTextDirection(vertical ? 'horizontal-tb' : 'vertical-rl');
        place();
    });

    // --- つまみで箱を動かす -------------------------------------------------

    // 箱そのものを掴むと編集に入ってしまうので、動かすのはここから。
    const grip = document.getElementById('text-toolbar-grip');
    let dragging = null;
    grip.addEventListener('pointerdown', (e) => {
        const el = target();
        if (!el) return;
        e.preventDefault(); e.stopPropagation();
        dragging = {
            el,
            fromX: e.clientX, fromY: e.clientY,
            left: parseFloat(el.style.left) || 0,
            top: parseFloat(el.style.top) || 0,
            moved: false,
        };
        grip.setPointerCapture(e.pointerId);
    });
    grip.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        // 紙は拡大縮小されているので、動かす量も同じ割合で割る
        const z = (typeof zoomLevel === 'number' && zoomLevel > 0) ? zoomLevel : 1;
        const dx = (e.clientX - dragging.fromX) / z;
        const dy = (e.clientY - dragging.fromY) / z;
        dragging.el.style.left = (dragging.left + dx) + 'px';
        dragging.el.style.top = (dragging.top + dy) + 'px';
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) dragging.moved = true;
        schedule();
    });
    function endDrag(e) {
        if (!dragging) return;
        const moved = dragging.moved;
        dragging = null;
        try { grip.releasePointerCapture(e.pointerId); } catch (_) {}
        if (moved) window.saveState();
        place();
    }
    grip.addEventListener('pointerup', endDrag);
    grip.addEventListener('pointercancel', endDrag);

    // 選択が変わる所を1つずつ拾うのは難しいので、操作のあとに見直す。
    ['pointerup', 'keyup'].forEach(ev => document.addEventListener(ev, () => setTimeout(place, 0), true));
    // 掴んで動かしている間・文字を打っている間も、離さずについていく。
    let pressing = false;
    document.addEventListener('pointerdown', () => { pressing = true; }, true);
    document.addEventListener('pointerup', () => { pressing = false; }, true);
    document.addEventListener('pointercancel', () => { pressing = false; }, true);
    document.addEventListener('pointermove', () => { if (pressing) schedule(); }, true);
    document.addEventListener('input', schedule, true);
    workspaceContainer.addEventListener('scroll', () => { closeAllPopups(); place(); }, { passive: true });
    window.addEventListener('resize', () => { closeAllPopups(); place(); });

    buildPalette();
})();
