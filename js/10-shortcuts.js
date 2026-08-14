// ===== 10-shortcuts.js : 一時パン・シフトでの文字選択・キーボードショートカット・ツールバー =====
// app.js を分割したもの。素のスクリプトなので変数は全ファイルで共有される。
// index.html の読み込み順を変えると壊れる。

        // --- スペース押しでの一時パン（全ツール共通） ---
        let spaceHeld = false;
        function setSpaceHeld(on) {
            if (spaceHeld === on) return;
            spaceHeld = on;
            workspaceContainer.classList.toggle('pan-ready', on);
            if (on) { brushCursor.style.display = 'none'; textCursor.style.display = 'none'; }
        }
        document.addEventListener('keydown', function(e) {
            if (e.code !== 'Space' || e.repeat) return;
            const t = e.target;
            const tag = (t && t.tagName || '').toLowerCase();
            // 入力欄やボタン等にフォーカスがある間は、スペース本来の動作を邪魔しない
            if (tag === 'input' || tag === 'textarea' || tag === 'button' || tag === 'select' || t.isContentEditable) return;
            e.preventDefault(); // スペースでのページスクロールを抑止
            setSpaceHeld(true);
        });
        document.addEventListener('keyup', function(e) {
            if (e.code === 'Space') setSpaceHeld(false);
        });
        // フォーカスが外れたらキーアップを取り逃すので解除しておく
        window.addEventListener('blur', () => setSpaceHeld(false));

        // --- シフト押しで背景（PDF）の文字選択を一時的に有効化（マウスツール時）。
        //     複数選択の修飾キーは Ctrl（⌘）（08-02 Rayan様の指示で元に戻した）。 ---
        let shiftHeld = false;
        // 背景PDFの文字を選んだ状態が生きているか。Shift を離した瞬間に
        // user-select:none へ戻すとブラウザが選択を捨てるので、選択がある間は保つ。
        let pdfTextSelected = false;
        function setShiftHeld(on) {
            if (shiftHeld === on) return;
            shiftHeld = on;
            workspaceContainer.classList.toggle('text-select-on', on);
        }
        function updatePdfTextSelected() {
            const sel = window.getSelection();
            let live = false;
            if (sel && !sel.isCollapsed && sel.rangeCount) {
                const node = sel.anchorNode;
                const el = node && (node.nodeType === 1 ? node : node.parentElement);
                live = !!(el && el.closest && el.closest('.textLayer'));
            }
            if (live === pdfTextSelected) return;
            pdfTextSelected = live;
            workspaceContainer.classList.toggle('pdf-text-selected', live);
        }
        document.addEventListener('selectionchange', updatePdfTextSelected);
        document.addEventListener('keydown', (e) => { if (e.key === 'Shift') setShiftHeld(true); });
        document.addEventListener('keyup', (e) => { if (e.key === 'Shift') setShiftHeld(false); });
        window.addEventListener('blur', () => setShiftHeld(false));

        // 説明（黒い吹き出し）の消し忘れ対策。押した拍子に画面が動くと、カーソルが離れても
        // :hover が外れず吹き出しが残ることがある。押した時点で消し、実際に離れた時に戻す。
        document.addEventListener('pointerdown', (e) => {
            const t = e.target.closest && e.target.closest('[title]');
            if (t) t.classList.add('no-tip');
        }, true);
        document.addEventListener('pointerout', (e) => {
            const t = e.target.closest && e.target.closest('.no-tip');
            if (!t) return;
            if (e.relatedTarget && t.contains(e.relatedTarget)) return; // 中の要素へ移っただけ
            t.classList.remove('no-tip');
        }, true);
        window.addEventListener('blur', () => {
            document.querySelectorAll('.no-tip').forEach(el => el.classList.remove('no-tip'));
        });

        // ワークスペースを触ったら、ツールバーの入力欄からフォーカスを外す
        // （入力欄にフォーカスが残っていると Delete や Ctrl+C が効かないため）
        workspaceContainer.addEventListener('pointerdown', () => {
            const a = document.activeElement;
            if (a && ['input', 'select', 'button'].includes(a.tagName.toLowerCase())) a.blur();
        }, true);

        // 中ボタンのオートスクロール（丸いスクロールアイコン）を抑止
        workspaceContainer.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
        workspaceContainer.addEventListener('auxclick', (e) => { if (e.button === 1) e.preventDefault(); });

        // --- ツール切替・Esc・複製・微調整・保存のショートカット ---
        function selectToolByName(name) {
            const radio = document.getElementById('tool-' + name);
            if (radio) { radio.checked = true; radio.dispatchEvent(new Event('change')); }
        }
        const TOOL_HOTKEYS = { '1':'select','2':'mask','3':'highlight','4':'text','5':'shape','6':'pen',
                               'v':'select','m':'mask','h':'highlight','t':'text','g':'shape','p':'pen' };

        function duplicateSelection() {
            if (selectedStroke) { duplicateSelectedStroke(); return; }
            if (!selectedElements.length) return;
            // 貼り付けと同じく、複製もカーソル位置に置く（選択範囲の左上をカーソルに合わせる）
            let dx = 12, dy = 12;
            if (lastMouseWs) {
                const minX = Math.min(...selectedElements.map(el => parseFloat(el.style.left || 0)));
                const minY = Math.min(...selectedElements.map(el => parseFloat(el.style.top || 0)));
                dx = lastMouseWs.x - minX;
                dy = lastMouseWs.y - minY;
            }
            const clones = [];
            selectedElements.forEach(el => {
                const clone = el.cloneNode(true);
                clone.classList.remove('selected');
                clone.style.left = (parseFloat(el.style.left || 0) + dx) + 'px';
                clone.style.top = (parseFloat(el.style.top || 0) + dy) + 'px';
                workspace.appendChild(clone);
                window.bringToFront(clone);
                clones.push(clone);
            });
            alignPastedToCursor(clones);
            window.deselectCurrent();
            selectedElements = clones;
            clones.forEach(c => c.classList.add('selected'));
            window.saveState();
        }

        // 内部クリップボード（Ctrl+C / Ctrl+V）
        let internalClipboard = [];
        let pasteCount = 0;
        let clipboardStroke = null; // コピーしたペン線 { svg, cmd }
        // カーソルの現在位置（ワークスペース座標）。ペースト先に使う。
        let lastMouseWs = null;
        workspaceContainer.addEventListener('pointermove', (e) => {
            const rect = workspace.getBoundingClientRect();
            lastMouseWs = {
                x: (e.clientX - rect.left) / zoomLevel,
                y: (e.clientY - rect.top) / zoomLevel
            };
        });
        function copySelection() {
            // ペン線が選ばれている場合はその線をコピー
            if (selectedStroke) {
                const cmd = currentStrokeCmd();
                if (!cmd) return;
                clipboardStroke = { svg: selectedStroke.svg, cmd: JSON.parse(JSON.stringify(cmd)) };
                internalClipboard = [];
                pasteCount = 0;
                return;
            }
            if (!selectedElements.length) return;
            internalClipboard = selectedElements.map(el => el.cloneNode(true));
            internalClipboard.forEach(c => c.classList.remove('selected'));
            clipboardStroke = null;
            pasteCount = 0;
        }
        function hasClipboard() {
            return internalClipboard.length > 0 || !!clipboardStroke;
        }
        function cutSelection() {
            if (!selectedStroke && !selectedElements.length) return;
            copySelection();
            if (selectedStroke) { deleteSelectedStroke(); return; }
            selectedElements.forEach(el => el.remove());
            window.deselectCurrent();
            window.saveState();
        }
        function pasteStroke() {
            const svg = (clipboardStroke.svg && clipboardStroke.svg.isConnected)
                ? clipboardStroke.svg
                : workspace.querySelector('.drawing-svg');
            if (!svg) return;
            const idx = parseInt(svg.dataset.canvasIndex);
            if (!window.canvasDrawings[idx]) window.canvasDrawings[idx] = [];
            const copy = JSON.parse(JSON.stringify(clipboardStroke.cmd));
            let dx, dy;
            if (lastMouseWs && copy.points.length) {
                // 線の左上をカーソル位置に合わせる
                const minX = Math.min(...copy.points.map(p => p.x));
                const minY = Math.min(...copy.points.map(p => p.y));
                dx = lastMouseWs.x - minX;
                dy = lastMouseWs.y - minY;
            } else {
                pasteCount++;
                dx = dy = 12 * pasteCount;
            }
            copy.points = copy.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            window.canvasDrawings[idx].push(copy);
            window.deselectCurrent();
            selectedStroke = { svg, index: window.canvasDrawings[idx].length - 1 };
            renderStrokesToSVG(svg, window.canvasDrawings[idx]);
            showStrokeHighlight();
            updateToolbar();
            window.saveState();
        }
        function pasteClipboard() {
            if (clipboardStroke) { pasteStroke(); return; }
            if (!internalClipboard.length) return;
            let dx, dy;
            if (lastMouseWs) {
                // 選択範囲の左上をカーソル位置に合わせ、相対配置を保つ
                const minX = Math.min(...internalClipboard.map(t => parseFloat(t.style.left || 0)));
                const minY = Math.min(...internalClipboard.map(t => parseFloat(t.style.top || 0)));
                dx = lastMouseWs.x - minX;
                dy = lastMouseWs.y - minY;
            } else {
                pasteCount++;
                dx = dy = 12 * pasteCount;
            }
            const clones = [];
            internalClipboard.forEach(tpl => {
                const clone = tpl.cloneNode(true);
                clone.classList.remove('selected');
                clone.style.left = (parseFloat(tpl.style.left || 0) + dx) + 'px';
                clone.style.top = (parseFloat(tpl.style.top || 0) + dy) + 'px';
                workspace.appendChild(clone);
                window.bringToFront(clone);
                clones.push(clone);
            });
            alignPastedToCursor(clones);
            window.deselectCurrent();
            selectedElements = clones;
            clones.forEach(c => c.classList.add('selected'));
            updateToolbar();
            window.saveState();
        }
        // テキスト箱を1つだけ置いた時は、テキストツールでの新規作成と同じく
        // 「文字の左下（キャレット）」をカーソルに合わせる。DOM に入れてからでないと測れない。
        function alignPastedToCursor(els) {
            if (!lastMouseWs || els.length !== 1) return;
            if (!els[0].classList.contains('text-wrapper')) return;
            moveTextBottomLeftTo(els[0], lastMouseWs.x, lastMouseWs.y);
        }

        // アプリ内でコピーした印。OS クリップボードにこの型を書き込んでおき、
        // 貼り付け時に「直前のコピーはアプリ内だった」と判別する。
        // text/plain は空にする（文字入力中に貼っても何も入らないようにするため）。
        const CLIP_TYPE = 'text/x-ankimasking';
        function markClipboard(dt) {
            try { dt.setData(CLIP_TYPE, '1'); } catch (_) {}
            dt.setData('text/plain', '');
        }
        function isOwnClipboard(dt) {
            const types = Array.from(dt.types || []);
            if (types.includes(CLIP_TYPE)) return true;
            // 独自の型が残らないブラウザ向けの保険：
            // 画像が無く、text/plain も空なら、直前のコピーはこのアプリのものとみなす
            return !types.includes('Files') && !dt.getData('text/plain');
        }
        function isTypingTarget(t) {
            if (!t || !t.tagName) return false;
            const n = t.tagName.toLowerCase();
            return n === 'input' || n === 'textarea' || t.isContentEditable ||
                   (t.classList && t.classList.contains('text-content'));
        }
        document.addEventListener('copy', (e) => {
            if (isTypingTarget(e.target)) return;
            if (!selectedElements.length && !selectedStroke) return;
            copySelection();
            markClipboard(e.clipboardData);
            e.preventDefault();
        });
        document.addEventListener('cut', (e) => {
            if (isTypingTarget(e.target)) return;
            if (!selectedElements.length && !selectedStroke) return;
            cutSelection();
            markClipboard(e.clipboardData);
            e.preventDefault();
        });

        let nudgeSaveTimer = null;
        function nudgeSelection(dx, dy) {
            if (!selectedElements.length) return;
            selectedElements.forEach(el => {
                el.style.left = (parseFloat(el.style.left || 0) + dx) + 'px';
                el.style.top = (parseFloat(el.style.top || 0) + dy) + 'px';
            });
            clearTimeout(nudgeSaveTimer);
            nudgeSaveTimer = setTimeout(() => window.saveState(), 400);
        }

        document.addEventListener('keydown', function(e) {
            const isTyping = e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea' || e.target.isContentEditable || e.target.classList.contains('text-content');
            const cmdOrCtrl = e.metaKey || e.ctrlKey;

            // Ctrl+S = .amk保存（ブラウザのページ保存を抑止）
            if (cmdOrCtrl && e.key.toLowerCase() === 's') {
                e.preventDefault();
                document.getElementById('btn-save-project-menu').click();
                return;
            }
            // 文字入力中の Esc は「編集を終えて箱を選んだ状態」に戻す（一般的なテキストボックスと同じ）
            // ただし IME 変換中（未確定）の Esc は変換の取り消しに使うので、箱は閉じない（e.isComposing / keyCode 229）
            if (e.key === 'Escape' && !e.isComposing && e.keyCode !== 229 && e.target.classList && e.target.classList.contains('text-content')) {
                e.preventDefault();
                const wrapper = e.target.closest('.text-wrapper');
                e.target.blur(); // 空なら blur 側で箱ごと消える
                if (wrapper && wrapper.isConnected) {
                    window.deselectCurrent();
                    selectedElements = [wrapper];
                    wrapper.classList.add('selected');
                    updateToolbar();
                }
                return;
            }

            if (isTyping) return;

            if (cmdOrCtrl && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); return; }
            // Ctrl+C / Ctrl+X / Ctrl+V はいずれも preventDefault せず、既定の copy/cut/paste
            // イベントに委ねる。ここで潰すと OS クリップボードが書き換わらず、前にコピーした
            // 画像が残り続けて貼り付け時にそちらが優先されてしまう。
            if (cmdOrCtrl && (e.key.toLowerCase() === 'c' || e.key.toLowerCase() === 'x')) return;
            if (cmdOrCtrl) return; // 他のCtrl系(Z/Y)は既存ハンドラに委譲

            if (e.key === 'Escape') {
                // 何か選択中なら、まず選択を解除するだけ。
                // 選択が無い状態でもう一度押すとマウスツールへ戻る。
                const hadSelection = selectedElements.length > 0 || !!selectedStroke;
                window.deselectCurrent();
                drawingBox.style.display = 'none'; drawingBox.style.backgroundColor = ''; selectionBox.style.display = 'none';
                if (liveStrokePath && liveStrokePath.parentNode) liveStrokePath.parentNode.removeChild(liveStrokePath);
                action = null; liveStrokePath = null; freehandScale = null; strokeScale = null;
                if (!hadSelection) window.returnToSelectTool();
                return;
            }

            if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) && (selectedElements.length || selectedStroke)) {
                e.preventDefault();
                const step = e.shiftKey ? 10 : 1;
                let dx = 0, dy = 0;
                if (e.key === 'ArrowUp') dy = -step; else if (e.key === 'ArrowDown') dy = step;
                else if (e.key === 'ArrowLeft') dx = -step; else dx = step;
                if (selectedStroke) nudgeSelectedStroke(dx, dy); else nudgeSelection(dx, dy);
                return;
            }

            const t = TOOL_HOTKEYS[e.key.toLowerCase()];
            if (t) selectToolByName(t);
        });

        // 自分の外枠を掴んで編集を抜けた時だけ、空でも箱を残す（移動できるように）
        let preserveEmptyWrapper = null;
        // テキスト編集の確定を委譲で一括処理（複製・貼り付けで作った箱にも効く）
        workspace.addEventListener('focusout', (e) => {
            const tc = e.target.closest && e.target.closest('.text-content');
            if (!tc) return;
            const wrapper = tc.closest('.text-wrapper');
            if (tc.innerText.trim() === '') {
                // 外枠を掴んだ時は消さない。それ以外（空きクリック等）の空箱は消す。
                if (wrapper && wrapper !== preserveEmptyWrapper) wrapper.remove();
            }
            else window.saveState();
            // 編集を抜けた後の後始末は、選択の付け替えが済んでから見る。
            setTimeout(() => {
                const a = document.activeElement;
                if (a && a.classList && a.classList.contains('text-content')) return; // 別の箱の編集へ移った
                // 別の要素を選び直していたら、それは残す（クリックした箱への選択移動）。
                // 何も選んでいない時だけ、ツールに関わらず後始末する。
                if (selectedElements.length === 0 && !selectedStroke) { window.deselectCurrent(); updateToolbar(); }
            }, 0);
        });

        // 押した場所にいちばん近い位置へ文字カーソルを置く。取れなければ末尾。
        function placeCaretFromPoint(tc, clientX, clientY) {
            const sel = window.getSelection();
            let range = null;
            if (document.caretRangeFromPoint) {
                range = document.caretRangeFromPoint(clientX, clientY);
            } else if (document.caretPositionFromPoint) {
                const pos = document.caretPositionFromPoint(clientX, clientY);
                if (pos) { range = document.createRange(); range.setStart(pos.offsetNode, pos.offset); }
            }
            if (!range || !tc.contains(range.startContainer)) {
                range = document.createRange();
                range.selectNodeContents(tc);
                range.collapse(false); // 末尾
            } else {
                range.collapse(true);
            }
            sel.removeAllRanges(); sel.addRange(range);
            tc.focus();
        }

        // ダブルクリックでテキスト編集に入る
        workspace.addEventListener('dblclick', (e) => {
            if (document.body.classList.contains('focus-mode')) return;
            if (currentTool !== 'select' && currentTool !== 'text') return; // 選択・テキストツールで編集に入れる
            const wrapper = e.target.closest('.text-wrapper');
            if (wrapper) {
                const tc = wrapper.querySelector('.text-content');
                if (tc) {
                    window.deselectCurrent();
                    selectedElements = [wrapper]; wrapper.classList.add('selected');
                    // 押した場所にカーソルを置く（従来は必ず先頭に飛んでいた）
                    placeCaretFromPoint(tc, e.clientX, e.clientY);
                }
            }
        });

        // マスキングは黒塗り専用なので色の対象外
        function colorEditableElements() {
            return selectedElements.filter(el =>
                !el.classList.contains('mask-rect') && !el.classList.contains('mask-freehand-wrapper'));
        }
        function selectionHasColor() {
            return !!selectedStroke || colorEditableElements().length > 0;
        }

        // 色は「今のツール」ではなく「選択中の要素の種類」に対して適用する
        function applyColorToSelection(color) {
            let saved = false;
            // ペン線が選択されていれば、その線の色を変更
            if (selectedStroke) {
                const cmd = currentStrokeCmd();
                if (cmd) { cmd.color = color; reRenderStrokeSvg(); window.saveState(); }
                return;
            }
            selectedElements.forEach(selectedElement => {
                if (selectedElement.classList.contains('text-wrapper')) {
                    if (savedSelectionRange && selectedElement.contains(savedSelectionRange.commonAncestorContainer)) {
                        const textContent = selectedElement.querySelector('.text-content');
                        if (textContent) textContent.focus();
                        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedSelectionRange); document.execCommand('foreColor', false, color);
                    } else {
                        selectedElement.style.color = color;
                        const tc = selectedElement.querySelector('.text-content'); if (tc) tc.style.color = color;
                    }
                    saved = true;
                } else if (selectedElement.classList.contains('highlight-freehand-wrapper')) {
                    const p = selectedElement.querySelector('.fh-stroke');
                    if (p) { p.style.stroke = hexToRgba(color, penOpacityInput.value); updateFreehandUI(selectedElement); saved = true; }
                } else if (selectedElement.classList.contains('highlight-box')) {
                    selectedElement.style.backgroundColor = hexToRgba(color, penOpacityInput.value);
                    saved = true;
                } else if (selectedElement.classList.contains('shape-element')) {
                    const shapeNode = selectedElement.querySelector('svg > *');
                    if (shapeNode) { shapeNode.setAttribute('stroke', color); saved = true; }
                }
                // マスキング（黒塗り）は色を変えない
            });
            if (saved) window.saveState();
        }

        // 太さも「今のツール」ではなく「選択中のもの」に適用する
        // 太さを変えられる選択物か（ペン線・手書きマスク・手書きハイライト・図形）
        function widthEditableElements() {
            return selectedElements.filter(el =>
                el.classList.contains('mask-freehand-wrapper') ||
                el.classList.contains('highlight-freehand-wrapper') ||
                el.classList.contains('shape-element'));
        }
        function selectionHasWidth() {
            return !!selectedStroke || widthEditableElements().length > 0;
        }
        // 選択中のものの今の太さ（複数あれば最初のもの）
        function selectionWidthValue() {
            if (selectedStroke) {
                const cmd = currentStrokeCmd();
                return cmd ? parseFloat(cmd.width) : null;
            }
            const el = widthEditableElements()[0];
            if (!el) return null;
            const node = el.classList.contains('shape-element') ? el.querySelector('svg > *') : el.querySelector('.fh-stroke');
            return node ? parseFloat(node.getAttribute('stroke-width')) : null;
        }
        let widthSaveTimer = null;
        function applyWidthToSelection(width) {
            const w = parseFloat(width);
            if (!isFinite(w)) return;
            let changed = false;
            if (selectedStroke) {
                const cmd = currentStrokeCmd();
                if (cmd) { cmd.width = w; reRenderStrokeSvg(); changed = true; }
            } else {
                widthEditableElements().forEach(el => {
                    if (el.classList.contains('shape-element')) {
                        const node = el.querySelector('svg > *');
                        if (node) { node.setAttribute('stroke-width', w); changed = true; }
                        const hit = el.querySelector('.shape-hit');
                        if (hit) hit.setAttribute('stroke-width', shapeHitWidth(w));
                    } else {
                        const p = el.querySelector('.fh-stroke');
                        if (p) { p.setAttribute('stroke-width', w); updateFreehandUI(el); changed = true; }
                    }
                });
            }
            if (!changed) return;
            clearTimeout(widthSaveTimer);
            widthSaveTimer = setTimeout(() => window.saveState(), 400);
        }

        // テキストの書式は「今のツール」ではなく「選択中のテキスト」に対して適用する
        function textEditableElements() {
            return selectedElements.filter(el => el.classList.contains('text-wrapper'));
        }
        function selectionHasText() {
            return textEditableElements().length > 0;
        }

        function applyTextCommand(command) {
            let saved = false;
            selectedElements.forEach(selectedElement => {
                if (selectedElement.classList.contains('text-wrapper')) {
                    if (savedSelectionRange && selectedElement.contains(savedSelectionRange.commonAncestorContainer)) {
                        // ★修正2: 太字や下線も確実に保存させる
                        const textContent = selectedElement.querySelector('.text-content');
                        if (textContent) textContent.focus(); 

                        const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedSelectionRange);
                    }
                    document.execCommand(command, false, null); 
                    saved = true;
                }
            });
            if (saved) window.saveState();
        }

        function updatePaletteUI() {
            if (!['text', 'highlight', 'pen', 'shape'].includes(currentTool)) return;
            const currentColor = toolColors[currentTool];
            let matchedNormal = false;
            document.querySelectorAll('.swatch:not(.custom-swatch)').forEach(swatch => {
                if (swatch.dataset.color === currentColor) { swatch.classList.add('active'); matchedNormal = true; } 
                else { swatch.classList.remove('active'); }
            });
            if (!matchedNormal) { customSwatch.classList.add('active'); customSwatch.style.background = currentColor; } 
            else { customSwatch.classList.remove('active'); customSwatch.style.background = ''; }
        }

        // 色パレットは、対応ツール使用中か、要素が選択されている時に機能する
        function colorPaletteActive() {
            return ['text', 'highlight', 'pen', 'shape'].includes(currentTool) || selectionHasColor();
        }
        document.querySelectorAll('.swatch:not(.custom-swatch)').forEach(swatch => {
            swatch.addEventListener('pointerdown', (e) => {
                e.preventDefault(); if (!colorPaletteActive()) return;
                const newColor = e.target.dataset.color;
                if (['text', 'highlight', 'pen', 'shape'].includes(currentTool)) toolColors[currentTool] = newColor;
                updatePaletteUI(); applyColorToSelection(newColor);
            });
        });

        customSwatch.addEventListener('click', () => {
            if (!colorPaletteActive()) return;
            nativeColorPicker.value = toolColors[currentTool] || '#ef4444'; nativeColorPicker.click();
        });

        nativeColorPicker.addEventListener('input', (e) => {
            const newColor = e.target.value;
            if (['text', 'highlight', 'pen', 'shape'].includes(currentTool)) toolColors[currentTool] = newColor;
            updatePaletteUI(); applyColorToSelection(newColor);
        });

        document.getElementById('btn-text-bold').addEventListener('pointerdown', (e) => { e.preventDefault(); applyTextCommand('bold'); });
        document.getElementById('btn-text-underline').addEventListener('pointerdown', (e) => { e.preventDefault(); applyTextCommand('underline'); });
        document.getElementById('btn-text-strike').addEventListener('pointerdown', (e) => { e.preventDefault(); applyTextCommand('strikeThrough'); });

        function setTextAlign(align) {
            let saved = false;
            selectedElements.forEach(selectedElement => {
                if (selectedElement.classList.contains('text-wrapper')) {
                    selectedElement.style.textAlign = align;
                    selectedElement.querySelector('.text-content').style.textAlign = align;
                    saved = true;
                }
            });
            if(saved) window.saveState();
        }
        document.getElementById('btn-align-left').addEventListener('pointerdown', (e) => { e.preventDefault(); setTextAlign('left'); });
        document.getElementById('btn-align-center').addEventListener('pointerdown', (e) => { e.preventDefault(); setTextAlign('center'); });
        document.getElementById('btn-align-right').addEventListener('pointerdown', (e) => { e.preventDefault(); setTextAlign('right'); });

        function setTextDirection(dir) {
            currentTextDirection = dir;
            let saved = false;
            selectedElements.forEach(selectedElement => {
                if (selectedElement.classList.contains('text-wrapper')) {
                    selectedElement.style.writingMode = dir;
                    selectedElement.querySelector('.text-content').style.writingMode = dir;
                    saved = true;
                }
            });
            if (saved) window.saveState();
        }
        document.getElementById('btn-dir-horiz').addEventListener('pointerdown', (e) => { e.preventDefault(); setTextDirection('horizontal-tb'); });
        document.getElementById('btn-dir-vert-rl').addEventListener('pointerdown', (e) => { e.preventDefault(); setTextDirection('vertical-rl'); });

        function updateToolbar() {
            const maskType = document.querySelector('input[name="maskType"]:checked') ? document.querySelector('input[name="maskType"]:checked').value : 'rect';
            
            const highlightType = currentHighlightType();

            document.getElementById('prop-mask-type').style.display = (currentTool === 'mask') ? 'flex' : 'none';
            document.getElementById('prop-mask-reveal').style.display = (currentTool === 'mask') ? 'flex' : 'none';
            document.getElementById('prop-highlight-type').style.display = (currentTool === 'highlight') ? 'flex' : 'none';
            document.getElementById('prop-shape-type').style.display = (currentTool === 'shape') ? 'flex' : 'none';
            const penModeNow = document.querySelector('input[name="penMode"]:checked') ? document.querySelector('input[name="penMode"]:checked').value : 'pen';
            const isErasing = (currentTool === 'pen' && penModeNow === 'eraser');
            const hasSel = selectedElements.length > 0 || !!selectedStroke || selectedStrokes.length > 0;
            document.getElementById('prop-color').style.display = ((['text', 'highlight', 'pen', 'shape'].includes(currentTool) && !isErasing) || selectionHasColor()) ? 'flex' : 'none';
            // テキストの書式は、テキストツール中か、テキストを選んでいる時に出す
            const showTextProps = (currentTool === 'text') || selectionHasText();
            document.getElementById('prop-text-style').style.display = showTextProps ? 'flex' : 'none';
            document.getElementById('prop-text-align').style.display = showTextProps ? 'flex' : 'none';
            document.getElementById('prop-text-direction').style.display = showTextProps ? 'flex' : 'none';
            document.getElementById('prop-text-size').style.display = showTextProps ? 'flex' : 'none';
            // 選択中のテキストの文字サイズを入力欄に映す
            const selText = textEditableElements()[0];
            if (selText) {
                const sz = parseInt(selText.style.fontSize);
                if (sz) textSizeInput.value = sz;
            }

            document.getElementById('prop-pen-mode').style.display = (currentTool === 'pen') ? 'flex' : 'none';
            
            const hasWidthSel = selectionHasWidth();
            document.getElementById('prop-pen-width').style.display = (['pen', 'shape'].includes(currentTool) || (currentTool === 'mask' && maskType === 'free') || (currentTool === 'highlight' && highlightType === 'free') || hasWidthSel) ? 'flex' : 'none';
            
            // 濃さスライダーは、ハイライト/ペンツール中に加えて、ハイライト要素を選択中も出す
            const opacitySelectable = selectedElements.some(el => el.classList.contains('highlight-box') || el.classList.contains('highlight-freehand-wrapper'));
            document.getElementById('prop-opacity').style.display = (['highlight', 'pen'].includes(currentTool) || opacitySelectable) ? 'flex' : 'none';
            
            if (['pen', 'mask', 'shape', 'highlight'].includes(currentTool)) {
                if (currentTool === 'pen') {
                    const mode = document.querySelector('input[name="penMode"]:checked').value;
                    penWidthSlider.value = toolWidths[mode];
                    penWidthInput.value = toolWidths[mode];
                } else {
                    penWidthSlider.value = toolWidths[currentTool];
                    penWidthInput.value = toolWidths[currentTool];
                }
            }
            // 選択中のものがあれば、その太さをスライダーに映す
            if (hasWidthSel) {
                const selW = selectionWidthValue();
                if (selW !== null && isFinite(selW)) {
                    penWidthSlider.value = selW;
                    penWidthInput.value = selW;
                }
            }

            const floatingProps = document.getElementById('floating-properties');
            const hasProps = ['text', 'highlight', 'pen', 'mask', 'shape'].includes(currentTool) || hasSel;
            // 常時は出さず、今のツールをもう一度クリックした時だけ出す（作業の邪魔にならないように）
            const showProps = hasProps && !!(window.isPropsOpen && window.isPropsOpen());
            if(floatingProps) {
                floatingProps.style.display = showProps ? 'flex' : 'none';
            }
            // 区切り線は「実際に見えている先頭」には要らない。
            // 隠れている項目があるので :first-child だけでは足りない。
            if (floatingProps) {
                let first = true;
                floatingProps.querySelectorAll('.prop-group').forEach(g => {
                    const shown = getComputedStyle(g).display !== 'none';
                    g.classList.toggle('is-first', shown && first);
                    if (shown) first = false;
                });
            }
            // 設定行が開いている間は、今のツールのボタンに「開いている」印を付ける
            document.querySelectorAll('.tool-switch label[for^="tool-"]').forEach(l => {
                l.classList.toggle('props-open', showProps && l.htmlFor === 'tool-' + currentTool);
            });

            // 選択が無ければ「複製」「削除」を押せなくする
            const delBtn = document.getElementById('btn-delete'); if (delBtn) delBtn.disabled = !hasSel;
            const dupBtn = document.getElementById('btn-duplicate'); if (dupBtn) dupBtn.disabled = !hasSel;
            // 「…」メニューは隠した本体を代理で押すので、無効状態も写す
            document.querySelectorAll('#tool-more-menu li[data-proxy]').forEach(li => {
                const src = document.getElementById(li.dataset.proxy);
                li.classList.toggle('is-disabled', !!(src && src.disabled));
            });

            updatePaletteUI(); updateBrushCursor();
        }

        toolRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                currentTool = e.target.value;
                // ツールを選んだら設定行を開く（もう一度そのツールを押すと閉じる・08-07 Rayan様の指示）
                if (window.openProps) window.openProps();
                updateToolbar();
                applyToolClasses();
                if (selectedElements.length > 0) window.deselectCurrent();
                if (window.updateToolsHeightVar) window.updateToolsHeightVar();
            });
        });

        // 今選ばれているツールをもう一度クリックしたら、設定行（色・太さ・大きさ）を開閉する。
        // label の click は、ラジオが切り替わる前に来るので currentTool はまだ古い値。
        document.querySelectorAll('.tool-switch label[for]').forEach(label => {
            const radio = document.getElementById(label.htmlFor);
            if (!radio || radio.name !== 'currentTool') return;
            label.addEventListener('click', () => {
                if (radio.value === currentTool && window.toggleProps) window.toggleProps();
            });
        });

        // ツール由来のクラスを貼り直す（スペース押し・シフト押しの一時状態も維持する）
        function applyToolClasses() {
            workspaceContainer.className = '';
            workspaceContainer.classList.add('tool-' + currentTool);
            if (window.isMasksHidden) workspaceContainer.classList.add('masks-hidden');
            if (spaceHeld) workspaceContainer.classList.add('pan-ready');
            if (shiftHeld) workspaceContainer.classList.add('text-select-on');
            if (pdfTextSelected) workspaceContainer.classList.add('pdf-text-selected');
        }

        // 図形を置いた直後にマウスツールへ戻す。直前の要素は選択したままにする
        window.returnToSelectTool = function() {
            if (currentTool === 'select') return;
            const radio = document.getElementById('tool-select');
            if (radio) radio.checked = true;
            currentTool = 'select';
            applyToolClasses();
            updateToolbar();
        };
        maskTypeRadios.forEach(radio => { radio.addEventListener('change', () => { updateToolbar(); }); });
        document.querySelectorAll('input[name="highlightType"]').forEach(radio => { radio.addEventListener('change', () => { updateToolbar(); }); });
        shapeTypeRadios.forEach(radio => { radio.addEventListener('change', () => { updateToolbar(); }); });
        penModeRadios.forEach(radio => { radio.addEventListener('change', () => { updateToolbar(); }); });
        
        window.__toolbarReady = true;
        updateToolbar();

        // 太さ変更中に、画面中央へ太さのプレビュー（丸＋数値）を出す
        const widthPreview = document.getElementById('width-preview');
        const widthPreviewDot = document.getElementById('width-preview-dot');
        const widthPreviewLabel = document.getElementById('width-preview-label');
        let widthPreviewTimer = null;
        function showWidthPreview() {
            const w = parseFloat(penWidthInput.value);
            if (!isFinite(w)) return;
            const visualSize = Math.max(2, w * zoomLevel);
            widthPreviewDot.style.width = visualSize + 'px';
            widthPreviewDot.style.height = visualSize + 'px';
            widthPreviewLabel.textContent = (Math.round(w * 10) / 10) + ' px';
            widthPreview.classList.add('visible');
            clearTimeout(widthPreviewTimer);
            widthPreviewTimer = setTimeout(() => { widthPreview.classList.remove('visible'); }, 800);
        }
        function hideWidthPreview() {
            clearTimeout(widthPreviewTimer);
            widthPreview.classList.remove('visible');
        }
        [penWidthSlider, penWidthInput].forEach(el => {
            el.addEventListener('pointerleave', hideWidthPreview);
            el.addEventListener('blur', hideWidthPreview);
        });

        penWidthSlider.addEventListener('input', (e) => {
            penWidthInput.value = e.target.value;
            const activeType = (currentTool === 'pen') ? document.querySelector('input[name="penMode"]:checked').value : currentTool;
            toolWidths[activeType] = parseFloat(e.target.value);
            updateBrushCursor();
            showWidthPreview();
            applyWidthToSelection(e.target.value);
        });
        penWidthInput.addEventListener('input', (e) => {
            let val = parseFloat(e.target.value);
            // 空欄や不正値の途中入力では NaN 幅の線・マスクを作らない。有効な数値を打つまで何も適用しない。
            if (!isFinite(val)) return;
            if (val < 0.5) val = 0.5; if (val > 100) val = 100;
            penWidthSlider.value = val;
            const activeType = (currentTool === 'pen') ? document.querySelector('input[name="penMode"]:checked').value : currentTool;
            toolWidths[activeType] = val;
            updateBrushCursor();
            showWidthPreview();
            applyWidthToSelection(val);
        });
        // フォーカスを外した／確定した時に空欄・不正値を有効値へ戻す（描画時に NaN を読ませない）
        function normalizePenWidthInput() {
            let val = parseFloat(penWidthInput.value);
            if (!isFinite(val)) {
                const activeType = (currentTool === 'pen') ? (document.querySelector('input[name="penMode"]:checked')||{}).value : currentTool;
                val = parseFloat(penWidthSlider.value);
                if (!isFinite(val)) val = (activeType && isFinite(toolWidths[activeType])) ? toolWidths[activeType] : 4;
            }
            if (val < 0.5) val = 0.5; if (val > 100) val = 100;
            penWidthInput.value = val; penWidthSlider.value = val;
        }
        penWidthInput.addEventListener('change', normalizePenWidthInput);
        penWidthInput.addEventListener('blur', normalizePenWidthInput);

        // 今のツールで選択できる要素の種類
        function currentPickSelector() {
            if (currentTool === 'mask') return '.mask';
            if (currentTool === 'highlight') return '.highlight-box';
            if (currentTool === 'text') return '.text-wrapper';
            // 図形ツールは図形だけ。ここに .mask を混ぜると黒塗りまで掴めてしまう
            if (currentTool === 'shape') return '.shape-element';
            return '.mask, .text-wrapper, .highlight-box, .shape-element, .image-element';
        }
        // カーソルの下に「選択できるもの」があるか（つまみを含む）
        function isPickableAt(target) {
            if (!target || !target.closest) return false;
            if (target.classList && (target.classList.contains('fh-handle') || target.classList.contains('stroke-handle') || target.classList.contains('resize-handle'))) return true;
            if (!['select', 'mask', 'highlight', 'text'].includes(currentTool)) return false;
            return !!target.closest(currentPickSelector());
        }

        // 丸いブラシカーソルを出す＝手書きで描くツールを使っているとき
        function isFreehandDrawing() {
            const maskType = document.querySelector('input[name="maskType"]:checked') ? document.querySelector('input[name="maskType"]:checked').value : 'rect';
            return currentTool === 'pen'
                || (currentTool === 'mask' && maskType === 'free')
                || (currentTool === 'highlight' && currentHighlightType() === 'free');
        }

        function updateBrushCursor() {
            if (isFreehandDrawing()) {
                const visualSize = parseFloat(penWidthInput.value) * zoomLevel;
                brushCursor.style.width = visualSize + 'px'; brushCursor.style.height = visualSize + 'px';
            } else {
                brushCursor.style.width = '0px'; brushCursor.style.height = '0px';
            }
        }

        function setZoom(newZoom, focalX, focalY) {
            if (newZoom < 0.2) newZoom = 0.2; if (newZoom > 5.0) newZoom = 5.0;

            const containerW = workspaceContainer.clientWidth;
            const containerH = workspaceContainer.clientHeight;

            // 焦点（コンテナ左上からのビューポート座標）。未指定なら中央。
            const fx = (focalX === undefined) ? containerW / 2 : focalX;
            const fy = (focalY === undefined) ? containerH / 2 : focalY;

            const oldZoom = zoomLevel;
            const oldMarginLeft = parseFloat(workspaceWrapper.style.marginLeft) || 0;
            const oldMarginTop = parseFloat(workspaceWrapper.style.marginTop) || 0;

            const centerX = (workspaceContainer.scrollLeft + fx - oldMarginLeft) / oldZoom;
            const centerY = (workspaceContainer.scrollTop + fy - oldMarginTop) / oldZoom;

            zoomLevel = newZoom; 
            workspace.style.transform = `scale(${zoomLevel})`; 
            zoomText.innerText = Math.round(zoomLevel * 100) + '%';
            
            const newScaledW = workspace.offsetWidth * zoomLevel; 
            const newScaledH = workspace.offsetHeight * zoomLevel;
            
            const BOTTOM_SLACK = 200; // 最下部がツールバーに隠れないよう下へスクロールできる余地
            // コンテンツが大きくても四方にパンの余地を残す。
            // 固定値のままだとスマホでは余白だけで画面が埋まり、紙が画面外へ出るので幅に応じて縮める。
            const PAD_X = Math.min(250, containerW * 0.25);
            const PAD_Y = Math.min(140, containerH * 0.25);

            // 余白は**左右・上下の両方**に置く。以前は marginLeft/marginTop だけで、
            // 右と上に余地が無かった＝紙を左（や上）へ動かせなかった（Rayan様の報告・08-03）。
            // 紙が画面より小さい時は、はみ出す分の半分を両側に足して中央に置けるようにする。
            const slackX = PAD_X + Math.max(0, (containerW - newScaledW) / 2);
            const slackY = PAD_Y + Math.max(0, (containerH - newScaledH) / 2);

            const newMarginLeft = slackX;
            const newMarginTop = slackY;

            workspaceWrapper.style.width = (newScaledW + slackX) + 'px';
            workspaceWrapper.style.height = (newScaledH + slackY + BOTTOM_SLACK) + 'px';
            workspaceWrapper.style.marginLeft = newMarginLeft + 'px';
            workspaceWrapper.style.marginTop = newMarginTop + 'px';

            workspaceContainer.scrollLeft = (centerX * zoomLevel) + newMarginLeft - fx;
            workspaceContainer.scrollTop = (centerY * zoomLevel) + newMarginTop - fy;
            
            updateBrushCursor(); 

            clearTimeout(zoomTimeout);
            zoomTimeout = setTimeout(() => {
                if (currentBackground && currentBackground.type === 'pdf' && typeof renderPdfPageAsync === 'function') {
                    const currentP = parseInt(pageInput.value);
                    for(let i = Math.max(1, currentP - 1); i <= Math.min(totalPdfPages, currentP + 1); i++) {
                        const pDiv = document.getElementById(`pdf-page-${i}`);
                        if (pDiv) renderPdfPageAsync(pDiv, zoomLevel);
                    }
                }
                // 画像モードの手描きはSVGベクターのため、ズームでの再描画は不要
            }, 500);
        }

        // 紙を見やすい位置へ置く。読み込み直後とズームリセットで使う。
        // setZoom は「いま見ている点」を保つ作りなので、位置を決め直すのは別仕事にする。
        // 横は中央。縦は、紙が画面に収まるなら中央、収まらないなら**上端**を出す
        // （教科書やプリントは上から読むので、真ん中から始まると迷う）。
        window.centerWorkspace = function centerWorkspace() {
            const marginLeft = parseFloat(workspaceWrapper.style.marginLeft) || 0;
            const marginTop = parseFloat(workspaceWrapper.style.marginTop) || 0;
            const scaledW = workspace.offsetWidth * zoomLevel;
            const scaledH = workspace.offsetHeight * zoomLevel;
            const viewW = workspaceContainer.clientWidth;
            const viewH = workspaceContainer.clientHeight;
            workspaceContainer.scrollLeft = marginLeft + scaledW / 2 - viewW / 2;
            workspaceContainer.scrollTop = (scaledH <= viewH)
                ? marginTop + scaledH / 2 - viewH / 2
                : Math.max(0, marginTop - 20);
        };

        window.addEventListener('resize', () => { if(uploadedImage.src || totalPdfPages > 0) setZoom(zoomLevel); });

        document.getElementById('btn-zoom-in').addEventListener('click', () => setZoom(zoomLevel + 0.1));
        document.getElementById('btn-zoom-out').addEventListener('click', () => setZoom(zoomLevel - 0.1));
        document.getElementById('btn-zoom-reset').addEventListener('click', () => { setZoom(1.0); window.centerWorkspace(); });

        // Ctrl + マウスホイールでカーソル位置を中心にズーム（トラックパッドのピンチも同扱い）
        workspaceContainer.addEventListener('wheel', (e) => {
            if (!e.ctrlKey) return;
            e.preventDefault(); // ブラウザのページズームを抑止
            const rect = workspaceContainer.getBoundingClientRect();
            const fx = e.clientX - rect.left;
            const fy = e.clientY - rect.top;
            const step = e.deltaY < 0 ? 0.1 : -0.1;
            setZoom(zoomLevel + step, fx, fy);
        }, { passive: false });

        window.deselectCurrent = function() {
            // 空のまま置き去りにされたテキスト箱は、選択が外れる時に消す。
            // 編集中（フォーカス中）のものは focusout 側に任せて触らない。
            selectedElements.forEach(el => {
                if (el.classList && el.classList.contains('text-wrapper')) {
                    const tc = el.querySelector('.text-content');
                    if (tc && tc.innerText.trim() === '' && document.activeElement !== tc) el.remove();
                }
            });
            selectedElements.forEach(el => el.classList.remove('selected'));
            selectedElements = [];
            savedSelectionRange = null;
            if (typeof deselectStroke === 'function') deselectStroke();
            if (typeof clearMultiStrokeSelection === 'function') clearMultiStrokeSelection();
            if (window.__toolbarReady) updateToolbar();
        }
        
