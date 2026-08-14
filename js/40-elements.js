// ===== 40-elements.js : 手描きの座標操作・黒塗り/蛍光/テキスト要素の生成と編集 =====
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

        window.createTextElement = function(left, top, width, height, content = '', fontSize = '20px', color = '#ef4444', textAlign = 'left', writingMode = 'horizontal-tb') {
            const wrapper = document.createElement('div'); wrapper.className = 'canvas-element text-wrapper';
            wrapper.style.left = left; wrapper.style.top = top;
            if (width) wrapper.style.width = width; if (height) wrapper.style.height = height;
            wrapper.style.fontSize = fontSize; wrapper.style.color = color; 
            wrapper.style.textAlign = textAlign;
            wrapper.style.writingMode = writingMode;
            
            const textContent = document.createElement('div'); textContent.className = 'text-content'; textContent.contentEditable = "true"; textContent.innerHTML = sanitizeTextHTML(content);
            textContent.style.textAlign = textAlign;
            textContent.style.writingMode = writingMode;
            
            wrapper.appendChild(textContent); addResizeHandles(wrapper); 
            window.bringToFront(wrapper);
            workspace.appendChild(wrapper);
            // 編集終了時の処理（保存・空箱削除・ツール復帰）は workspace への委譲リスナーで
            // 一括処理する。cloneNode で作った複製・貼り付けの箱にも確実に効かせるため。
            return wrapper;
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
        // 箱の「文字の左下」が指定の ws 座標に来るよう平行移動する
        function moveTextBottomLeftTo(el, x, y) {
            const cur = measureTextBottomLeftWs(el);
            el.style.left = (parseFloat(el.style.left || 0) + (x - cur.x)) + 'px';
            el.style.top = (parseFloat(el.style.top || 0) + (y - cur.y)) + 'px';
        }
        // 文字サイズを変えても「文字の左下」が動かないようにする。
        // 変更前の文字左下を測り、変更後にその位置へ戻す（現在位置基準なので移動後も正しい）。
        function applyFontSizeKeepBottomLeft(el, size) {
            const before = measureTextBottomLeftWs(el);
            el.style.fontSize = size + 'px';
            moveTextBottomLeftTo(el, before.x, before.y);
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

