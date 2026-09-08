// ===== 40-elements.js : 手描きの座標操作・暗記マーカー/蛍光/テキスト要素の生成と編集 =====
// app.js を分割したもの。素のスクリプトなので変数は全ファイルで共有される。
// index.html の読み込み順を変えると壊れる。

        // --- 手書き線のジオメトリ（座標）操作 ---
        function isFreehandElement(el) {
            return !!el && (el.classList.contains('mask-freehand-wrapper') || el.classList.contains('highlight-freehand-wrapper'));
        }
        // "M x y L x y ..." から点の配列を取り出す
        function parseFreehandPath(d) {
            const nums = (d || '').match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi);
            if (!nums) return [];
            const pts = [];
            for (let i = 0; i + 1 < nums.length; i += 2) pts.push({ x: parseFloat(nums[i]), y: parseFloat(nums[i + 1]) });
            return pts;
        }
        // ワークスペース座標での点の配列
        function freehandPointsWorkspace(wrapper) {
            const svg = wrapper.querySelector('svg');
            const vb = svg.viewBox.baseVal;
            const w = parseFloat(wrapper.style.width) || vb.width;
            const h = parseFloat(wrapper.style.height) || vb.height;
            const sx = vb.width ? w / vb.width : 1;
            const sy = vb.height ? h / vb.height : 1;
            const left = parseFloat(wrapper.style.left) || 0;
            const top = parseFloat(wrapper.style.top) || 0;
            return parseFreehandPath(wrapper.querySelector('.fh-stroke').getAttribute('d'))
                .map(p => ({ x: left + p.x * sx, y: top + p.y * sy }));
        }
        // ワークスペース座標の点から、外接四角形・viewBox・パスを組み直す
        function rebuildFreehand(wrapper, pts) {
            if (!pts.length) return;
            const stroke = wrapper.querySelector('.fh-stroke');
            const pw = parseFloat(stroke.getAttribute('stroke-width')) || 15;
            const pad = pw / 2 + 2;
            const minX = Math.min(...pts.map(p => p.x)) - pad;
            const minY = Math.min(...pts.map(p => p.y)) - pad;
            const w = Math.max(...pts.map(p => p.x)) + pad - minX;
            const h = Math.max(...pts.map(p => p.y)) + pad - minY;
            const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x - minX} ${p.y - minY}`).join(' ');

            wrapper.style.left = minX + 'px';
            wrapper.style.top = minY + 'px';
            wrapper.style.width = w + 'px';
            wrapper.style.height = h + 'px';
            wrapper.querySelector('svg').setAttribute('viewBox', `0 0 ${w} ${h}`);
            stroke.setAttribute('d', d);
            wrapper.querySelector('.fh-center').setAttribute('d', d);
            updateFreehandUI(wrapper);
        }
        // 両端のつまみを線の端に合わせ、中心線の色も線の明るさに追従させる
        function updateFreehandUI(wrapper) {
            const svg = wrapper.querySelector('svg');
            const vb = svg.viewBox.baseVal;
            const stroke = wrapper.querySelector('.fh-stroke');
            const center = wrapper.querySelector('.fh-center');
            if (center) center.setAttribute('stroke', centerLineColorFor(stroke.style.stroke || stroke.getAttribute('stroke')));
            const pts = parseFreehandPath(stroke.getAttribute('d'));
            if (!pts.length) return;
            const ends = { start: pts[0], end: pts[pts.length - 1] };
            wrapper.querySelectorAll('.fh-handle').forEach(h => {
                const p = ends[h.dataset.end];
                h.style.left = (vb.width ? (p.x / vb.width) * 100 : 0) + '%';
                h.style.top = (vb.height ? (p.y / vb.height) * 100 : 0) + '%';
            });
        }

        window.createHighlightElement = function(left, top, width, height, bgColor) {
            const box = document.createElement('div'); box.className = 'canvas-element highlight-box';
            box.style.left = left; box.style.top = top; box.style.width = width; box.style.height = height;
            box.style.backgroundColor = bgColor; addResizeHandles(box); 
            window.bringToFront(box);
            workspace.appendChild(box); return box;
        }

        // 外部 .amk 由来のテキストHTMLを無害化（保存型XSS対策）。
        // アプリが生成する装飾タグ・スタイルのみ許可し、script/img/onXXX等は除去。
        function sanitizeTextHTML(html) {
            const allowedTags = new Set(['B','STRONG','U','S','STRIKE','I','EM','SPAN','DIV','P','BR','FONT']);
            const allowedStyle = ['color','font-weight','text-decoration','text-align','writing-mode','font-style'];
            const tpl = document.createElement('template');
            tpl.innerHTML = html || '';
            const walk = (node) => {
                Array.from(node.childNodes).forEach(child => {
                    if (child.nodeType === Node.ELEMENT_NODE) {
                        if (!allowedTags.has(child.tagName)) {
                            child.replaceWith(document.createTextNode(child.textContent));
                            return;
                        }
                        Array.from(child.attributes).forEach(attr => {
                            const n = attr.name.toLowerCase();
                            if (n === 'color' && child.tagName === 'FONT') return;
                            if (n === 'style') {
                                const safe = [];
                                (child.getAttribute('style') || '').split(';').forEach(decl => {
                                    const idx = decl.indexOf(':'); if (idx < 0) return;
                                    const key = decl.slice(0, idx).trim().toLowerCase();
                                    const val = decl.slice(idx + 1).trim();
                                    if (allowedStyle.includes(key) && !/url\s*\(|expression|javascript:/i.test(val)) safe.push(`${key}:${val}`);
                                });
                                if (safe.length) child.setAttribute('style', safe.join(';')); else child.removeAttribute('style');
                                return;
                            }
                            child.removeAttribute(attr.name);
                        });
                        walk(child);
                    }
                });
            };
            walk(tpl.content);
            return tpl.innerHTML;
        }

        window.createTextElement = function(left, top, width, height, content = '', fontSize = '20px', color = '#ef4444', textAlign = 'left', writingMode = 'horizontal-tb', letterSpacing = 'normal', lineSpacing = 0) {
            const wrapper = document.createElement('div'); wrapper.className = 'canvas-element text-wrapper';
            wrapper.style.left = left; wrapper.style.top = top;
            if (width) wrapper.style.width = width; if (height) wrapper.style.height = height;
            wrapper.style.fontSize = fontSize; wrapper.style.color = color; 
            wrapper.style.textAlign = textAlign;
            wrapper.style.writingMode = writingMode;
            wrapper.style.letterSpacing = letterSpacing || 'normal';
            
            const textContent = document.createElement('div'); textContent.className = 'text-content'; textContent.contentEditable = "true"; textContent.innerHTML = sanitizeTextHTML(content);
            textContent.style.textAlign = textAlign;
            textContent.style.writingMode = writingMode;
            textContent.style.letterSpacing = letterSpacing || 'normal';
            
            wrapper.appendChild(textContent);
            // すき間が 0 でも入れる。入れないと normal のままになり、
            // 触ったことのある箱と無い箱で1行の高さが少し食い違う（09-08 Rayan様）。
            setLineSpacing(wrapper, parseFloat(lineSpacing) || 0);
            addResizeHandles(wrapper); addTextHandles(wrapper); 
            window.bringToFront(wrapper);
            workspace.appendChild(wrapper);
            // 編集終了時の処理（保存・空箱削除・ツール復帰）は workspace への委譲リスナーで
            // 一括処理する。cloneNode で作った複製・貼り付けの箱にも確実に効かせるため。
            return wrapper;
        }

        // テキストだけの取っ手（08-16 Rayan様の指示）。左が掴む所、右が幅を変える所。
        // 見た目を先に用意した段階で、動きはまだ繋いでいない。
        function addTextHandles(element) {
            const grip = document.createElement('div');
            grip.className = 'text-grip';
            // `resize-handle` を兼ねる。大きさを変える処理は既存のものにそのまま乗る。
            const edge = document.createElement('div');
            edge.className = 'resize-handle text-edge-handle';
            edge.dataset.pos = 'e';
            element.appendChild(grip);
            element.appendChild(edge);
        }

        // 【改修】直線(Line)用の専用2点ハンドル（p1, p2）を動的追加
        function addResizeHandles(element) {
            if (element.classList.contains('shape-element') && element.dataset.shapeType === 'line') {
                ['p1', 'p2'].forEach(pos => {
                    const handle = document.createElement('div');
                    handle.className = `resize-handle handle-${pos}`;
                    handle.dataset.pos = pos;
                    element.appendChild(handle);
                });
            } else {
                // 画像は四隅＋各辺の中央（計8点）。四隅は縦横比を保ったまま拡大縮小する。
                const positions = element.classList.contains('image-element')
                    ? ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']
                    : ['nw', 'ne', 'sw', 'se'];
                positions.forEach(pos => {
                    const handle = document.createElement('div');
                    handle.className = `resize-handle handle-${pos}`;
                    handle.dataset.pos = pos;
                    element.appendChild(handle);
                });
            }
        }

        // 文字サイズの候補一覧（▼）は廃止（Rayan様の指示・08-01）。
        // ＋／−と直接入力で足りるうえ、開いても効かない状態だった。

        // 「文字の左下」＝入力開始位置（1行目）のキャレット下端を ws 座標で測る。
        // 空箱は矩形が取れないので、一時的に文字を差し込んで1行目の矩形を測って戻す。
        function measureTextBottomLeftWs(el) {
            const tc = el.querySelector('.text-content');
            const wsRect = workspace.getBoundingClientRect();
            const z = zoomLevel || 1;
            let cr;
            const range = document.createRange();
            range.selectNodeContents(tc);
            const rects = range.getClientRects();
            if (rects.length) {
                cr = rects[0]; // 1行目
            } else {
                const probe = document.createElement('span');
                probe.textContent = ' '; // 非改行スペースで1行分の高さを得る
                tc.appendChild(probe);
                cr = probe.getBoundingClientRect();
                tc.removeChild(probe);
            }
            return { x: (cr.left - wsRect.left) / z, y: (cr.bottom - wsRect.top) / z };
        }
        // 「文字の左上」＝1行目の上端。文字を大きくしても、ここを動かさない（09-08 Rayan様）。
        // 上端が動くと、箱の上に浮かべている道具の帯まで一緒にずれて、矢印が押しにくかった。
        function measureTextTopLeftWs(el) {
            const tc = el.querySelector('.text-content');
            const wsRect = workspace.getBoundingClientRect();
            const z = zoomLevel || 1;
            let cr;
            const range = document.createRange();
            range.selectNodeContents(tc);
            const rects = range.getClientRects();
            if (rects.length) {
                cr = rects[0];
            } else {
                const probe = document.createElement('span');
                probe.textContent = ' ';
                tc.appendChild(probe);
                cr = probe.getBoundingClientRect();
                tc.removeChild(probe);
            }
            return { x: (cr.left - wsRect.left) / z, y: (cr.top - wsRect.top) / z };
        }
        function moveTextTopLeftTo(el, x, y) {
            const cur = measureTextTopLeftWs(el);
            el.style.left = (parseFloat(el.style.left || 0) + (x - cur.x)) + 'px';
            el.style.top = (parseFloat(el.style.top || 0) + (y - cur.y)) + 'px';
        }

        // 箱の「文字の左下」が指定の ws 座標に来るよう平行移動する
        function moveTextBottomLeftTo(el, x, y) {
            const cur = measureTextBottomLeftWs(el);
            el.style.left = (parseFloat(el.style.left || 0) + (x - cur.x)) + 'px';
            el.style.top = (parseFloat(el.style.top || 0) + (y - cur.y)) + 'px';
        }
        // 文字サイズを変えても「文字の左上」が動かないようにする。
        // 変更前の位置を測り、変更後にそこへ戻す（現在位置基準なので移動後も正しい）。
        function applyFontSizeKeepBottomLeft(el, size) {
            const before = measureTextTopLeftWs(el);
            // 行間は文字の大きさに対する割合で持つので、大きさを変えたら作り直す（09-09 Rayan様）
            const shownLine = Math.round(
                window.lineToShown(parseFloat(el.dataset.lineSpacing) || 0, window.fontSizeOf(el)));
            el.style.fontSize = size + 'px';
            setLineSpacing(el, window.shownToLine(shownLine, size));
            moveTextTopLeftTo(el, before.x, before.y);
        }
        function changeGlobalTextSize(delta) {
            let currentSize = parseInt(textSizeInput.value) || 20; let newSize = currentSize + delta; if (newSize < 10) newSize = 10;
            textSizeInput.value = newSize;
            let saved = false;
            selectedElements.forEach(selectedElement => {
                if (selectedElement.classList.contains('text-wrapper')) {
                    applyFontSizeKeepBottomLeft(selectedElement, newSize);
                    saved = true;
                }
            });
            if(saved) window.saveState();
        }
        document.getElementById('btn-text-size-up').addEventListener('click', () => changeGlobalTextSize(1));
        document.getElementById('btn-text-size-down').addEventListener('click', () => changeGlobalTextSize(-1));

        // --- 文字と文字のすき間（字間） ---
        // 文字サイズと同じく、変えても「文字の左上」が動かないようにする。
        function applyLetterSpacingKeepBottomLeft(el, px) {
            const before = measureTextTopLeftWs(el);
            setLetterSpacing(el, px);
            moveTextTopLeftTo(el, before.x, before.y);
        }
        // 箱と中身の両方に入れる。中身にも入れないと、貼り付けた文字が箱の指定を継がないため。
        function setLetterSpacing(el, px) {
            const v = (px ? px + 'px' : 'normal');
            el.style.letterSpacing = v;
            const tc = el.querySelector('.text-content');
            if (tc) tc.style.letterSpacing = v;
        }
        window.setLetterSpacing = setLetterSpacing;
        // 欄に出す数字は、実際のすき間より 5 大きい（09-08 Rayan様）。
        // マイナスの数字を見せないための下駄で、素の状態＝欄の「5」＝すき間 0px。
        // 保存するのは今までどおり実際の値なので、前に作ったデータもそのまま開ける。
        window.SPACING_OFFSET = 5;
        window.spacingToShown = (px) => px + window.SPACING_OFFSET;
        window.shownToSpacing = (n) => n - window.SPACING_OFFSET;
        // 行間の1段は「文字の大きさに対する割合」で決める（09-09 Rayan様）。
        // 固定のピクセルにすると、大きい字では 0 まで下げても行が離れたままだった。
        // 素の状態が欄「5」、欄「0」でちょうど行がくっつく（1行の高さ＝文字の大きさ）ように、
        // 5段で「素の行の高さ → 文字の大きさぴったり」まで下がる割合を1段ぶんとする。
        window.LINE_SHOWN_MAX = 20;
        window.lineStepPx = (fontSize) =>
            (normalLineHeightRatio() - 1) / window.SPACING_OFFSET * (fontSize || 20);
        window.lineToShown = (px, fontSize) => {
            const step = window.lineStepPx(fontSize);
            return step ? (px / step + window.SPACING_OFFSET) : window.SPACING_OFFSET;
        };
        // 保存する数字が長くならないよう小数2桁に丸める
        window.shownToLine = (n, fontSize) =>
            Math.round((n - window.SPACING_OFFSET) * window.lineStepPx(fontSize) * 100) / 100;
        // 箱の文字の大きさ
        window.fontSizeOf = (el) => parseFloat(el && el.style.fontSize) || 20;
        function currentLetterSpacing() {
            const v = parseFloat(textSpacingInput.value);
            return isNaN(v) ? 0 : window.shownToSpacing(v);
        }
        window.currentLetterSpacing = currentLetterSpacing;
        function applySpacingToSelection(px) {
            let saved = false;
            selectedElements.forEach(el => {
                if (el.classList.contains('text-wrapper')) { applyLetterSpacingKeepBottomLeft(el, px); saved = true; }
            });
            if (saved) window.saveState();
        }
        function changeGlobalLetterSpacing(delta) {
            let next = Math.round((currentLetterSpacing() + delta) * 2) / 2;   // 0.5px 刻み
            if (next < -window.SPACING_OFFSET) next = -window.SPACING_OFFSET;
            if (next > 30) next = 30;
            textSpacingInput.value = window.spacingToShown(next);
            applySpacingToSelection(next);
        }
        window.changeGlobalLetterSpacing = changeGlobalLetterSpacing;
        document.getElementById('btn-text-spacing-up').addEventListener('click', () => changeGlobalLetterSpacing(0.5));
        document.getElementById('btn-text-spacing-down').addEventListener('click', () => changeGlobalLetterSpacing(-0.5));
        textSpacingInput.addEventListener('input', () => applySpacingToSelection(currentLetterSpacing()));

        // --- 行と行のすき間（縦書きでは列と列） ---
        // 0 のときは指定なし（ブラウザ任せの normal）。0 以外は「normal から何px ずらすか」。
        // em で書くので、文字サイズを変えてもそのぶん一緒に伸び縮みする。
        let __normalLhRatio = null;
        function normalLineHeightRatio() {
            if (__normalLhRatio == null) __normalLhRatio = measuredLineHeightPx(100) / 100;
            return __normalLhRatio;
        }
        // すき間 0（欄の「5」）でも計算式を入れる（09-08 Rayan様）。ブラウザ任せの normal と
        // 「1行の高さ × 文字サイズ」は数字がぴったり同じにならず、0 の所だけ行の間隔が
        // 跳ねていた（5 より 5.5 の方が狭い、など）。0 も同じ式で書けば端から端まで滑らかになる。
        // 保存する値は今までどおりで、0 の時は書かない。
        function setLineSpacing(el, px) {
            const tc = el.querySelector('.text-content');
            const v = `calc(${normalLineHeightRatio().toFixed(4)}em + ${px || 0}px)`;
            el.style.lineHeight = v;
            if (tc) tc.style.lineHeight = v;
            if (px) el.dataset.lineSpacing = px; else delete el.dataset.lineSpacing;
        }
        window.setLineSpacing = setLineSpacing;
        // 欄に出す数字は字間と同じ下駄をはく（素の状態＝欄の「5」＝すき間 0px）
        // 新しく置く箱に渡す行間（px）。欄の数字を、そのとき使う文字の大きさで px に直す。
        function currentLineSpacing() {
            const v = parseFloat(lineSpacingInput.value);
            if (isNaN(v)) return 0;
            return window.shownToLine(v, parseFloat(textSizeInput.value) || 20);
        }
        window.currentLineSpacing = currentLineSpacing;
        // 行のすき間は「箱の上端」を保つ（＝動かさない）。
        // 行の高さを増やすと1行目の上にも余白が付くので、文字の上端で揃えると
        // 箱そのものが上へずれ、上に浮かべている道具の帯も動いてしまう（09-08 Rayan様）。
        function applyLineSpacingKeepBottomLeft(el, px) {
            setLineSpacing(el, px);
        }
        // 受け取るのは欄の数字。箱ごとに、その箱の文字の大きさで px に直して当てる。
        function applyLineSpacingToSelection(shown) {
            let saved = false;
            selectedElements.forEach(el => {
                if (el.classList.contains('text-wrapper')) {
                    applyLineSpacingKeepBottomLeft(el, window.shownToLine(shown, window.fontSizeOf(el)));
                    saved = true;
                }
            });
            if (saved) window.saveState();
        }
        // 行間は欄の 1 ずつ動かす（＝実際は LINE_STEP_PX ずつ・09-08 Rayan様）
        function changeGlobalLineSpacing(deltaShown) {
            let shown = Math.round((parseFloat(lineSpacingInput.value) || 0) + deltaShown);
            if (shown < 0) shown = 0;
            if (shown > window.LINE_SHOWN_MAX) shown = window.LINE_SHOWN_MAX;
            lineSpacingInput.value = shown;
            applyLineSpacingToSelection(shown);
        }
        window.changeGlobalLineSpacing = changeGlobalLineSpacing;
        document.getElementById('btn-line-spacing-up').addEventListener('click', () => changeGlobalLineSpacing(1));
        document.getElementById('btn-line-spacing-down').addEventListener('click', () => changeGlobalLineSpacing(-1));
        lineSpacingInput.addEventListener('input', () => {
            // 打ち込みでも範囲から出さない（矢印と同じ 0〜LINE_SHOWN_MAX）
            const v = parseFloat(lineSpacingInput.value);
            if (!isNaN(v)) {
                if (v < 0) lineSpacingInput.value = 0;
                else if (v > window.LINE_SHOWN_MAX) lineSpacingInput.value = window.LINE_SHOWN_MAX;
            }
            applyLineSpacingToSelection(parseFloat(lineSpacingInput.value) || 0);
        });

        document.getElementById('btn-undo').addEventListener('click', () => { 
            if (window.historyIndex > 0) { window.historyIndex--; restoreState(window.historyIndex); }
        });
        document.getElementById('btn-redo').addEventListener('click', () => { if (window.historyIndex < window.historyArray.length - 1) { window.historyIndex++; restoreState(window.historyIndex); } });
        
        document.getElementById('btn-duplicate').addEventListener('click', () => duplicateSelection());

        document.getElementById('btn-delete').addEventListener('click', () => {
            if (selectedStroke) { deleteSelectedStroke(); return; }
            let changed = false;
            if (selectedElements.length > 0) { selectedElements.forEach(el => el.remove()); changed = true; }
            if (selectedStrokes.length) { deleteMultiStrokes(); changed = true; }
            if (changed) { window.deselectCurrent(); window.saveState(); }
        });
        
        document.getElementById('btn-clear-all').addEventListener('click', () => { 
            if (confirm('すべて削除しますか？（手書きも消えます）')) { 
                workspace.querySelectorAll('.canvas-element').forEach(e => e.remove());
                workspace.querySelectorAll('.drawing-svg').forEach((svg, i) => {
                    window.canvasDrawings[i] = [];
                    renderStrokesToSVG(svg, []);
                });
                window.deselectCurrent(); window.saveState();
            } 
        });

        penOpacityInput.addEventListener('input', (e) => {
            const a = e.target.value;
            let saved = false;
            selectedElements.forEach(selectedElement => {
                if (selectedElement.classList.contains('highlight-freehand-wrapper')) {
                    const p = selectedElement.querySelector('.fh-stroke');
                    // 現在の色は保ったまま濃さ(alpha)だけ変える（従来はツール色で塗り替わる不具合があった）
                    if (p) { p.style.stroke = setAlpha(p.style.stroke || getComputedStyle(p).stroke, a); updateFreehandUI(selectedElement); saved = true; }
                } else if (selectedElement.classList.contains('highlight-box')) {
                    selectedElement.style.backgroundColor = setAlpha(selectedElement.style.backgroundColor || getComputedStyle(selectedElement).backgroundColor, a);
                    saved = true;
                }
            });
            if (saved) window.saveState();
        });

        // 欄を押すと、よく使う大きさの一覧を下に出す（09-08 Rayan様）。中身は帯と同じものを使う。
        const openSizeList = () => {
            if (!window.openTextNumList) return;
            window.openTextNumList(textSizeInput, (v) => {
                textSizeInput.value = v;
                textSizeInput.dispatchEvent(new Event('input', { bubbles: true }));
            });
        };
        textSizeInput.addEventListener('focus', openSizeList);
        textSizeInput.addEventListener('click', () => {
            if (document.activeElement === textSizeInput) openSizeList();
        });
        textSizeInput.addEventListener('blur', () => {
            if (window.isTextNumListFor && window.isTextNumListFor(textSizeInput)) window.closeTextNumList();
        });

        textSizeInput.addEventListener('input', (e) => {
            const newSize = parseInt(e.target.value); 
            let saved = false;
            selectedElements.forEach(selectedElement => {
                if (newSize && selectedElement.classList.contains('text-wrapper')) {
                    applyFontSizeKeepBottomLeft(selectedElement, newSize);
                    saved = true;
                }
            });
            if (saved) window.saveState();
        });

