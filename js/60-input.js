// ===== 60-input.js : 指とマウスの操作（ピンチ・ドラッグ・描く・選ぶ） =====
// app.js を分割したもの。素のスクリプトなので変数は全ファイルで共有される。
// index.html の読み込み順を変えると壊れる。

        function touchMid(pts) {
            const a = pts[0], b = pts[1];
            return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
        }
        function beginPinch() {
            const pts = [...activeTouches.values()];
            if (pts.length < 2) return;
            const m = touchMid(pts);
            if (m.d < 1) return;
            abortCurrentAction();               // 描きかけを畳んでからピンチへ
            focusTapMask = null; focusTapStart = null; // 2本指はめくりではない
            touchGestureActive = true;
            const r = workspaceContainer.getBoundingClientRect();
            touchGesture = {
                startDist: m.d, startZoom: zoomLevel,
                prevMidX: m.x - r.left, prevMidY: m.y - r.top,
            };
        }
        // 指が離れたイベントを取りこぼすと「2本指のまま」で固着し、以後タップが効かなくなる。
        // 古い記録は捨てて、常に今触っている指だけを見る。
        function pruneStaleTouches() {
            const now = Date.now();
            for (const [id, p] of activeTouches) {
                if (now - p.t > 3000) activeTouches.delete(id);
            }
            if (activeTouches.size < 2) { touchGesture = null; }
            if (activeTouches.size === 0) touchGestureActive = false;
        }
        document.addEventListener('pointerdown', function (e) {
            if (e.pointerType !== 'touch') return;
            if (!e.target.closest || !e.target.closest('#workspace-container')) return;
            pruneStaleTouches();
            activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: Date.now() });
            if (activeTouches.size === 2) beginPinch();
        }, true);

        document.addEventListener('pointermove', function (e) {
            if (e.pointerType !== 'touch') return;
            if (!activeTouches.has(e.pointerId)) return;
            activeTouches.set(e.pointerId, { x: e.clientX, y: e.clientY, t: Date.now() });
            if (!touchGesture || activeTouches.size < 2) return;
            const pts = [...activeTouches.values()];
            const m = touchMid(pts);
            const r = workspaceContainer.getBoundingClientRect();
            const midX = m.x - r.left, midY = m.y - r.top;
            // 2本指の間隔の変化＝拡大率。指の中点を動かさないように焦点を渡す
            if (m.d > 1 && touchGesture.startDist > 1) {
                setZoom(touchGesture.startZoom * (m.d / touchGesture.startDist), midX, midY);
            }
            // 中点の移動ぶんだけ紙を動かす（2本指ドラッグ＝スクロール）
            workspaceContainer.scrollLeft -= (midX - touchGesture.prevMidX);
            workspaceContainer.scrollTop -= (midY - touchGesture.prevMidY);
            touchGesture.prevMidX = midX; touchGesture.prevMidY = midY;
            e.preventDefault(); e.stopPropagation();
        }, true);

        function endTouch(e) {
            if (e.pointerType !== 'touch') return;
            if (!activeTouches.has(e.pointerId)) return;
            activeTouches.delete(e.pointerId);
            if (activeTouches.size < 2) touchGesture = null;
            if (activeTouches.size === 0) touchGestureActive = false;
        }
        document.addEventListener('pointerup', endTouch, true);
        document.addEventListener('pointercancel', endTouch, true);

        // 学習モード中の指の扱い：黒塗りをタップでめくる／それ以外は1本指でスクロール
        document.addEventListener('pointerup', function (e) {
            if (!focusTapStart) return;
            const moved = Math.hypot(e.clientX - focusTapStart.x, e.clientY - focusTapStart.y);
            const m = focusTapMask;
            focusTapMask = null; focusTapStart = null;
            // 動かさずに離した＝タップ。黒塗りの上ならめくる
            if (m && m.isConnected && moved <= TAP_SLOP && !window.isMasksHidden) {
                m.classList.toggle('revealed');
            }
        });

        // 【改修】ポインターダウン（掴む・描画開始）の制御
        workspaceContainer.addEventListener('pointerdown', function(e) {
            // 2本指の操作（拡大・スクロール）が始まっていたら、編集側は手を出さない
            if (touchGestureActive) return;
            // 学習モード：編集はしない。指なら「黒塗りをタップでめくる」「1本指でスクロール」
            if (document.body.classList.contains('focus-mode')) {
                if (e.pointerType !== 'mouse') {
                    focusTapMask = e.target.closest ? e.target.closest('.mask') : null;
                    focusTapStart = { x: e.clientX, y: e.clientY };
                    action = 'pan'; startX = e.clientX; startY = e.clientY;
                    startRect = { scrollLeft: workspaceContainer.scrollLeft, scrollTop: workspaceContainer.scrollTop };
                }
                return;
            }
            // 中ボタン、またはスペース押し＋左クリックで、どのツール中でもパン
            if (e.button === 1 || (spaceHeld && e.button === 0)) {
                action = 'pan'; startX = e.clientX; startY = e.clientY;
                startRect = { scrollLeft: workspaceContainer.scrollLeft, scrollTop: workspaceContainer.scrollTop };
                workspaceContainer.classList.add('panning');
                brushCursor.style.display = 'none'; textCursor.style.display = 'none';
                e.preventDefault();
                return;
            }
            if (e.button !== 0) return;
            // マウスツール＋Shift は、要素を触らず背景（PDF）の文字選択をブラウザに任せる。
            // `.text-select-on` で canvas 要素は pointer-events:none になっているので、
            // ここは選択を外して素通りさせるだけでよい。
            if (currentTool === 'select' && shiftHeld) { window.deselectCurrent(); return; }
            // 背景PDFの文字選択は、Shift を離した後も残す作りにしてある。
            // 次に何かを触った時点で外す（範囲選択が preventDefault するので自動では消えない）
            if (pdfTextSelected) {
                const s = window.getSelection();
                if (s) s.removeAllRanges();
                updatePdfTextSelected();
            }
            if (!e.target.closest('#workspace')) return;

            const rect = workspace.getBoundingClientRect(); const mouseX = (e.clientX - rect.left) / zoomLevel; const mouseY = (e.clientY - rect.top) / zoomLevel;

            // 編集中のテキストを触った時の振り分け：
            //   ・文字の上 → ブラウザに任せる（カーソル移動・ドラッグで範囲選択）
            //   ・文字の外（外枠の余白）→ 入力を解除してその箱を選択
            const editingTc = document.activeElement;
            let justBlurredWrap = null;
            if (editingTc && editingTc.classList && editingTc.classList.contains('text-content')) {
                const wrap = editingTc.closest('.text-wrapper');
                if (wrap && wrap.contains(e.target) && (e.target === editingTc || editingTc.contains(e.target))) {
                    return; // 文字の上：ブラウザに任せる（カーソル移動・範囲選択）
                }
                // 文字の外（外枠の余白）や別の箱を押した＝この編集は終わり。
                // **明示的に blur する。** 下で preventDefault すると contentEditable は
                // 自然には focus を失わず、編集が続いたまま次を選ぶことになる（08-01 実測）。
                // この後は通常の選択処理へ流し、外枠クリックなら「解除して選択」になる
                // （編集へは戻さない＝下の再クリック判定から除外する）。
                justBlurredWrap = wrap;
                // 自分の外枠を掴んだ時は、空でも消さずに移動できるようにする
                preserveEmptyWrapper = (wrap && wrap.contains(e.target)) ? wrap : null;
                editingTc.blur();
                preserveEmptyWrapper = null;
            }

            // 既存オブジェクトの選択・移動・変形はマウスツールのときだけ。
            // 他ツールは新規作成に専念する（作成直後はマウスツールへ戻るので続けて編集できる）。
            // 例外：マスキングツールは、自分が作るマスキングだけはその場で選択・編集できる
            const canPickExisting = ['select', 'mask', 'highlight', 'text', 'shape'].includes(currentTool);
            const pickSelector = currentPickSelector();

            // ペン線の端のつまみ：ドラッグで線全体を拡大・縮小する
            if (currentTool === 'select' && selectedStroke && e.target.classList && e.target.classList.contains('stroke-handle')) {
                const cmd = currentStrokeCmd();
                if (cmd && cmd.points && cmd.points.length > 1) {
                    const isStart = e.target.dataset.end === 'start';
                    const anchor = isStart ? cmd.points[cmd.points.length - 1] : cmd.points[0];
                    const moving = isStart ? cmd.points[0] : cmd.points[cmd.points.length - 1];
                    action = 'scale_stroke';
                    strokeScale = {
                        anchor: { ...anchor },
                        orig: cmd.points.map(p => ({ ...p })),
                        baseDx: moving.x - anchor.x,
                        baseDy: moving.y - anchor.y
                    };
                    e.preventDefault(); e.stopPropagation(); return;
                }
            }

            // 手書き線の端のつまみ：ドラッグで線全体を拡大・縮小する
            if (canPickExisting && e.target.classList.contains('fh-handle')) {
                const wrapper = e.target.parentElement;
                if (!wrapper.classList.contains('selected')) {
                    window.deselectCurrent();
                    wrapper.classList.add('selected');
                    selectedElements = [wrapper];
                }
                window.bringToFront(wrapper);
                const pts = freehandPointsWorkspace(wrapper);
                const anchor = (e.target.dataset.end === 'start') ? pts[pts.length - 1] : pts[0];
                const moving = (e.target.dataset.end === 'start') ? pts[0] : pts[pts.length - 1];
                action = 'scale_freehand';
                freehandScale = {
                    wrapper, anchor, orig: pts,
                    baseDx: moving.x - anchor.x,
                    baseDy: moving.y - anchor.y
                };
                e.preventDefault(); e.stopPropagation(); return;
            }

            if (canPickExisting && e.target.classList.contains('resize-handle')) {
                action = 'resize';
                const targetElement = e.target.parentElement;
                // リサイズは常に「つまみを掴んだ要素」1つだけを対象にする。
                // 複数選択中に掴んでも他要素へ変形が波及しないよう、選択をこの要素に絞る。
                if (selectedElements.length !== 1 || selectedElements[0] !== targetElement) {
                    window.deselectCurrent();
                    targetElement.classList.add('selected');
                    selectedElements = [targetElement];
                }
                currentHandle = e.target.dataset.pos; 
                window.bringToFront(targetElement);
                startX = mouseX; startY = mouseY;
                // 幅・高さが max-content（中身なり）の時は数値にできないので、実寸を使う
                const startW = parseFloat(targetElement.style.width);
                const startH = parseFloat(targetElement.style.height);
                startRect = {
                    left: parseFloat(targetElement.style.left), top: parseFloat(targetElement.style.top),
                    width: isNaN(startW) ? targetElement.offsetWidth : startW,
                    height: isNaN(startH) ? targetElement.offsetHeight : startH
                };
                
                // 【追加】直線の場合、対角の座標を固定点として記憶する
                if (targetElement.dataset.shapeType === 'line') {
                    const dir = targetElement.dataset.lineDir || '\\';
                    const isP1 = currentHandle === 'p1';
                    let fixedX, fixedY;
                    if (dir === '\\') {
                        fixedX = isP1 ? startRect.left + startRect.width : startRect.left;
                        fixedY = isP1 ? startRect.top + startRect.height : startRect.top;
                    } else { // '/'
                        fixedX = isP1 ? startRect.left : startRect.left + startRect.width;
                        fixedY = isP1 ? startRect.top + startRect.height : startRect.top;
                    }
                    targetElement.dataset.fixedX = fixedX;
                    targetElement.dataset.fixedY = fixedY;
                }

                e.preventDefault(); e.stopPropagation(); return;
            }

            const clickedTextContent = (currentTool === 'select') ? e.target.closest('.text-content') : null;
            if (clickedTextContent) {
                const targetElement = clickedTextContent.parentElement;
                // Ctrl（Macは⌘）を押しながらのクリックは、選択に足す／外す
                if (e.ctrlKey || e.metaKey) {
                    if (typeof deselectStroke === 'function') deselectStroke();
                    if (targetElement.classList.contains('selected')) {
                        targetElement.classList.remove('selected');
                        selectedElements = selectedElements.filter(el => el !== targetElement);
                    } else {
                        targetElement.classList.add('selected');
                        selectedElements.push(targetElement);
                    }
                    updateToolbar();
                    e.preventDefault(); e.stopPropagation();
                    return;
                }
                if (!targetElement.classList.contains('selected')) {
                    window.deselectCurrent(); 
                    targetElement.classList.add('selected'); 
                    selectedElements = [targetElement];
                }
                window.bringToFront(targetElement);
                textSizeInput.value = parseInt(targetElement.style.fontSize); 
                e.stopPropagation(); 
                return; 
            }

            const draggableTarget = canPickExisting ? e.target.closest(pickSelector) : null;
            if (draggableTarget) {
                // Ctrl（⌘）を押しながらのクリックは、選択に足す／外す
                // （Shift は背景PDFの文字選択に使うので、複数選択には使わない）
                const additive = e.ctrlKey || e.metaKey;
                if (additive) {
                    if (typeof deselectStroke === 'function') deselectStroke();
                    if (draggableTarget.classList.contains('selected')) {
                        draggableTarget.classList.remove('selected');
                        selectedElements = selectedElements.filter(el => el !== draggableTarget);
                        updateToolbar();
                        e.preventDefault(); e.stopPropagation();
                        return;
                    }
                    draggableTarget.classList.add('selected');
                    selectedElements.push(draggableTarget);
                }

                // 選択済みのテキスト箱を（修飾なしで）もう一度クリックしたら編集に入る合図。
                // ただしドラッグしたら移動なので、実際の判定は pointerup で行う。
                // 直前まで編集していた箱の外枠クリックは「解除して選択」で止める（編集へ戻さない）
                pressWasSelectedText = !additive
                    && draggableTarget !== justBlurredWrap
                    && draggableTarget.classList.contains('text-wrapper')
                    && draggableTarget.classList.contains('selected')
                    && selectedElements.length === 1 && selectedElements[0] === draggableTarget;

                action = 'move';
                movePressTarget = draggableTarget;
                if (!draggableTarget.classList.contains('selected')) {
                    window.deselectCurrent();
                    draggableTarget.classList.add('selected');
                    selectedElements = [draggableTarget];
                }
                selectedElements.forEach(el => window.bringToFront(el));
                
                if (selectedElements.length === 1 && selectedElements[0].classList.contains('text-wrapper')) {
                    textSizeInput.value = parseInt(selectedElements[0].style.fontSize);
                }

                startRects = selectedElements.map(el => ({
                    el: el,
                    left: parseFloat(el.style.left),
                    top: parseFloat(el.style.top)
                }));
                // 範囲選択に手書き線も入っていれば一緒に動かす
                strokesDrag = beginStrokesDrag();
                startX = mouseX; startY = mouseY;
                updateToolbar();
                e.preventDefault(); e.stopPropagation();
                return;
            }

            // 範囲選択した線の囲みの中を押したら、選んだぶんをまとめて動かす。
            // **選択を外す前に見る**（下の deselectCurrent が選択を消してしまうため）。
            if (currentTool === 'select' && selectedStrokes.length && insideSelectedStrokes(mouseX, mouseY)) {
                strokesDrag = beginStrokesDrag();
                if (strokesDrag) {
                    action = 'move';
                    startX = mouseX; startY = mouseY;
                    startRects = selectedElements.map(el => ({
                        el: el, left: parseFloat(el.style.left), top: parseFloat(el.style.top)
                    }));
                    e.preventDefault(); e.stopPropagation();
                    return;
                }
            }

            // 何もないところをクリックした。選択があったかを覚えておき、
            // マスキングでは「選択解除だけ」で終える判断に使う
            clearedSelectionOnDown = (selectedElements.length > 0 || !!selectedStroke);
            // Ctrl（⌘）を押しながら範囲選択を始める時は、今の選択を保つ（足すため）。
            // 修飾なしの時だけここで解除する。box_select の確定側でも同様に判断する。
            const additiveSelect = e.ctrlKey || e.metaKey;
            if (!(currentTool === 'select' && additiveSelect)) {
                window.deselectCurrent();
            }

            if (currentTool === 'mask') {
                const maskType = document.querySelector('input[name="maskType"]:checked') ? document.querySelector('input[name="maskType"]:checked').value : 'rect';
                if (maskType === 'rect') {
                    action = 'draw'; startX = mouseX; startY = mouseY;
                    drawingBox.style.left = startX + 'px'; drawingBox.style.top = startY + 'px';
                    drawingBox.style.width = '0px'; drawingBox.style.height = '0px';
                    drawingBox.style.display = 'block';
                } else {
                    action = 'draw_freehand_mask';
                    penPoints = [{x: mouseX, y: mouseY}];
                    tempPathD = `M ${mouseX} ${mouseY}`;
                    
                    tempMaskSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    tempMaskSvg.style.position = 'absolute';
                    tempMaskSvg.style.top = '0';
                    tempMaskSvg.style.left = '0';
                    tempMaskSvg.style.width = '100%';
                    tempMaskSvg.style.height = '100%';
                    tempMaskSvg.style.pointerEvents = 'none';
                    tempMaskSvg.style.zIndex = '9999';
                    
                    tempMaskPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    tempMaskPath.setAttribute("d", tempPathD);
                    tempMaskPath.setAttribute("stroke", "rgba(0, 0, 0, 0.7)"); // 出来上がりと同じ半透明の黒
                    tempMaskPath.setAttribute("stroke-width", penWidthInput.value);
                    tempMaskPath.setAttribute("stroke-linecap", "round");
                    tempMaskPath.setAttribute("stroke-linejoin", "round");
                    tempMaskPath.setAttribute("fill", "none");
                    
                    tempMaskSvg.appendChild(tempMaskPath);
                    workspace.appendChild(tempMaskSvg);
                }
            } else if (currentTool === 'shape') {
                action = 'draw_shape'; startX = mouseX; startY = mouseY;
                const shapeType = document.querySelector('input[name="shapeType"]:checked').value;
                const strokeW = penWidthInput.value;
                const col = toolColors['shape'];
                currentDrawingShape = window.createShapeElement(startX+'px', startY+'px', '0px', '0px', shapeType, col, strokeW, '\\');
                currentDrawingShape.style.pointerEvents = 'none';
            } else if (currentTool === 'highlight') {
                if (currentHighlightType() === 'rect') {
                    action = 'draw'; startX = mouseX; startY = mouseY;
                    // 作成中も完成時と同じ色・濃さで見せる
                    drawingBox.style.backgroundColor = hexToRgba(toolColors['highlight'], penOpacityInput.value);
                    drawingBox.style.left = startX + 'px'; drawingBox.style.top = startY + 'px';
                    drawingBox.style.width = '0px'; drawingBox.style.height = '0px';
                    drawingBox.style.display = 'block';
                } else {
                    action = 'draw_freehand_highlight';
                    penPoints = [{x: mouseX, y: mouseY}];
                    tempPathD = `M ${mouseX} ${mouseY}`;

                    tempMaskSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                    tempMaskSvg.style.position = 'absolute';
                    tempMaskSvg.style.top = '0';
                    tempMaskSvg.style.left = '0';
                    tempMaskSvg.style.width = '100%';
                    tempMaskSvg.style.height = '100%';
                    tempMaskSvg.style.pointerEvents = 'none';
                    tempMaskSvg.style.zIndex = '9999';
                    tempMaskSvg.style.mixBlendMode = 'multiply';

                    tempMaskPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
                    tempMaskPath.setAttribute("d", tempPathD);
                    tempMaskPath.setAttribute("stroke", hexToRgba(toolColors['highlight'], penOpacityInput.value));
                    tempMaskPath.setAttribute("stroke-width", penWidthInput.value);
                    tempMaskPath.setAttribute("stroke-linecap", "round");
                    tempMaskPath.setAttribute("stroke-linejoin", "round");
                    tempMaskPath.setAttribute("fill", "none");

                    tempMaskSvg.appendChild(tempMaskPath);
                    workspace.appendChild(tempMaskSvg);
                }
            } else if (currentTool === 'text') {
                // クリックだけなら中身なりに伸びる箱、ドラッグしたらその幅で折り返す箱を作る
                action = 'draw_text'; startX = mouseX; startY = mouseY;
                drawingBox.style.left = startX + 'px'; drawingBox.style.top = startY + 'px';
                drawingBox.style.width = '0px'; drawingBox.style.height = '0px';
                drawingBox.style.display = 'block';
            } else if (currentTool === 'pen') {
                action = 'draw_pen';
                const page = e.target.closest('.pdf-page');
                activeDrawSvg = page ? page.querySelector('.drawing-svg') : workspace.querySelector('.drawing-svg');
                if (!activeDrawSvg) return;

                activeCanvasIndex = activeDrawSvg.dataset.canvasIndex;
                const svgRect = activeDrawSvg.getBoundingClientRect();
                const vb = activeDrawSvg.viewBox.baseVal;
                const sx = svgRect.width ? vb.width / svgRect.width : 1;
                const sy = svgRect.height ? vb.height / svgRect.height : 1;
                const localX = (e.clientX - svgRect.left) * sx;
                const localY = (e.clientY - svgRect.top) * sy;
                rawPenPoints = [{x: localX, y: localY}];

                // ドラッグ中のプレビュー（確定時に renderStrokesToSVG で正式描画）
                const actualTool = document.querySelector('input[name="penMode"]:checked').value;
                liveStrokePath = document.createElementNS(SVGNS, 'path');
                liveStrokePath.setAttribute('fill', 'none');
                liveStrokePath.setAttribute('stroke-linecap', 'round');
                liveStrokePath.setAttribute('stroke-linejoin', 'round');
                liveStrokePath.setAttribute('stroke-width', parseFloat(penWidthInput.value));
                if (actualTool === 'pen') {
                    liveStrokePath.setAttribute('stroke', toolColors['pen']);
                    liveStrokePath.setAttribute('stroke-opacity', penOpacityInput.value);
                } else {
                    liveStrokePath.setAttribute('stroke', 'rgba(140,140,140,0.6)'); // 消しゴムのプレビュー
                }
                liveStrokePath.setAttribute('d', livePathStart(rawPenPoints[0]));
                activeDrawSvg.appendChild(liveStrokePath);
            } else if (currentTool === 'select') {
                // まずペン線のクリック選択を試す（当たれば移動開始、外れたら範囲選択）
                const hitStroke = findStrokeAt(e);
                if (hitStroke) {
                    selectStroke(hitStroke);
                    const loc = eventToSvgLocal(hitStroke.svg, e);
                    const cmd = currentStrokeCmd();
                    strokeMoveStart = { x: loc.x, y: loc.y, orig: cmd.points.map(p => ({ ...p })) };
                    action = 'move_stroke';
                    e.preventDefault();
                    return;
                }
                // 指の場合、何もない所を1本指でなぞるのは「紙を動かす」。
                // スマホは touch-action:none でブラウザのスクロールが効かないため、
                // マウスツールの1本指をスクロールに充てないと画面外へ移動できない。
                if (e.pointerType === 'touch') {
                    action = 'pan'; startX = e.clientX; startY = e.clientY;
                    startRect = { scrollLeft: workspaceContainer.scrollLeft, scrollTop: workspaceContainer.scrollTop };
                    workspaceContainer.classList.add('panning');
                    e.preventDefault();
                    return;
                }
                action = 'box_select';
                startX = mouseX; startY = mouseY;
                selectionBox.style.left = startX + 'px'; selectionBox.style.top = startY + 'px';
                selectionBox.style.width = '0px'; selectionBox.style.height = '0px';
                selectionBox.style.display = 'block';
                e.preventDefault();
            }
        });

        // 【改修】ポインター移動（ドラッグなど）の制御
        document.addEventListener('pointermove', function(e) {
            // 選択できるものの上ではカーソルの変化を見せたいので、丸は出さない
            const showBrush = action !== 'pan' && !spaceHeld && isFreehandDrawing()
                && !isPickableAt(e.target) && e.target.closest('#workspace-container');
            if (showBrush) {
                brushCursor.style.display = 'block'; brushCursor.style.left = e.clientX + 'px'; brushCursor.style.top = e.clientY + 'px';
            } else { brushCursor.style.display = 'none'; }

            // テキストツールは「I」のカーソル。高さは文字サイズ×拡大率に追従する
            const showTextCursor = currentTool === 'text' && action !== 'pan' && !spaceHeld
                && !isPickableAt(e.target) && e.target.closest('#workspace-container');
            if (showTextCursor) {
                const fs = parseFloat(textSizeInput.value) || 20;
                textCursor.style.height = Math.max(8, fs * zoomLevel) + 'px';
                textCursor.style.display = 'block';
                textCursor.style.left = e.clientX + 'px'; textCursor.style.top = e.clientY + 'px';
            } else { textCursor.style.display = 'none'; }

            workspaceContainer.classList.toggle('hide-cursor', !!showBrush || !!showTextCursor);

            if (!action) return;
            if (action === 'pan') {
                if (window.getSelection().toString().length > 0) return;
                
                const dx = e.clientX - startX; const dy = e.clientY - startY;
                workspaceContainer.scrollLeft = startRect.scrollLeft - dx; workspaceContainer.scrollTop = startRect.scrollTop - dy; return;
            }
            const rect = workspace.getBoundingClientRect(); let currentX = Math.max(0, Math.min((e.clientX - rect.left) / zoomLevel, workspace.offsetWidth)); let currentY = Math.max(0, Math.min((e.clientY - rect.top) / zoomLevel, workspace.offsetHeight));
            
            if (action === 'draw' || action === 'draw_text') {
                drawingBox.style.width = Math.abs(currentX - startX) + 'px'; drawingBox.style.height = Math.abs(currentY - startY) + 'px';
                drawingBox.style.left = Math.min(currentX, startX) + 'px'; drawingBox.style.top = Math.min(currentY, startY) + 'px';
            } else if (action === 'box_select') {
                selectionBox.style.width = Math.abs(currentX - startX) + 'px'; selectionBox.style.height = Math.abs(currentY - startY) + 'px';
                selectionBox.style.left = Math.min(currentX, startX) + 'px'; selectionBox.style.top = Math.min(currentY, startY) + 'px';
            } else if (action === 'move_stroke' && selectedStroke && strokeMoveStart) {
                const loc = eventToSvgLocal(selectedStroke.svg, e);
                const dx = loc.x - strokeMoveStart.x, dy = loc.y - strokeMoveStart.y;
                const cmd = currentStrokeCmd();
                if (cmd) { cmd.points = strokeMoveStart.orig.map(p => ({ x: p.x + dx, y: p.y + dy })); reRenderStrokeSvg(); }
            } else if (action === 'draw_shape' && currentDrawingShape) {
                let minX = Math.min(startX, currentX);
                let minY = Math.min(startY, currentY);
                let w = Math.abs(currentX - startX);
                let h = Math.abs(currentY - startY);
                let lineDir = (startX < currentX && startY > currentY) || (startX > currentX && startY < currentY) ? '/' : '\\';

                const shapeType = currentDrawingShape.dataset.shapeType;
                // Shift 押しで四角は正方形・円は真円（線は対象外）。始点を角に固定して一辺を揃える。
                if (shapeType !== 'line' && e.shiftKey) {
                    const side = Math.max(w, h);
                    w = side; h = side;
                    minX = currentX < startX ? startX - side : startX;
                    minY = currentY < startY ? startY - side : startY;
                }

                currentDrawingShape.style.left = minX + 'px';
                currentDrawingShape.style.top = minY + 'px';
                // 幅・高さが 0 になると SVG そのものが描かれない（水平・垂直に引いた線が
                // 消えて見えた原因）。最低 1px を残す。
                currentDrawingShape.style.width = Math.max(w, 1) + 'px';
                currentDrawingShape.style.height = Math.max(h, 1) + 'px';
                currentDrawingShape.dataset.lineDir = lineDir;
                if (shapeType === 'line') {
                    const shapeNode = currentDrawingShape.querySelector('svg > line');
                    if (lineDir === '/') {
                        shapeNode.setAttribute('x1', '0'); shapeNode.setAttribute('y1', '100%');
                        shapeNode.setAttribute('x2', '100%'); shapeNode.setAttribute('y2', '0');
                    } else {
                        shapeNode.setAttribute('x1', '0'); shapeNode.setAttribute('y1', '0');
                        shapeNode.setAttribute('x2', '100%'); shapeNode.setAttribute('y2', '100%');
                    }
                }
            } else if (action === 'scale_stroke' && selectedStroke && strokeScale) {
                const loc = eventToSvgLocal(selectedStroke.svg, e);
                const { anchor, orig, baseDx, baseDy } = strokeScale;
                const tf = endpointTransform(anchor, baseDx, baseDy, loc.x, loc.y);
                const cmd = currentStrokeCmd();
                if (cmd) {
                    cmd.points = orig.map(tf);
                    reRenderStrokeSvg();
                }
            } else if (action === 'scale_freehand' && freehandScale) {
                const { wrapper, anchor, orig, baseDx, baseDy } = freehandScale;
                rebuildFreehand(wrapper, orig.map(endpointTransform(anchor, baseDx, baseDy, currentX, currentY)));
            } else if ((action === 'draw_freehand_mask' || action === 'draw_freehand_highlight') && tempMaskSvg) {
                penPoints.push({x: currentX, y: currentY});
                tempPathD += ` L ${currentX} ${currentY}`;
                tempMaskPath.setAttribute("d", tempPathD);
            } else if (action === 'draw_pen' && activeDrawSvg && liveStrokePath) {
                const svgRect = activeDrawSvg.getBoundingClientRect();
                const vb = activeDrawSvg.viewBox.baseVal;
                const sx = svgRect.width ? vb.width / svgRect.width : 1;
                const sy = svgRect.height ? vb.height / svgRect.height : 1;
                const localX = (e.clientX - svgRect.left) * sx;
                const localY = (e.clientY - svgRect.top) * sy;
                rawPenPoints.push({x: localX, y: localY});
                liveStrokePath.setAttribute('d', livePathAppend(rawPenPoints));
            } else if (action === 'move' && (startRects.length > 0 || strokesDrag)) {
                const dx = currentX - startX; const dy = currentY - startY; 
                startRects.forEach(item => {
                    item.el.style.left = (item.left + dx) + 'px';
                    item.el.style.top = (item.top + dy) + 'px';
                });
                if (strokesDrag) applyStrokesDrag(strokesDrag, dx, dy);
            } else if (action === 'resize' && selectedElements.length > 0) {
                const target = selectedElements[0];
                
                // 【追加】直線の場合は2点ドラッグ処理に切り替え
                if (target.dataset.shapeType === 'line') {
                    const fixedX = parseFloat(target.dataset.fixedX);
                    const fixedY = parseFloat(target.dataset.fixedY);
                    
                    const minX = Math.min(fixedX, currentX);
                    const minY = Math.min(fixedY, currentY);
                    const w = Math.abs(fixedX - currentX);
                    const h = Math.abs(fixedY - currentY);
                    
                    target.style.left = minX + 'px';
                    target.style.top = minY + 'px';
                    target.style.width = Math.max(w, 1) + 'px';
                    target.style.height = Math.max(h, 1) + 'px';
                    
                    let lineDir = (fixedX < currentX && fixedY > currentY) || (fixedX > currentX && fixedY < currentY) ? '/' : '\\';
                    target.dataset.lineDir = lineDir;
                    
                    // 見た目の線と、当たり判定用の透明な線の両方を向きに合わせる
                    target.querySelectorAll('svg > line').forEach(shapeNode => {
                        if (lineDir === '/') {
                            shapeNode.setAttribute('x1', '0'); shapeNode.setAttribute('y1', '100%');
                            shapeNode.setAttribute('x2', '100%'); shapeNode.setAttribute('y2', '0');
                        } else {
                            shapeNode.setAttribute('x1', '0'); shapeNode.setAttribute('y1', '0');
                            shapeNode.setAttribute('x2', '100%'); shapeNode.setAttribute('y2', '100%');
                        }
                    });
                } else {
                    // 既存の四角形リサイズ処理
                    const dx = currentX - startX; const dy = currentY - startY; let newLeft = startRect.left, newTop = startRect.top, newWidth = startRect.width, newHeight = startRect.height;
                    if (currentHandle.includes('e')) newWidth += dx; if (currentHandle.includes('s')) newHeight += dy; 
                    if (currentHandle.includes('w')) { newLeft += dx; newWidth -= dx; } if (currentHandle.includes('n')) { newTop += dy; newHeight -= dy; }

                    // Shiftを押している間は元の縦横比を保つ。
                    // 画像の四隅つまみは、Shift無しでも常に縦横比を保つ（辺の中央つまみは自由変形）。
                    const isImageCorner = target.classList.contains('image-element') && currentHandle.length === 2;
                    if ((e.shiftKey || isImageCorner) && startRect.width > 0 && startRect.height > 0) {
                        const ratio = startRect.width / startRect.height;
                        if (Math.abs(newWidth - startRect.width) >= Math.abs(newHeight - startRect.height)) {
                            newHeight = newWidth / ratio;
                        } else {
                            newWidth = newHeight * ratio;
                        }
                        if (currentHandle.includes('w')) newLeft = startRect.left + startRect.width - newWidth;
                        if (currentHandle.includes('n')) newTop = startRect.top + startRect.height - newHeight;
                    }

                    if (newWidth > 4) { target.style.width = newWidth + 'px'; target.style.left = newLeft + 'px'; }
                    if (newHeight > 4) { target.style.height = newHeight + 'px'; target.style.top = newTop + 'px'; }
                }
            }
        });

        document.addEventListener('pointerup', function(e) {
            if (!action) return;
            let stateChanged = false;
            if (action === 'pan') { action = null; workspaceContainer.classList.remove('panning'); return; }
            
            const rect = workspace.getBoundingClientRect(); let currentX = Math.max(0, Math.min((e.clientX - rect.left) / zoomLevel, workspace.offsetWidth)); let currentY = Math.max(0, Math.min((e.clientY - rect.top) / zoomLevel, workspace.offsetHeight));

            if (action === 'draw_text') {
                drawingBox.style.display = 'none';
                const dragW = parseFloat(drawingBox.style.width);
                const dragH = parseFloat(drawingBox.style.height);
                const isDrag = Math.hypot(dragW, dragH) >= TAP_SLOP;
                // 編集中・選択中だった時のクリックは「編集を終える」ためのもの。新しい箱は作らない
                if (!isDrag && clearedSelectionOnDown) {
                    action = null;
                    updateToolbar();
                    return;
                }
                const boxLeft = isDrag ? parseFloat(drawingBox.style.left) : startX;
                const boxTop = isDrag ? parseFloat(drawingBox.style.top) : startY;
                // ドラッグしたときだけ幅を固定して折り返す
                const boxW = isDrag ? Math.max(dragW, 30) + 'px' : 'max-content';
                const newText = window.createTextElement(
                    boxLeft + 'px', boxTop + 'px', boxW, 'max-content', '',
                    textSizeInput.value + 'px', toolColors['text'], 'left', currentTextDirection);
                // クリック作成は「カーソルの先端＝入力文字（キャレット）の左下」に合わせる
                if (!isDrag) moveTextBottomLeftTo(newText, startX, startY);
                window.deselectCurrent();
                selectedElements = [newText]; newText.classList.add('selected');
                updateToolbar();
                setTimeout(() => { newText.querySelector('.text-content').focus(); }, 10);
                action = null;
                return;
            }

            if (action === 'draw') {
                drawingBox.style.display = 'none';
                drawingBox.style.backgroundColor = ''; // ハイライト用に上書きした色を戻す
                let w = parseFloat(drawingBox.style.width);
                let h = parseFloat(drawingBox.style.height);

                // マスキング矩形はワンクリック（ほぼ動かさず離す）で既定サイズを配置。
                // ただし直前まで何かを選択していた場合、そのクリックは「選択解除」として扱い配置しない
                if (currentTool === 'mask' && Math.hypot(w, h) < TAP_SLOP) {
                    if (!clearedSelectionOnDown) {
                        window.createMaskElement(
                            (startX - DEFAULT_MASK_W / 2) + 'px', (startY - DEFAULT_MASK_H / 2) + 'px',
                            DEFAULT_MASK_W + 'px', DEFAULT_MASK_H + 'px');
                        stateChanged = true;
                    }
                    action = null;
                    if (stateChanged) window.saveState();
                    updateToolbar();
                    return;
                }

                if (Math.hypot(w, h) >= 5) {
                    let left = parseFloat(drawingBox.style.left);
                    let top = parseFloat(drawingBox.style.top);
                    
                    if (w < 4) { w = 4; left -= 2; }
                    if (h < 4) { h = 4; top -= 2; }

                    if (currentTool === 'highlight') {
                        // ハイライトも選択状態にせず、続けて次を置けるようにする
                        const bgColor = hexToRgba(toolColors['highlight'], penOpacityInput.value);
                        window.createHighlightElement(left + 'px', top + 'px', w + 'px', h + 'px', bgColor);
                    } else {
                        // マスキングは選択状態にせず、続けて次を置けるようにする
                        window.createMaskElement(left + 'px', top + 'px', w + 'px', h + 'px');
                    }
                    stateChanged = true;
                }
            } else if (action === 'box_select') {
                selectionBox.style.display = 'none';
                const boxRect = {
                    left: Math.min(startX, currentX),
                    top: Math.min(startY, currentY),
                    right: Math.max(startX, currentX),
                    bottom: Math.max(startY, currentY)
                };

                if (boxRect.right - boxRect.left > TAP_SLOP && boxRect.bottom - boxRect.top > TAP_SLOP) {
                    // Ctrl（⌘）を押しながらの範囲選択は、今の選択を保ったまま足す。
                    // 押していなければ、まず今の選択を消してから選び直す。
                    const additive = e.ctrlKey || e.metaKey;
                    if (!additive) window.deselectCurrent();
                    document.querySelectorAll('.canvas-element').forEach(el => {
                        const elLeft = parseFloat(el.style.left);
                        const elTop = parseFloat(el.style.top);
                        const elRight = elLeft + (parseFloat(el.style.width) || el.offsetWidth);
                        const elBottom = elTop + (parseFloat(el.style.height) || el.offsetHeight);

                        if (elLeft < boxRect.right && elRight > boxRect.left && elTop < boxRect.bottom && elBottom > boxRect.top) {
                            if (!el.classList.contains('selected')) {
                                el.classList.add('selected');
                                selectedElements.push(el);
                            }
                        }
                    });
                    // ペン線（canvasDrawings のストローク）も範囲選択に含める
                    if (!additive) selectedStrokes = [];
                    document.querySelectorAll('.drawing-svg').forEach(svg => {
                        const idx = parseInt(svg.dataset.canvasIndex);
                        const cmds = window.canvasDrawings[idx] || [];
                        cmds.forEach((cmd, i) => {
                            // 選べるのはペン線だけ。消しゴム（古いデータ）や取り込み画像は掴ませない
                            if (cmd.tool !== 'pen' || !cmd.points || !cmd.points.length) return;
                            const bb = strokeWorkspaceBBox({ svg, index: i });
                            if (!bb) return;
                            if (bb.left < boxRect.right && bb.right > boxRect.left && bb.top < boxRect.bottom && bb.bottom > boxRect.top) {
                                if (!selectedStrokes.some(s => s.svg === svg && s.index === i)) {
                                    selectedStrokes.push({ svg, index: i });
                                }
                            }
                        });
                    });
                    renderMultiStrokeSelection();
                    updateToolbar();
                } else if (!(e.ctrlKey || e.metaKey)) {
                    // 何もない所を（修飾なしで）クリックしただけ＝選択を解除する
                    window.deselectCurrent();
                }
            } else if (action === 'draw_shape') {
                if (currentDrawingShape) {
                    let w = parseFloat(currentDrawingShape.style.width);
                    let h = parseFloat(currentDrawingShape.style.height);
                    
                    if (Math.hypot(w, h) >= 5) {
                        // 四角・円は掴めるように最低 4px。直線は 1px のままでよい
                        // （引いた向きを保つ。太さのぶん見た目も当たり判定も足りる）。
                        const minSide = currentDrawingShape.dataset.shapeType === 'line' ? 1 : 4;
                        if (w < minSide) { w = minSide; currentDrawingShape.style.width = minSide + 'px'; currentDrawingShape.style.left = (parseFloat(currentDrawingShape.style.left) - minSide / 2) + 'px'; }
                        if (h < minSide) { h = minSide; currentDrawingShape.style.height = minSide + 'px'; currentDrawingShape.style.top = (parseFloat(currentDrawingShape.style.top) - minSide / 2) + 'px'; }
                        
                        currentDrawingShape.style.pointerEvents = '';
                        window.deselectCurrent(); 
                        selectedElements = [currentDrawingShape]; 
                        currentDrawingShape.classList.add('selected');
                        stateChanged = true;
                    } else {
                        currentDrawingShape.remove();
                    }
                    currentDrawingShape = null;
                }
            } else if (action === 'draw_freehand_mask') {
                if (tempMaskSvg) tempMaskSvg.remove();
                if (penPoints.length > 2) {
                    const pw = parseFloat(penWidthInput.value);
                    const padding = pw / 2 + 2; 
                    let minX = Math.min(...penPoints.map(p => p.x)) - padding;
                    let minY = Math.min(...penPoints.map(p => p.y)) - padding;
                    let maxX = Math.max(...penPoints.map(p => p.x)) + padding;
                    let maxY = Math.max(...penPoints.map(p => p.y)) + padding;
                    let w = maxX - minX;
                    let h = maxY - minY;
                    
                    let d = penPoints.map((p, i) => `${i===0?'M':'L'} ${p.x - minX} ${p.y - minY}`).join(' ');
                    
                    window.createFreehandMaskElement(minX+'px', minY+'px', w+'px', h+'px', d, pw);
                    // マスキングは選択状態にせず、続けて次を描けるようにする
                    stateChanged = true;
                }
                tempMaskSvg = null; tempMaskPath = null;
            } else if (action === 'draw_freehand_highlight') {
                if (tempMaskSvg) tempMaskSvg.remove();
                if (penPoints.length > 2) {
                    const pw = parseFloat(penWidthInput.value);
                    const padding = pw / 2 + 2;
                    let minX = Math.min(...penPoints.map(p => p.x)) - padding;
                    let minY = Math.min(...penPoints.map(p => p.y)) - padding;
                    let maxX = Math.max(...penPoints.map(p => p.x)) + padding;
                    let maxY = Math.max(...penPoints.map(p => p.y)) + padding;
                    let w = maxX - minX;
                    let h = maxY - minY;

                    let d = penPoints.map((p, i) => `${i===0?'M':'L'} ${p.x - minX} ${p.y - minY}`).join(' ');
                    const col = hexToRgba(toolColors['highlight'], penOpacityInput.value);

                    window.createFreehandHighlightElement(minX+'px', minY+'px', w+'px', h+'px', d, pw, col);
                    // 選択状態にせず、続けて次を描けるようにする
                    stateChanged = true;
                }
                tempMaskSvg = null; tempMaskPath = null;
            } else if (action === 'scale_freehand') {
                freehandScale = null;
                stateChanged = true;
            } else if (action === 'scale_stroke') {
                strokeScale = null;
                stateChanged = true;
            } else if (action === 'draw_pen') {
                if (liveStrokePath && liveStrokePath.parentNode) liveStrokePath.parentNode.removeChild(liveStrokePath);
                if (activeDrawSvg && activeCanvasIndex != null) {
                    const idx = parseInt(activeCanvasIndex);
                    const actualTool = document.querySelector('input[name="penMode"]:checked').value;
                    commitPenStroke(idx, actualTool);
                    renderStrokesToSVG(activeDrawSvg, window.canvasDrawings[idx]);
                }
                activeDrawSvg = null; liveStrokePath = null; activeCanvasIndex = null; stateChanged = true;
            }
            else if (action === 'move' || action === 'resize') {
                // 実際に動いた/リサイズされた時だけ履歴に積む（単なる選択クリックで履歴を汚さない）
                const dx = currentX - startX; const dy = currentY - startY;
                const dragged = Math.hypot(dx, dy) >= (TAP_SLOP > 5 ? 6 : 1);
                if (dragged) { stateChanged = true; }
                // 動かさずに離した時：
                else if (action === 'move' && movePressTarget && movePressTarget.isConnected) {
                    // 選択済みテキスト箱の再クリックは編集に入る（クリックした場所にカーソル）
                    if (pressWasSelectedText && movePressTarget.classList.contains('text-wrapper')) {
                        const tc = movePressTarget.querySelector('.text-content');
                        if (tc) placeCaretFromPoint(tc, e.clientX, e.clientY);
                    }
                    // 複数選択中にただクリックしただけなら、その1つだけの選択に絞る
                    else if (selectedElements.length > 1 && !e.ctrlKey && !e.metaKey && !e.shiftKey) {
                        const only = movePressTarget;
                        window.deselectCurrent();
                        only.classList.add('selected');
                        selectedElements = [only];
                    }
                }
            }
            else if (action === 'move_stroke') {
                if (strokeMoveStart) {
                    const cmd = currentStrokeCmd();
                    if (cmd && cmd.points[0] && strokeMoveStart.orig[0]) {
                        const moved = Math.hypot(cmd.points[0].x - strokeMoveStart.orig[0].x, cmd.points[0].y - strokeMoveStart.orig[0].y);
                        if (moved >= 1) stateChanged = true;
                    }
                }
                strokeMoveStart = null;
            }
            
            action = null; movePressTarget = null; pressWasSelectedText = false; penPoints = []; rawPenPoints = []; startRects = []; strokesDrag = null;
            if (stateChanged) window.saveState();
            updateToolbar(); // 選択状態に応じてプロパティ表示を更新
        });
        
        workspaceContainer.addEventListener('pointerleave', () => { brushCursor.style.display = 'none'; textCursor.style.display = 'none'; workspaceContainer.classList.remove('hide-cursor'); });
        
        document.addEventListener('pointerdown', function(e) {
            if (!e.target.closest('#workspace') && !e.target.closest('#app-header') && !e.target.closest('#floating-tools-container') && !e.target.closest('.floating-ui') && !e.target.closest('#btn-focus-mode') && (selectedElements.length > 0 || selectedStroke)) {
                window.deselectCurrent();
            }
        });

        // 画面のテキストDOMと同じフォントスタック。書き出しキャンバスもこれに揃える
        // （素の 'sans-serif' だと端末ごとに別フォントへ解決され、字形も行高も画面とズレるため）。
        const TEXT_FONT_STACK = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';
        // line-height:normal の実測値（px）。端末・フォントで 1.15〜1.5 と変わるので実測してキャッシュ。
        const __lhCache = new Map();
