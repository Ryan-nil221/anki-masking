        // --- 変数定義・初期設定 ---
        const btnSaveMenu = document.getElementById('btn-save-menu');
        const saveDropdownMenu = document.getElementById('save-dropdown-menu');
        
        window.currentFileName = "暗記マスキング";
        window.isMasksHidden = false; 

        // 編集中のファイル名。名前を変えたらヘッダーの表示も一緒に直す
        // （読み込み・復元の経路が3つあるので、代入は必ずここを通す）。
        window.setCurrentFileName = function(name) {
            window.currentFileName = name || window.currentFileName;
            const el = document.getElementById('current-file-name-text');
            if (el) el.innerText = window.currentFileName;
            const box = document.getElementById('current-file-name');
            if (box) box.title = `編集中: ${window.currentFileName}`;
        };
        
        let currentTextDirection = 'horizontal-tb'; 
        
        btnSaveMenu.addEventListener('click', (e) => {
            e.stopPropagation();
            saveDropdownMenu.classList.toggle('show');
        });
        
        document.addEventListener('click', () => {
            saveDropdownMenu.classList.remove('show');
        });

        // --- 狭い画面（compact-ui）のUI集約 ---------------------------------
        // 画面が狭い時だけ body に compact-ui を付ける。CSS側の畳み込みと、
        // 「プロパティ行は設定ボタンで開く」挙動の両方がこのフラグを見る。
        const compactMQ = window.matchMedia('(max-width: 640px), (orientation: landscape) and (max-height: 500px)');
        window.isCompactUI = () => compactMQ.matches;
        // プロパティ行（色・太さ・大きさ）はツールを選んだ時点で開き、
        // 同じツールをもう一度クリックすると閉じる（Rayan様の指示・08-07）。
        // 専用の設定ボタンは廃止（08-06）。起動直後だけは閉じておく。
        let propsOpen = false;
        const applyCompactUI = () => {
            document.body.classList.toggle('compact-ui', compactMQ.matches);
            if (window.__toolbarReady) updateToolbar();
            if (window.updateToolsHeightVar) window.updateToolsHeightVar();
        };
        if (typeof compactMQ.addEventListener === 'function') compactMQ.addEventListener('change', applyCompactUI);
        else compactMQ.addListener(applyCompactUI);
        applyCompactUI();

        // まとめたメニューの項目は、隠した本体のボタン/入力を代理で押す（挙動を二重に書かない）
        const headerMenu = document.getElementById('header-dropdown-menu');
        const toolMoreMenu = document.getElementById('tool-more-menu');
        [headerMenu, toolMoreMenu].forEach(menu => {
            if (!menu) return;
            menu.addEventListener('click', (e) => {
                const li = e.target.closest('li[data-proxy]');
                if (!li || li.classList.contains('is-disabled')) return;
                const target = document.getElementById(li.dataset.proxy);
                menu.classList.remove('show');
                if (target && !target.disabled) target.click();
            });
        });
        const wireMenuButton = (btnId, menu) => {
            const btn = document.getElementById(btnId);
            if (!btn || !menu) return;
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasOpen = menu.classList.contains('show');
                document.querySelectorAll('.dropdown-menu.show').forEach(m => m.classList.remove('show'));
                if (!wasOpen) menu.classList.add('show');
            });
            document.addEventListener('click', () => menu.classList.remove('show'));
        };
        wireMenuButton('btn-header-menu', headerMenu);
        wireMenuButton('btn-tool-more', toolMoreMenu);

        const setPropsOpen = (open) => {
            if (propsOpen === open) return;
            propsOpen = open;
            if (window.__toolbarReady) updateToolbar();
            if (window.updateToolsHeightVar) window.updateToolsHeightVar();
        };
        window.isPropsOpen = () => propsOpen;
        window.closeProps = () => setPropsOpen(false);
        window.openProps = () => setPropsOpen(true);
        window.toggleProps = () => setPropsOpen(!propsOpen);

        // CDN(pdf.js)が読み込めなくても他機能（画像モード等）は動くようガード
        if (typeof pdfjsLib !== 'undefined') {
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        } else {
            console.error('pdf.js の読み込みに失敗しました（PDF機能は利用できません）');
        }

        // 解像度のベーススケール。遅延再描画の最大倍率を考慮し、上限を設けます。
        const RENDER_SCALE = Math.min(window.devicePixelRatio || 2, 2.0); 
        
        window.globalZIndex = 10;
        window.bringToFront = function(element) {
            if (!element) return;
            window.globalZIndex++;
            element.style.zIndex = window.globalZIndex;
        };

        const imageInput = document.getElementById('imageInput');
        const projectInput = document.getElementById('projectInput');
        const uploadedImage = document.getElementById('uploaded-image');
        const pdfContainer = document.getElementById('pdf-container');
        const workspaceContainer = document.getElementById('workspace-container');
        const workspaceWrapper = document.getElementById('workspace-wrapper');
        const workspace = document.getElementById('workspace');
        const drawingBox = document.getElementById('drawing-box');
        const selectionBox = document.getElementById('selection-box');
        const zoomText = document.getElementById('zoom-text');
        const brushCursor = document.getElementById('brush-cursor');
        const textCursor = document.getElementById('text-cursor');
        const loadingOverlay = document.getElementById('loading-overlay');
        // 読み込み中オーバーレイの補足行。要素の並び順ではなくidで指す
        function setLoadingDetail(text) {
            const el = document.getElementById('loading-detail');
            if (el) el.innerText = text;
        }

        const pdfSidebar = document.getElementById('pdf-sidebar');
        const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
        const pageNavigation = document.getElementById('page-navigation');
        const pageInput = document.getElementById('page-input');
        const pageTotal = document.getElementById('page-total');
        
        const toolRadios = document.querySelectorAll('input[name="currentTool"]');
        const maskTypeRadios = document.querySelectorAll('input[name="maskType"]');
        const shapeTypeRadios = document.querySelectorAll('input[name="shapeType"]');
        const penModeRadios = document.querySelectorAll('input[name="penMode"]'); 

        const textSizeInput = document.getElementById('text-size-input'); 
        const penWidthSlider = document.getElementById('pen-width-slider'); 
        const penWidthInput = document.getElementById('pen-width-input'); 
        const penOpacityInput = document.getElementById('pen-opacity');

        // 直前のポインターダウンが「選択解除」を伴ったか（マスキングの空きクリック判定に使う）
        let clearedSelectionOnDown = false;
        let pressWasSelectedText = false; // 選択済みテキストの再クリック（離した時に編集へ入る）
        // 移動のために掴んだ要素（動かさず離した時に、その1つだけの選択へ絞るのに使う）
        let movePressTarget = null;
        // 手書き線の端をドラッグして拡大・縮小するときの情報
        let freehandScale = null;
        let strokeScale = null;

        // マスキング矩形をワンクリックで置いたときの既定サイズ（ワークスペース座標＝ズーム非依存）
        const DEFAULT_MASK_W = 120;
        const DEFAULT_MASK_H = 28;

        const customSwatch = document.getElementById('custom-color-swatch');
        const nativeColorPicker = document.getElementById('native-color-picker');
        const maskRevealToggle = document.getElementById('mask-reveal-toggle');
        const maskRevealIcon = document.getElementById('mask-reveal-icon');

        let currentTool = 'mask'; 
        let action = null; 
        let selectedElements = []; 
        let startRects = []; 
        let currentHandle = null; 
        let startX = 0, startY = 0;
        let startRect = {}; 
        let zoomLevel = 1.0; 
        let zoomTimeout = null; 
        
        window.historyArray = [];
        window.historyIndex = -1;
        let savedSelectionRange = null; 
        
        let penPoints = [];
        let rawPenPoints = []; 
        let totalPdfPages = 0;

        let activeCanvasIndex = null;
        let activeDrawSvg = null;   // 現在描画中のSVGレイヤー
        let liveStrokePath = null;  // ドラッグ中のプレビュー用path
        let selectedStroke = null;  // 選択中のペン線 { svg, index }
        let selectedStrokes = [];   // 範囲選択で選んだペン線の集合 [{ svg, index }]
        let strokesDrag = null;     // 一括移動の最中に控える元の点
        let strokeMoveStart = null; // ペン線ドラッグ開始情報
        
        let tempMaskSvg = null;
        let tempMaskPath = null;
        let tempPathD = "";
        
        let currentDrawingShape = null; 

        window.canvasDrawings = []; 
        let currentBackground = null;

        const toolColors = { text: '#ef4444', highlight: '#ffff00', pen: '#ef4444', shape: '#ef4444' };
        
        // 【改修】図形のデフォルトの太さを2pxに変更
        const toolWidths = { pen: 15, eraser: 30, mask: 15, shape: 2, highlight: 20 };

        // ハイライトの形状モード（四角形 / 手書き）
        function currentHighlightType() {
            const r = document.querySelector('input[name="highlightType"]:checked');
            return r ? r.value : 'rect';
        }

        // 下部ツールバーの実際の高さを CSS 変数に流す。
        // 狭い画面では学習モードボタンとズームUIをこの高さのぶん上へ逃がし、重なりを防ぐ。
        (function trackToolsHeight() {
            const tools = document.getElementById('floating-tools-container');
            const bottomRight = document.getElementById('floating-bottom-right');
            const apply = () => {
                if (tools) {
                    const h = Math.round(tools.getBoundingClientRect().height);
                    if (h > 0) document.documentElement.style.setProperty('--tools-h', h + 'px');
                }
                if (bottomRight) {
                    const h = Math.round(bottomRight.getBoundingClientRect().height);
                    if (h > 0) document.documentElement.style.setProperty('--br-h', h + 'px');
                }
                // ツールバーとズームUIが横方向で重なるなら段積みにする。
                // 横位置は段積みしても変わらないので、この判定は行ったり来たりしない。
                const sw = document.querySelector('.tool-switch');
                if (sw && bottomRight) {
                    const t = sw.getBoundingClientRect();
                    const b = bottomRight.getBoundingClientRect();
                    if (t.width > 0 && b.width > 0) {
                        document.body.classList.toggle('bottom-stacked', t.right + 12 > b.left);
                    }
                }

                // --- ここから下は「ツールバーが左に縦置き」の時だけの位置合わせ ---
                const wide = !document.body.classList.contains('compact-ui');
                const outer = document.getElementById('workspace-outer');
                const props = document.getElementById('floating-properties');
                const eye = document.getElementById('btn-focus-mode');

                // 設定行の縦中央を、今選んでいるツールのアイコンに合わせる（Rayan様の指示・08-06）。
                // 画面の上下からはみ出す時は、はみ出さない位置まで寄せて止める。
                if (props) {
                    const active = document.querySelector('.tool-switch input[name="currentTool"]:checked');
                    const label = active ? document.querySelector('.tool-switch label[for="' + active.id + '"]') : null;
                    const open = wide && props.style.display !== 'none' && label && outer && tools;
                    if (open) {
                        const lr = label.getBoundingClientRect();
                        const half = props.getBoundingClientRect().height / 2;
                        const or = outer.getBoundingClientRect();
                        const cr = tools.getBoundingClientRect();
                        let cy = lr.top + lr.height / 2;
                        const lo = or.top + 12 + half, hi = or.bottom - 12 - half;
                        if (hi >= lo) cy = Math.min(Math.max(cy, lo), hi);
                        props.style.setProperty('--props-top', Math.round(cy - cr.top) + 'px');
                    } else {
                        props.style.removeProperty('--props-top');
                    }
                }

                // 学習モード（目玉）は、ページ一覧ボタン・ツールバーと同じ縦の軸に乗せる。
                // ただし画面が低いと縦バーの下端が目玉の高さまで下りてきて重なる。
                // その時だけ、縦バーの右隣へ逃がす（重なって押せなくなるよりはまし）。
                if (eye) {
                    if (wide && sw && outer) {
                        const t = sw.getBoundingClientRect();
                        const o = outer.getBoundingClientRect();
                        if (t.width > 0) {
                            const gap = (o.bottom - t.bottom) - 30 - eye.offsetHeight; // 縦バーの下端と目玉の隙間
                            const cx = gap >= 10
                                ? t.left - o.left + t.width / 2        // 同じ軸に乗せる（既定）
                                : t.right - o.left + 12 + eye.offsetWidth / 2; // 右へ逃がす（低い画面）
                            eye.style.setProperty('--rail-cx', Math.round(cx) + 'px');
                        }
                    } else {
                        eye.style.removeProperty('--rail-cx');
                    }
                }
            };
            apply();
            if (typeof ResizeObserver === 'function') {
                const ro = new ResizeObserver(apply);
                if (tools) ro.observe(tools);
                if (bottomRight) ro.observe(bottomRight);
                // 設定行そのものも見る。選択の中身でどの項目が出るかが変わり、
                // 高さが変わると「アイコンの真横」がずれる（位置を動かすだけなので堂々巡りはしない）
                const propsEl = document.getElementById('floating-properties');
                if (propsEl) ro.observe(propsEl);
                // 作業領域そのものも見る。ページ一覧を開くと幅が縮んでツールバーと
                // ズームUIが重なるが、UI自身の大きさは変わらないので気づけなかった。
                const outer = document.getElementById('workspace-outer');
                if (outer) ro.observe(outer);
            }
            window.addEventListener('resize', apply);
            window.updateToolsHeightVar = apply;
        })();

        // タップでめくった黒塗りを全て元に戻す（モードや一括表示を切り替える時に呼ぶ）
        function clearRevealedMasks() {
            document.querySelectorAll('.mask.revealed').forEach(el => el.classList.remove('revealed'));
        }
        window.clearRevealedMasks = clearRevealedMasks;

        document.getElementById('btn-focus-mode').addEventListener('click', function() {
            clearRevealedMasks(); // めくった状態を持ち越さない
            document.body.classList.toggle('focus-mode');
            const icon = this.querySelector('.material-symbols-outlined');
            if (document.body.classList.contains('focus-mode')) {
                icon.innerText = 'visibility_off';
                this.title = '学習モードを終了';
                window.deselectCurrent(); // 選択を解除して閲覧専用に
            } else {
                icon.innerText = 'visibility';
                this.title = '学習モード（閲覧のみ）';
            }
        });
        
        function setMasksHidden(hidden) {
            window.isMasksHidden = hidden;
            clearRevealedMasks(); // 一括表示に戻した時、めくった分だけ消えたままにしない
            workspaceContainer.classList.toggle('masks-hidden', hidden);
            // 書き出しなど別の場所から切り替わった時も、スイッチの見た目を合わせる
            if (maskRevealToggle) maskRevealToggle.checked = !hidden;
            if (maskRevealIcon) maskRevealIcon.innerText = hidden ? 'toggle_off' : 'toggle_on';
        }
        if (maskRevealToggle) {
            maskRevealToggle.addEventListener('change', () => setMasksHidden(!maskRevealToggle.checked));
        }

        function hexToRgba(hex, alpha) {
            const r = parseInt(hex.slice(1, 3), 16); const g = parseInt(hex.slice(3, 5), 16); const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
        // 既存の色（#hex / rgb / rgba）の色相を保ったまま不透明度(alpha)だけ差し替える
        function setAlpha(color, alpha) {
            if (!color) return `rgba(0, 0, 0, ${alpha})`;
            color = color.trim();
            if (/^#[0-9a-f]{6}$/i.test(color)) return hexToRgba(color, alpha);
            if (/^#[0-9a-f]{3}$/i.test(color)) { const h = color.slice(1); return hexToRgba('#' + h[0]+h[0] + h[1]+h[1] + h[2]+h[2], alpha); }
            const m = color.match(/rgba?\(([^)]+)\)/i);
            if (m) { const p = m[1].split(',').map(s => s.trim()); return `rgba(${p[0]}, ${p[1]}, ${p[2]}, ${alpha})`; }
            return color;
        }
        // 履歴の残量に応じて undo/redo ボタンの有効・無効を切り替える
        function updateHistoryButtons() {
            const u = document.getElementById('btn-undo');
            const r = document.getElementById('btn-redo');
            if (u) u.disabled = !(window.historyIndex > 0);
            if (r) r.disabled = !(window.historyIndex < window.historyArray.length - 1);
        }
        window.updateHistoryButtons = updateHistoryButtons;

        document.addEventListener('contextmenu', function(e) {
            if (e.target.closest('#workspace-container')) {
                if (e.target.tagName.toLowerCase() !== 'span' && !e.target.closest('.textLayer')) { e.preventDefault(); }
            }
        });

        // 進行中の操作(action)を安全に畳む。pointercancel と、ウィンドウの
        // フォーカス喪失(blur)の両方から呼ぶ。blur を拾わないと、ブラウザ窓の外で
        // ポインタを離した時に pointerup が届かず、状態機械が固まっていた（08-02 修正）。
        function abortCurrentAction() {
            if (!action) return;
            if (action === 'draw_pen' && activeDrawSvg) {
                if (liveStrokePath && liveStrokePath.parentNode) liveStrokePath.parentNode.removeChild(liveStrokePath);
                if (activeCanvasIndex != null) {
                    const idx = parseInt(activeCanvasIndex);
                    const actualTool = document.querySelector('input[name="penMode"]:checked').value;
                    commitPenStroke(idx, actualTool);
                    renderStrokesToSVG(activeDrawSvg, window.canvasDrawings[idx]);
                }
                window.saveState();
            } else if ((action === 'draw_freehand_mask' || action === 'draw_freehand_highlight') && tempMaskSvg) {
                tempMaskSvg.remove();
            } else if (action === 'draw_shape' && currentDrawingShape) {
                currentDrawingShape.remove();
            } else if (action === 'pan') {
                workspaceContainer.classList.remove('panning');
            }
            // どの action でも共通で転がっている一時状態を確実に戻す
            if (liveStrokePath && liveStrokePath.parentNode) liveStrokePath.parentNode.removeChild(liveStrokePath);
            drawingBox.style.display = 'none'; drawingBox.style.backgroundColor = '';
            if (typeof selectionBox !== 'undefined' && selectionBox) selectionBox.style.display = 'none';
            action = null; penPoints = []; rawPenPoints = []; startRects = []; strokesDrag = null;
            movePressTarget = null; pressWasSelectedText = false;
            freehandScale = null; strokeScale = null; strokeMoveStart = null;
            activeCanvasIndex = null; activeDrawSvg = null;
            liveStrokePath = null; tempMaskSvg = null; tempMaskPath = null; currentDrawingShape = null;
        }
        // ウィンドウのフォーカスが外れたら、触っている指の記録も捨てる（固着防止）
        window.addEventListener('blur', function () {
            if (typeof activeTouches !== 'undefined') {
                activeTouches.clear(); touchGesture = null; touchGestureActive = false;
                focusTapMask = null; focusTapStart = null;
            }
        });
        document.addEventListener('pointercancel', abortCurrentAction);
        window.addEventListener('blur', abortCurrentAction);

        document.addEventListener('selectionchange', () => {
            const sel = window.getSelection(); 
            const singleSelected = selectedElements[0];
            if (sel.rangeCount > 0 && singleSelected && singleSelected.contains(sel.anchorNode)) {
                savedSelectionRange = sel.getRangeAt(0).cloneRange(); 
            }
        });

        document.addEventListener('keydown', function(e) {
            if ((e.key === 'Delete' || e.key === 'Backspace') && (selectedElements.length > 0 || selectedStroke || selectedStrokes.length)) {
                if (!e.target.classList.contains('text-content') && e.target.tagName.toLowerCase() !== 'input') {
                    if (selectedStroke) { deleteSelectedStroke(); }
                    else {
                        let changed = false;
                        if (selectedElements.length) { selectedElements.forEach(el => el.remove()); changed = true; }
                        if (selectedStrokes.length) { deleteMultiStrokes(); changed = true; }
                        window.deselectCurrent();
                        if (changed) window.saveState();
                    }
                    e.preventDefault();
                }
            }
            const isTyping = e.target.tagName.toLowerCase() === 'input' || e.target.tagName.toLowerCase() === 'textarea' || e.target.isContentEditable || e.target.classList.contains('text-content');
            if (!isTyping) {
                const cmdOrCtrl = e.metaKey || e.ctrlKey;
                if (cmdOrCtrl) {
                    if (e.key.toLowerCase() === 'z') {
                        e.preventDefault();
                        if (e.shiftKey) { document.getElementById('btn-redo').click(); } 
                        else { document.getElementById('btn-undo').click(); }
                    } else if (e.key.toLowerCase() === 'y') {
                        e.preventDefault(); document.getElementById('btn-redo').click();
                    }
                }
            }
        });

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
        
        // ===== 手描きレイヤー（ベクターSVG） =====
        const SVGNS = 'http://www.w3.org/2000/svg';
        let drawSvgUid = 0;

        // 座標配列から、canvas描画と同じ曲線ロジックでSVGパス文字列を生成
        function strokePathD(pts) {
            if (!pts || pts.length === 0) return '';
            if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y} L ${pts[0].x + 0.01} ${pts[0].y + 0.01}`;
            let d = `M ${pts[0].x} ${pts[0].y}`;
            if (pts.length < 3) {
                d += ` L ${pts[1].x} ${pts[1].y}`;
            } else {
                for (let i = 1; i < pts.length - 1; i++) {
                    const midX = (pts[i].x + pts[i + 1].x) / 2;
                    const midY = (pts[i].y + pts[i + 1].y) / 2;
                    d += ` Q ${pts[i].x} ${pts[i].y} ${midX} ${midY}`;
                }
                d += ` L ${pts[pts.length - 1].x} ${pts[pts.length - 1].y}`;
            }
            return d;
        }

        // ドラッグ中は点が増えるたびに全点からパスを作り直すと点の数の2乗で重くなる。
        // 末尾の "L 最後の点" を除いた部分を持ち回り、増えたぶんだけ継ぎ足す。
        let livePathPrefix = '';
        function livePathStart(p) {
            livePathPrefix = `M ${p.x} ${p.y}`;
            return strokePathD([p]);
        }
        // pts は追加後の配列（末尾が新しい点）
        function livePathAppend(pts) {
            const n = pts.length;
            const p = pts[n - 1];
            if (n >= 3) {
                const q = pts[n - 2];
                livePathPrefix += ` Q ${q.x} ${q.y} ${(q.x + p.x) / 2} ${(q.y + p.y) / 2}`;
            }
            return `${livePathPrefix} L ${p.x} ${p.y}`;
        }

        // 手描きSVGレイヤーを生成（viewBoxはページのCSS座標系）
        function createDrawSVG(vw, vh) {
            const svg = document.createElementNS(SVGNS, 'svg');
            svg.setAttribute('class', 'drawing-svg');
            svg.setAttribute('viewBox', `0 0 ${vw} ${vh}`);
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.dataset.uid = (drawSvgUid++);
            return svg;
        }

        // コマンド列からSVGを再構築。消しゴムは時系列マスクで扱い、
        // 「消した後に引いた線は消えない」というラスターと同じ挙動を保つ。
        function renderStrokesToSVG(svg, cmds) {
            if (!svg) return;
            while (svg.firstChild) svg.removeChild(svg.firstChild);
            const vb = svg.viewBox.baseVal;
            const vw = vb.width, vh = vb.height;
            const defs = document.createElementNS(SVGNS, 'defs');
            svg.appendChild(defs);
            const uid = svg.dataset.uid;

            const layers = [];
            let layerCount = 0;
            function addLayer() {
                const maskId = `dm-${uid}-${layerCount++}`;
                const mask = document.createElementNS(SVGNS, 'mask');
                mask.setAttribute('id', maskId);
                mask.setAttribute('maskUnits', 'userSpaceOnUse');
                mask.setAttribute('x', 0); mask.setAttribute('y', 0);
                mask.setAttribute('width', vw); mask.setAttribute('height', vh);
                const base = document.createElementNS(SVGNS, 'rect');
                base.setAttribute('x', 0); base.setAttribute('y', 0);
                base.setAttribute('width', vw); base.setAttribute('height', vh);
                base.setAttribute('fill', 'white');
                mask.appendChild(base);
                defs.appendChild(mask);
                const g = document.createElementNS(SVGNS, 'g');
                g.setAttribute('mask', `url(#${maskId})`);
                svg.appendChild(g);
                const layer = { g, mask };
                layers.push(layer);
                return layer;
            }
            let current = addLayer();

            function makePath(d, w, stroke, opacity) {
                const p = document.createElementNS(SVGNS, 'path');
                p.setAttribute('d', d);
                p.setAttribute('fill', 'none');
                p.setAttribute('stroke-linecap', 'round');
                p.setAttribute('stroke-linejoin', 'round');
                p.setAttribute('stroke-width', w);
                p.setAttribute('stroke', stroke);
                if (opacity != null) p.setAttribute('stroke-opacity', opacity);
                return p;
            }

            (cmds || []).forEach(cmd => {
                if (cmd.tool === 'legacy_base64') {
                    const img = document.createElementNS(SVGNS, 'image');
                    img.setAttribute('href', cmd.dataURL);
                    img.setAttributeNS('http://www.w3.org/1999/xlink', 'href', cmd.dataURL);
                    img.setAttribute('x', 0); img.setAttribute('y', 0);
                    img.setAttribute('width', vw); img.setAttribute('height', vh);
                    img.setAttribute('preserveAspectRatio', 'none');
                    current.g.appendChild(img);
                    return;
                }
                if (!cmd.points || cmd.points.length === 0) return;
                const d = strokePathD(cmd.points);
                if (cmd.tool === 'pen') {
                    current.g.appendChild(makePath(d, cmd.width, cmd.color, cmd.opacity));
                } else {
                    // 消しゴム：既存の全レイヤーを黒で削り、以後の描画は新レイヤーへ
                    layers.forEach(layer => layer.mask.appendChild(makePath(d, cmd.width, 'black', 1)));
                    current = addLayer();
                }
            });
        }

        // ===== 消しゴム：その場でペン線を切る（消しゴムの跡を残さない） =====
        // 消しゴムを「命令」として残す作りだと3つの実害が出た：
        //   ①消した線を後で動かすと、切り跡が置き去りになって線が丸ごと復活する
        //   ②消しゴムが通った場所に新しく引いた線まで切れて見える
        //   ③範囲選択で「見えない消しゴムの線」まで選べてしまう
        // なので消した時点でペン線の点列そのものを切り分け、消しゴムは何も残さない。
        // （古い .amk に入っている eraser 命令は renderStrokesToSVG 側で従来どおり描ける）
        function densifyPoints(pts, maxGap) {
            if (!pts || pts.length < 2) return (pts || []).slice();
            const out = [pts[0]];
            for (let i = 1; i < pts.length; i++) {
                const a = pts[i - 1], b = pts[i];
                const n = Math.floor(Math.hypot(b.x - a.x, b.y - a.y) / maxGap);
                for (let k = 1; k <= n; k++) {
                    const t = k / (n + 1);
                    out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
                }
                out.push(b);
            }
            return out;
        }
        function distToPolyline(p, pts) {
            if (!pts || !pts.length) return Infinity;
            if (pts.length === 1) return Math.hypot(p.x - pts[0].x, p.y - pts[0].y);
            let m = Infinity;
            for (let i = 0; i < pts.length - 1; i++) {
                m = Math.min(m, distToSeg(p.x, p.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y));
            }
            return m;
        }
        function pointsBBox(pts, pad) {
            let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
            pts.forEach(p => { l = Math.min(l, p.x); t = Math.min(t, p.y); r = Math.max(r, p.x); b = Math.max(b, p.y); });
            return { left: l - pad, top: t - pad, right: r + pad, bottom: b + pad };
        }
        function bboxOverlap(a, b) {
            return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;
        }
        // 判定用に増やした点をそのまま残すとデータが膨らむので、見た目を変えない範囲で間引く
        function simplifyPoints(pts, eps) {
            if (pts.length < 3) return pts;
            let maxD = -1, maxI = 0;
            const a = pts[0], b = pts[pts.length - 1];
            for (let i = 1; i < pts.length - 1; i++) {
                const d = distToSeg(pts[i].x, pts[i].y, a.x, a.y, b.x, b.y);
                if (d > maxD) { maxD = d; maxI = i; }
            }
            if (maxD <= eps) return [a, b];
            const left = simplifyPoints(pts.slice(0, maxI + 1), eps);
            const right = simplifyPoints(pts.slice(maxI), eps);
            return left.slice(0, -1).concat(right);
        }
        // 1本のペン線を消しゴムの通り道で切り、残った断片の命令を返す
        function splitStrokeByEraser(cmd, eraserPts, radius) {
            const pts = densifyPoints(cmd.points, 2);
            const segs = [];
            let run = [];
            pts.forEach(p => {
                if (distToPolyline(p, eraserPts) > radius) run.push(p);
                else { if (run.length) segs.push(run); run = []; }
            });
            if (run.length) segs.push(run);
            const wasDot = cmd.points.length === 1;
            return segs
                .filter(seg => seg.length >= 2 || wasDot)   // 1点だけの断片は消し残りのゴミになるので捨てる
                .map(seg => Object.assign({}, cmd, { points: simplifyPoints(seg, 0.35) }));
        }
        function applyEraser(idx, eraserPts, radius) {
            const cmds = window.canvasDrawings[idx] || [];
            // 画像として取り込んだ古い手描きが混じっている時だけ、従来のマスク方式へ退避する
            // （画像は幾何的に切れないため）
            if (cmds.some(c => c.tool === 'legacy_base64')) {
                cmds.push({ tool: 'eraser', points: eraserPts, width: radius * 2 });
                window.canvasDrawings[idx] = cmds;
                return;
            }
            const eb = pointsBBox(eraserPts, radius);
            const next = [];
            cmds.forEach(cmd => {
                if (cmd.tool !== 'pen' || !cmd.points || !cmd.points.length) { next.push(cmd); return; }
                const cb = pointsBBox(cmd.points, (parseFloat(cmd.width) || 1) / 2);
                if (!bboxOverlap(cb, eb)) { next.push(cmd); return; }
                next.push(...splitStrokeByEraser(cmd, eraserPts, radius));
            });
            window.canvasDrawings[idx] = next;
        }
        // 引き終わった1本を確定する（ペンは足す、消しゴムは切る）
        function commitPenStroke(idx, actualTool) {
            if (!window.canvasDrawings[idx]) window.canvasDrawings[idx] = [];
            if (actualTool === 'eraser') {
                if (rawPenPoints.length) applyEraser(idx, rawPenPoints, parseFloat(penWidthInput.value) / 2);
                // 番号がずれるので、線の選択は畳んでおく
                if (typeof deselectStroke === 'function') deselectStroke();
                if (typeof clearMultiStrokeSelection === 'function') clearMultiStrokeSelection();
            } else {
                window.canvasDrawings[idx].push({
                    tool: actualTool,
                    points: rawPenPoints,
                    width: parseFloat(penWidthInput.value),
                    color: toolColors['pen'],
                    opacity: penOpacityInput.value
                });
            }
        }

        // ===== ペン線の選択（JSによる距離判定。消しゴムの部分削りは不変） =====
        function eventToSvgLocal(svg, e) {
            const rect = svg.getBoundingClientRect();
            const vb = svg.viewBox.baseVal;
            const sx = rect.width ? vb.width / rect.width : 1;
            const sy = rect.height ? vb.height / rect.height : 1;
            return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
        }
        function distToSeg(px, py, ax, ay, bx, by) {
            const dx = bx - ax, dy = by - ay;
            const len2 = dx * dx + dy * dy;
            let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
            t = Math.max(0, Math.min(1, t));
            const cx = ax + t * dx, cy = ay + t * dy;
            return Math.hypot(px - cx, py - cy);
        }
        // クリック位置にあるペン線を探す（上に描いた線を優先）
        function findStrokeAt(e) {
            const page = e.target.closest('.pdf-page');
            const svg = page ? page.querySelector('.drawing-svg') : workspace.querySelector('.drawing-svg');
            if (!svg) return null;
            const loc = eventToSvgLocal(svg, e);
            const idx = parseInt(svg.dataset.canvasIndex);
            const cmds = window.canvasDrawings[idx] || [];
            for (let i = cmds.length - 1; i >= 0; i--) {
                const cmd = cmds[i];
                if (cmd.tool !== 'pen' || !cmd.points || !cmd.points.length) continue;
                const thresh = (parseFloat(cmd.width) || 4) / 2 + 6;
                let hit = false;
                if (cmd.points.length === 1) {
                    const p = cmd.points[0];
                    if (Math.hypot(loc.x - p.x, loc.y - p.y) <= thresh) hit = true;
                } else {
                    for (let j = 0; j < cmd.points.length - 1; j++) {
                        if (distToSeg(loc.x, loc.y, cmd.points[j].x, cmd.points[j].y, cmd.points[j + 1].x, cmd.points[j + 1].y) <= thresh) { hit = true; break; }
                    }
                }
                if (hit) return { svg, index: i };
            }
            return null;
        }
        function currentStrokeCmd() {
            if (!selectedStroke) return null;
            const idx = parseInt(selectedStroke.svg.dataset.canvasIndex);
            return (window.canvasDrawings[idx] || [])[selectedStroke.index] || null;
        }
        function clearStrokeHighlight() {
            document.querySelectorAll('.stroke-sel-box, .stroke-center, .stroke-handle').forEach(n => n.remove());
        }
        // 選択中のペン線には、中心線と両端のつまみを出す（外接四角形は出さない）
        function showStrokeHighlight() {
            clearStrokeHighlight();
            const cmd = currentStrokeCmd();
            if (!cmd || !cmd.points || !cmd.points.length) return;
            const svg = selectedStroke.svg;

            const center = document.createElementNS(SVGNS, 'path');
            center.setAttribute('class', 'stroke-center');
            center.setAttribute('d', cmd.points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' '));
            center.setAttribute('fill', 'none');
            center.setAttribute('stroke', centerLineColorFor(hexToRgba(cmd.color || '#000000', cmd.opacity === undefined ? 1 : cmd.opacity)));
            center.setAttribute('stroke-width', '1');
            center.setAttribute('vector-effect', 'non-scaling-stroke');
            center.setAttribute('pointer-events', 'none');
            svg.appendChild(center);

            // つまみの見た目の大きさを画面上で一定に保つ
            const rect = svg.getBoundingClientRect();
            const vb = svg.viewBox.baseVal;
            const unit = rect.width ? vb.width / rect.width : 1;
            const ends = [{ pos: 'start', p: cmd.points[0] }, { pos: 'end', p: cmd.points[cmd.points.length - 1] }];
            ends.forEach(({ pos, p }) => {
                const c = document.createElementNS(SVGNS, 'circle');
                c.setAttribute('class', 'stroke-handle');
                c.dataset.end = pos;
                c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
                c.setAttribute('r', 2.5 * unit);
                c.setAttribute('fill', '#ffffff');
                c.setAttribute('stroke', '#3b82f6');
                c.setAttribute('stroke-width', '1');
                c.setAttribute('vector-effect', 'non-scaling-stroke');
                c.style.pointerEvents = 'auto';
                c.style.cursor = 'crosshair';
                svg.appendChild(c);
            });
        }
        function selectStroke(hit) {
            window.deselectCurrent();
            selectedStroke = hit;
            showStrokeHighlight();
            updateToolbar();
        }
        function deselectStroke() {
            selectedStroke = null;
            clearStrokeHighlight();
        }
        function reRenderStrokeSvg() {
            if (!selectedStroke) return;
            const idx = parseInt(selectedStroke.svg.dataset.canvasIndex);
            renderStrokesToSVG(selectedStroke.svg, window.canvasDrawings[idx] || []);
            showStrokeHighlight();
        }
        function deleteSelectedStroke() {
            if (!selectedStroke) return false;
            const idx = parseInt(selectedStroke.svg.dataset.canvasIndex);
            const cmds = window.canvasDrawings[idx];
            if (cmds && selectedStroke.index < cmds.length) cmds.splice(selectedStroke.index, 1);
            const svg = selectedStroke.svg;
            deselectStroke();
            renderStrokesToSVG(svg, window.canvasDrawings[idx] || []);
            window.saveState();
            return true;
        }
        // ===== ペン線の範囲選択（box_select で複数のストロークをまとめて選ぶ） =====
        // 1本のストロークの外接矩形を workspace 座標（ズーム前）で返す
        function strokeWorkspaceBBox(sel) {
            const idx = parseInt(sel.svg.dataset.canvasIndex);
            const cmd = (window.canvasDrawings[idx] || [])[sel.index];
            if (!cmd || !cmd.points || !cmd.points.length) return null;
            const xs = cmd.points.map(p => p.x), ys = cmd.points.map(p => p.y);
            const pad = (cmd.width || 2) / 2 + 3;
            const wsRect = workspace.getBoundingClientRect();
            const sRect = sel.svg.getBoundingClientRect();
            const z = zoomLevel || 1;
            const offX = (sRect.left - wsRect.left) / z;
            const offY = (sRect.top - wsRect.top) / z;
            const minX = Math.min(...xs), maxX = Math.max(...xs);
            const minY = Math.min(...ys), maxY = Math.max(...ys);
            return { left: minX + offX - pad, top: minY + offY - pad, right: maxX + offX + pad, bottom: maxY + offY + pad };
        }
        function clearMultiStrokeSelection() {
            document.querySelectorAll('.stroke-multi-sel').forEach(n => n.remove());
            selectedStrokes = [];
        }
        function renderMultiStrokeSelection() {
            document.querySelectorAll('.stroke-multi-sel').forEach(n => n.remove());
            selectedStrokes.forEach(sel => {
                const bb = strokeWorkspaceBBox(sel);
                if (!bb) return;
                const box = document.createElement('div');
                box.className = 'stroke-multi-sel';
                box.style.left = bb.left + 'px';
                box.style.top = bb.top + 'px';
                box.style.width = (bb.right - bb.left) + 'px';
                box.style.height = (bb.bottom - bb.top) + 'px';
                workspace.appendChild(box);
            });
        }
        // 範囲選択した線をまとめて動かすための下ごしらえ。
        // 今の点を控えておき、ドラッグ中は「控え＋ずれ」で置き直す。
        function beginStrokesDrag() {
            if (!selectedStrokes.length) return null;
            const items = [];
            selectedStrokes.forEach(s => {
                const idx = parseInt(s.svg.dataset.canvasIndex);
                const cmd = (window.canvasDrawings[idx] || [])[s.index];
                if (cmd && cmd.points) items.push({ svg: s.svg, cmd, orig: cmd.points.map(p => ({ ...p })) });
            });
            return items.length ? items : null;
        }
        function applyStrokesDrag(items, dx, dy) {
            const svgs = new Set();
            items.forEach(it => {
                it.cmd.points = it.orig.map(p => ({ x: p.x + dx, y: p.y + dy }));
                svgs.add(it.svg);
            });
            svgs.forEach(svg => {
                const idx = parseInt(svg.dataset.canvasIndex);
                renderStrokesToSVG(svg, window.canvasDrawings[idx] || []);
            });
            renderMultiStrokeSelection();
        }
        // 押した場所が、範囲選択した線の囲みの中か
        function insideSelectedStrokes(x, y) {
            return selectedStrokes.some(s => {
                const bb = strokeWorkspaceBBox(s);
                return bb && x >= bb.left && x <= bb.right && y >= bb.top && y <= bb.bottom;
            });
        }
        function deleteMultiStrokes() {
            if (!selectedStrokes.length) return false;
            const bySvg = new Map();
            selectedStrokes.forEach(s => { const a = bySvg.get(s.svg) || []; a.push(s.index); bySvg.set(s.svg, a); });
            bySvg.forEach((indices, svg) => {
                const idx = parseInt(svg.dataset.canvasIndex);
                const cmds = window.canvasDrawings[idx];
                if (!cmds) return;
                indices.sort((a, b) => b - a).forEach(i => { if (i < cmds.length) cmds.splice(i, 1); });
                renderStrokesToSVG(svg, window.canvasDrawings[idx] || []);
            });
            clearMultiStrokeSelection();
            return true;
        }
        function nudgeSelectedStroke(dx, dy) {
            const cmd = currentStrokeCmd();
            if (!cmd) return;
            cmd.points = cmd.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            reRenderStrokeSvg();
            clearTimeout(nudgeSaveTimer);
            nudgeSaveTimer = setTimeout(() => window.saveState(), 400);
        }
        function duplicateSelectedStroke() {
            const cmd = currentStrokeCmd();
            if (!cmd) return;
            const idx = parseInt(selectedStroke.svg.dataset.canvasIndex);
            const copy = JSON.parse(JSON.stringify(cmd));
            // 貼り付けと同じく、線の左上をカーソル位置に合わせる
            let dx = 12, dy = 12;
            if (lastMouseWs && copy.points.length) {
                dx = lastMouseWs.x - Math.min(...copy.points.map(p => p.x));
                dy = lastMouseWs.y - Math.min(...copy.points.map(p => p.y));
            }
            copy.points = copy.points.map(p => ({ x: p.x + dx, y: p.y + dy }));
            window.canvasDrawings[idx].push(copy);
            const svg = selectedStroke.svg;
            selectedStroke = { svg, index: window.canvasDrawings[idx].length - 1 };
            renderStrokesToSVG(svg, window.canvasDrawings[idx]);
            showStrokeHighlight();
            window.saveState();
        }

        /* 古い .amk の手描きは1枚の画像として入っている。画像は読み込みを待たないと描けないので、
           この場合だけ Promise を返す。呼ぶ側は executeCanvasCommands で待つこと
           （待たずに合成すると、書き出しに手描きが1本も写らない）。 */
        function executeCanvasCommand(ctx, cmd) {
            if (cmd.tool === 'legacy_base64') {
                return new Promise(resolve => {
                    const img = new Image();
                    const draw = () => {
                        ctx.save();
                        ctx.setTransform(1, 0, 0, 1, 0, 0);
                        ctx.globalCompositeOperation = 'source-over';
                        // 画面と同じく、描く面いっぱいに引き伸ばす（元は当時の表示サイズで撮った画像）
                        ctx.drawImage(img, 0, 0, ctx.canvas.width, ctx.canvas.height);
                        ctx.restore();
                        resolve();
                    };
                    img.onload = draw;
                    img.onerror = () => { console.error('古い手描き画像を読めませんでした'); resolve(); };
                    img.src = cmd.dataURL;
                });
            }

            const pts = cmd.points;
            if (!pts || pts.length === 0) return;

            ctx.beginPath();
            ctx.lineWidth = cmd.width;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            if (cmd.tool === 'pen') {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = hexToRgba(cmd.color, cmd.opacity);
            } else { 
                ctx.globalCompositeOperation = 'destination-out';
                ctx.strokeStyle = 'rgba(0,0,0,1)';
            }

            ctx.moveTo(pts[0].x, pts[0].y);
            if (pts.length < 3) {
                ctx.lineTo((pts[1] || pts[0]).x + 0.01, (pts[1] || pts[0]).y + 0.01);
            } else {
                for (let i = 1; i < pts.length - 1; i++) {
                    const midX = (pts[i].x + pts[i + 1].x) / 2;
                    const midY = (pts[i].y + pts[i + 1].y) / 2;
                    ctx.quadraticCurveTo(pts[i].x, pts[i].y, midX, midY);
                }
                ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
            }
            ctx.stroke();
        }

        // 手描きを順に描く。画像（古い .amk）が混じっていれば、その読み込みを待ってから次へ進む
        async function executeCanvasCommands(ctx, cmds) {
            for (const cmd of (cmds || [])) {
                const pending = executeCanvasCommand(ctx, cmd);
                if (pending && typeof pending.then === 'function') await pending;
            }
        }

        // --- ワークスペースのシリアライズ（履歴・.amk保存・自動保存で共通利用） ---
        function serializeElements() {
            return Array.from(workspace.querySelectorAll('.canvas-element')).map(el => {
                const isText = el.classList.contains('text-wrapper');
                const isFreehandHighlight = el.classList.contains('highlight-freehand-wrapper');
                const isHighlight = el.classList.contains('highlight-box') && !isFreehandHighlight;
                const isFreehandMask = el.classList.contains('mask-freehand-wrapper');
                const isShape = el.classList.contains('shape-element');
                const isImage = el.classList.contains('image-element');
                const isMaskRect = el.classList.contains('mask-rect');

                return {
                    type: isText ? 'text' : (isFreehandHighlight ? 'freehand-highlight' : (isHighlight ? 'highlight' : (isFreehandMask ? 'freehand-mask' : (isShape ? 'shape' : (isImage ? 'image' : 'mask'))))),
                    left: el.style.left, top: el.style.top, width: el.style.width, height: el.style.height,
                    content: isText ? el.querySelector('.text-content').innerHTML : null,
                    fontSize: isText ? el.style.fontSize : null,
                    color: isText ? el.style.color
                        : (isShape ? el.querySelector('svg > *')?.getAttribute('stroke')
                        : (isMaskRect ? (el.style.backgroundColor || null)
                        : ((isFreehandMask || isFreehandHighlight) ? (el.querySelector('path').style.stroke || null)
                        : null))),
                    backgroundColor: isHighlight ? el.style.backgroundColor : null,
                    zIndex: el.style.zIndex,
                    textAlign: isText ? (el.style.textAlign || el.querySelector('.text-content').style.textAlign || 'left') : null,
                    writingMode: isText ? (el.style.writingMode || el.querySelector('.text-content').style.writingMode || 'horizontal-tb') : null,
                    pathD: (isFreehandMask || isFreehandHighlight) ? el.querySelector('path').getAttribute('d') : null,
                    strokeWidth: (isFreehandMask || isFreehandHighlight) ? el.querySelector('path').getAttribute('stroke-width') : (isShape ? el.querySelector('svg > *')?.getAttribute('stroke-width') : null),
                    shapeType: isShape ? el.dataset.shapeType : null,
                    lineDir: isShape ? el.dataset.lineDir : null,
                    dataUrl: isImage ? el.querySelector('img').src : null
                };
            });
        }

        function currentBgScale() {
            if (!currentBackground) return 1;
            return currentBackground.type === 'pdf'
                ? window.pdfBaseScale
                : (parseFloat(uploadedImage.style.width) / uploadedImage.naturalWidth);
        }

        // 背景を除いた軽量セッション（自動保存で頻繁に書き込む部分）
        function buildSessionData() {
            return {
                version: 1,
                fileName: window.currentFileName || 'project',
                bgScale: currentBgScale(),
                elements: serializeElements(),
                canvasCommandsArray: window.canvasDrawings.map(cmds => [...cmds]),
                canvasZIndexes: Array.from(workspace.querySelectorAll('.drawing-svg')).map(c => c.style.zIndex)
            };
        }

        // .amk書き出し用（背景データを含む完全なプロジェクト）
        function buildProjectData() {
            return { ...buildSessionData(), background: currentBackground };
        }

        /* ── 編集できるPDF（PDFの中に作業データを忍ばせる）─────────────────
           黒塗りを焼き込まないPDFを出し、PDFの情報欄に作業データを入れておく。
           人の目には出ず、他のソフトで開いても普通のPDFに見える。
           容量は元PDF＋数十KB程度（作業データは gzip で圧縮して入れる）。
           焼き込み版と違って、これを開き直せば続きから編集できる。
           ※注意：他のPDFソフトで開いて保存し直すと、情報欄が捨てられることがある。 */
        const AMK_PDF_KEY = 'AnkiMaskingData';

        function bytesToBase64(bytes) {
            let s = ''; const chunk = 0x8000;
            for (let i = 0; i < bytes.length; i += chunk) {
                s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
            }
            return btoa(s);
        }
        function base64ToBytes(b64) {
            const bin = atob(b64); const out = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
            return out;
        }
        // 印は先頭に付ける。gz: は圧縮あり、raw: は圧縮なし（古いブラウザ向けの退避）
        async function packProjectPayload(obj) {
            const bytes = new TextEncoder().encode(JSON.stringify(obj));
            if (typeof CompressionStream === 'undefined') return 'raw:' + bytesToBase64(bytes);
            const cs = new CompressionStream('gzip');
            const w = cs.writable.getWriter(); w.write(bytes); w.close();
            const buf = await new Response(cs.readable).arrayBuffer();
            return 'gz:' + bytesToBase64(new Uint8Array(buf));
        }
        async function unpackProjectPayload(payload) {
            const isGz = payload.startsWith('gz:');
            const bytes = base64ToBytes(payload.replace(/^(gz|raw):/, ''));
            if (!isGz) return JSON.parse(new TextDecoder().decode(bytes));
            const ds = new DecompressionStream('gzip');
            const w = ds.writable.getWriter(); w.write(bytes); w.close();
            const buf = await new Response(ds.readable).arrayBuffer();
            return JSON.parse(new TextDecoder().decode(buf));
        }

        // 元PDF（または画像を入れた1ページのPDF）に作業データを刻んで書き出す
        async function exportEditablePdf() {
            saveDropdownMenu.classList.remove('show');
            if (!currentBackground) { alert('まずは画像かPDFを新規作成で開いてください。'); return; }
            if (typeof PDFLib === 'undefined') { alert('PDFの部品が読み込めていません。ページを開き直してください。'); return; }

            const loadingOverlay = document.getElementById('loading-overlay');
            setLoadingDetail('編集できるPDFを作成中...');
            loadingOverlay.style.display = 'flex';
            await new Promise(r => setTimeout(r, 50));

            try {
                let doc;
                if (currentBackground.type === 'pdf') {
                    const bytes = await (await fetch(currentBackground.dataURL)).arrayBuffer();
                    doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true });
                } else {
                    // 画像は1ページのPDFに入れる。原寸のまま入れるので画質は落ちない
                    doc = await PDFLib.PDFDocument.create();
                    const bytes = await (await fetch(currentBackground.dataURL)).arrayBuffer();
                    const isPng = /^data:image\/png/i.test(currentBackground.dataURL);
                    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
                    const page = doc.addPage([img.width, img.height]);
                    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
                }

                const payload = await packProjectPayload(buildSessionData());
                let info = doc.context.trailerInfo.Info ? doc.context.lookup(doc.context.trailerInfo.Info) : null;
                if (!info || typeof info.set !== 'function') {
                    info = doc.context.obj({});
                    doc.context.trailerInfo.Info = doc.context.register(info);
                }
                info.set(PDFLib.PDFName.of(AMK_PDF_KEY), PDFLib.PDFString.of(payload));

                const out = await doc.save({ updateMetadata: false });
                const blob = new Blob([out], { type: 'application/pdf' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.download = `${window.currentFileName}_編集用.pdf`;
                a.href = url; a.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (err) {
                console.error(err);
                alert('編集できるPDFの作成に失敗しました。');
            } finally {
                loadingOverlay.style.display = 'none';
            }
        }

        /* PDFの文字列オブジェクトから中身を取り出す。
           pdf-lib の decodeText() は内部で String.fromCharCode(...配列) を使うため、
           数百KBを超えると「Maximum call stack size exceeded」で落ちる
           （写真を貼ると作業データがその大きさになる）。
           刻む中身は必ず Base64＋印だけ＝エスケープが起きない文字なので、
           生の value をそのまま使う。念のため、印の付いていない時だけ従来の方法に戻す。 */
        function readPdfStringValue(v) {
            if (!v) return null;
            const val = v.value;
            if (typeof val === 'string' && /^(gz|raw):/.test(val)) return val;
            try {
                if (typeof v.decodeText === 'function') return v.decodeText();
            } catch (e) {
                console.error(e);
            }
            return typeof val === 'string' ? val : null;
        }

        // PDFに作業データが刻まれていれば取り出す。無ければ null
        async function readEmbeddedProject(arrayBuffer) {
            if (typeof PDFLib === 'undefined') return null;
            try {
                const doc = await PDFLib.PDFDocument.load(arrayBuffer, { ignoreEncryption: true, updateMetadata: false });
                const infoRef = doc.context.trailerInfo.Info;
                if (!infoRef) return null;
                const info = doc.context.lookup(infoRef);
                if (!info || typeof info.get !== 'function') return null;
                const v = info.get(PDFLib.PDFName.of(AMK_PDF_KEY));
                if (!v) return null;
                const raw = readPdfStringValue(v);
                if (!raw) return null;
                return await unpackProjectPayload(raw);
            } catch (e) {
                console.error(e);
                return null;
            }
        }

        // --- 自動保存（IndexedDB） ---
        const AUTOSAVE_DB = 'ankimasking', AUTOSAVE_STORE = 'autosave';
        function idbOpen() {
            return new Promise((res, rej) => {
                const req = indexedDB.open(AUTOSAVE_DB, 1);
                req.onupgradeneeded = () => req.result.createObjectStore(AUTOSAVE_STORE);
                req.onsuccess = () => res(req.result);
                req.onerror = () => rej(req.error);
            });
        }
        async function idbSet(key, val) {
            const db = await idbOpen();
            return new Promise((res, rej) => {
                const tx = db.transaction(AUTOSAVE_STORE, 'readwrite');
                tx.objectStore(AUTOSAVE_STORE).put(val, key);
                tx.oncomplete = () => { db.close(); res(); };
                tx.onerror = () => { db.close(); rej(tx.error); };
            });
        }
        async function idbGet(key) {
            const db = await idbOpen();
            return new Promise((res, rej) => {
                const tx = db.transaction(AUTOSAVE_STORE, 'readonly');
                const r = tx.objectStore(AUTOSAVE_STORE).get(key);
                r.onsuccess = () => { db.close(); res(r.result); };
                r.onerror = () => { db.close(); rej(r.error); };
            });
        }
        async function idbDel(key) {
            const db = await idbOpen();
            return new Promise((res, rej) => {
                const tx = db.transaction(AUTOSAVE_STORE, 'readwrite');
                tx.objectStore(AUTOSAVE_STORE).delete(key);
                tx.oncomplete = () => { db.close(); res(); };
                tx.onerror = () => { db.close(); rej(tx.error); };
            });
        }

        let autosaveTimer = null;
        let isDirty = false;
        function scheduleAutosave() {
            if (!currentBackground) return;
            isDirty = true;
            clearTimeout(autosaveTimer);
            autosaveTimer = setTimeout(async () => {
                try {
                    await idbSet('session', buildSessionData());
                    isDirty = false;
                } catch (err) { console.error('自動保存に失敗しました', err); }
            }, 800);
        }
        // 背景（大きいデータ）はファイルを開いた時だけ書き込む
        async function persistBackground() {
            if (!currentBackground) return;
            try { await idbSet('background', currentBackground); }
            catch (err) { console.error('背景の保存に失敗しました', err); }
        }

        // 履歴に積む控えは、後で命令を書き換えても（例：色の付け替え）過去に影響しないよう
        // 深い複製にする必要がある。JSON の往復は文字列を経由するぶん重いので、
        // 使える環境では structuredClone を使う。
        function deepCloneCommands(v) {
            return (typeof structuredClone === 'function') ? structuredClone(v) : JSON.parse(JSON.stringify(v));
        }

        window.saveState = function() {
            const elements = serializeElements();
            const canvasCommandsArray = deepCloneCommands(window.canvasDrawings);
            const canvasZIndexes = Array.from(workspace.querySelectorAll('.drawing-svg')).map(c => c.style.zIndex);

            window.historyArray = window.historyArray.slice(0, window.historyIndex + 1);
            window.historyArray.push({ elements, canvasCommandsArray, canvasZIndexes });
            window.historyIndex++;

            const MAX_HISTORY = 50;
            if (window.historyArray.length > MAX_HISTORY) {
                window.historyArray.shift();
                window.historyIndex--;
            }

            scheduleAutosave();
            updateHistoryButtons();
        }

        function restoreState(index) {
            if (index < 0 || index >= window.historyArray.length) return;
            workspace.querySelectorAll('.canvas-element').forEach(el => el.remove()); window.deselectCurrent();
            const state = window.historyArray[index];
            state.elements.forEach(data => {
                let el;
                if (data.type === 'mask') el = window.createMaskElement(data.left, data.top, data.width, data.height, data.color);
                else if (data.type === 'shape') el = window.createShapeElement(data.left, data.top, data.width, data.height, data.shapeType, data.color, data.strokeWidth, data.lineDir);
                else if (data.type === 'freehand-mask') el = window.createFreehandMaskElement(data.left, data.top, data.width, data.height, data.pathD, data.strokeWidth, data.color);
                    else if (data.type === 'freehand-highlight') el = window.createFreehandHighlightElement(data.left, data.top, data.width, data.height, data.pathD, data.strokeWidth, data.color);
                else if (data.type === 'highlight') el = window.createHighlightElement(data.left, data.top, data.width, data.height, data.backgroundColor);
                else if (data.type === 'image') el = window.createImageElement(data.left, data.top, data.width, data.height, data.dataUrl);
                else el = window.createTextElement(data.left, data.top, data.width, data.height, data.content, data.fontSize, data.color, data.textAlign, data.writingMode); 
                
                if (data.zIndex) {
                    el.style.zIndex = data.zIndex;
                    if (parseInt(data.zIndex) > window.globalZIndex) window.globalZIndex = parseInt(data.zIndex);
                }
            });
            
            window.canvasDrawings = deepCloneCommands(state.canvasCommandsArray);
            const svgs = Array.from(workspace.querySelectorAll('.drawing-svg'));

            svgs.forEach((svg, i) => {
                if (state.canvasZIndexes && state.canvasZIndexes[i]) {
                    svg.style.zIndex = state.canvasZIndexes[i];
                }
                renderStrokesToSVG(svg, window.canvasDrawings[i] || []);
            });
            updateHistoryButtons();
        }

        // 図形の「掴める太さ」。見た目の線が細くても最低14pxぶんは掴めるようにする。
        function shapeHitWidth(strokeWidth) {
            return Math.max(parseFloat(strokeWidth) || 2, 14);
        }

        window.createShapeElement = function(left, top, width, height, shapeType, color, strokeWidth, lineDir) {
            const wrapper = document.createElement('div');
            wrapper.className = `canvas-element shape-element`;
            wrapper.dataset.shapeType = shapeType;
            wrapper.dataset.lineDir = lineDir || '\\';
            wrapper.style.left = left; wrapper.style.top = top;
            wrapper.style.width = width; wrapper.style.height = height;
            
            const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
            svg.style.width = '100%'; svg.style.height = '100%';
            svg.setAttribute('preserveAspectRatio', 'none');
            
            let shapeNode;
            if (shapeType === 'rect') {
                shapeNode = document.createElementNS("http://www.w3.org/2000/svg", "rect");
                shapeNode.setAttribute('x', '0'); shapeNode.setAttribute('y', '0');
                shapeNode.setAttribute('width', '100%'); shapeNode.setAttribute('height', '100%');
            } else if (shapeType === 'circle') {
                shapeNode = document.createElementNS("http://www.w3.org/2000/svg", "ellipse");
                shapeNode.setAttribute('cx', '50%'); shapeNode.setAttribute('cy', '50%');
                shapeNode.setAttribute('rx', '50%'); shapeNode.setAttribute('ry', '50%');
            } else if (shapeType === 'line') {
                shapeNode = document.createElementNS("http://www.w3.org/2000/svg", "line");
                if (lineDir === '/') {
                    shapeNode.setAttribute('x1', '0'); shapeNode.setAttribute('y1', '100%');
                    shapeNode.setAttribute('x2', '100%'); shapeNode.setAttribute('y2', '0');
                } else {
                    shapeNode.setAttribute('x1', '0'); shapeNode.setAttribute('y1', '0');
                    shapeNode.setAttribute('x2', '100%'); shapeNode.setAttribute('y2', '100%');
                }
            }
            
            shapeNode.setAttribute('fill', 'none');
            shapeNode.setAttribute('stroke', color);
            shapeNode.setAttribute('stroke-width', strokeWidth);
            shapeNode.setAttribute('vector-effect', 'non-scaling-stroke');
            
            svg.appendChild(shapeNode);

            // 当たり判定は「線の上だけ」。ただし細い線は掴みにくいので、
            // 透明で太い同じ形をもう1枚重ねて、それだけで判定を取る（見た目には出ない）。
            const hitNode = shapeNode.cloneNode(false);
            hitNode.setAttribute('class', 'shape-hit');
            hitNode.setAttribute('fill', 'none');
            hitNode.setAttribute('stroke', 'rgba(0,0,0,0)');
            hitNode.setAttribute('stroke-width', shapeHitWidth(strokeWidth));
            hitNode.setAttribute('vector-effect', 'non-scaling-stroke');
            svg.appendChild(hitNode);

            wrapper.appendChild(svg);
            addResizeHandles(wrapper);
            window.bringToFront(wrapper);
            workspace.appendChild(wrapper);
            return wrapper;
        }

        window.createMaskElement = function(left, top, width, height, color) {
            const mask = document.createElement('div'); mask.className = 'canvas-element mask mask-rect';
            mask.style.left = left; mask.style.top = top; mask.style.width = width; mask.style.height = height;
            if (color) mask.style.backgroundColor = color;
            addResizeHandles(mask);
            window.bringToFront(mask);
            workspace.appendChild(mask); return mask;
        }

        // 手書き線（マスキング／ハイライト共通）の組み立て。
        // 線本体・選択時に出す中心線・両端のつまみをまとめて作る
        function buildFreehandElement(className, left, top, width, height, pathD, strokeWidth, color, defaultStroke) {
            const wrapper = document.createElement('div');
            wrapper.className = className;
            wrapper.style.left = left;
            wrapper.style.top = top;
            wrapper.style.width = width;
            wrapper.style.height = height;

            const svg = document.createElementNS(SVGNS, "svg");
            svg.style.width = '100%';
            svg.style.height = '100%';
            svg.style.pointerEvents = 'none';
            svg.setAttribute('preserveAspectRatio', 'none');
            svg.setAttribute('viewBox', `0 0 ${parseFloat(width)} ${parseFloat(height)}`);

            const path = document.createElementNS(SVGNS, "path");
            path.setAttribute('class', 'fh-stroke');
            path.setAttribute('d', pathD);
            if (defaultStroke) path.setAttribute('stroke', defaultStroke);
            if (color) path.style.stroke = color;
            path.setAttribute('stroke-width', strokeWidth);
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
            path.setAttribute('fill', 'none');
            path.setAttribute('vector-effect', 'non-scaling-stroke');

            // 選択したときだけ見える中心線
            const center = document.createElementNS(SVGNS, "path");
            center.setAttribute('class', 'fh-center');
            center.setAttribute('d', pathD);
            center.setAttribute('stroke-width', '1');
            center.setAttribute('fill', 'none');
            center.setAttribute('vector-effect', 'non-scaling-stroke');

            svg.appendChild(path);
            svg.appendChild(center);
            wrapper.appendChild(svg);

            ['start', 'end'].forEach(pos => {
                const h = document.createElement('div');
                h.className = 'fh-handle fh-handle-' + pos;
                h.dataset.end = pos;
                wrapper.appendChild(h);
            });

            window.bringToFront(wrapper);
            workspace.appendChild(wrapper);
            updateFreehandUI(wrapper);
            return wrapper;
        }

        window.createFreehandMaskElement = function(left, top, width, height, pathD, strokeWidth, color) {
            return buildFreehandElement('canvas-element mask mask-freehand-wrapper',
                left, top, width, height, pathD, strokeWidth, color, 'black');
        }

        // 手書きハイライト（蛍光ペンの線）。マスキングの手書きと同じ作りだが、乗算で重ねる
        window.createFreehandHighlightElement = function(left, top, width, height, pathD, strokeWidth, color) {
            return buildFreehandElement('canvas-element highlight-box highlight-freehand-wrapper',
                left, top, width, height, pathD, strokeWidth, color, null);
        }

        // --- 線の明るさに応じて中心線の色（黒 or 白）を決める ---
        // 名前が後段の parseCssColor（0〜1を返す・PDF書き出し用）とぶつかると
        // 巻き上げで後者が勝ち、明度判定が常に同じ側へ倒れる。名前を分けておく。
        const colorProbeCtx = document.createElement('canvas').getContext('2d');
        function parseCssColor255(c) {
            if (!c) return null;
            colorProbeCtx.fillStyle = '#000';
            colorProbeCtx.fillStyle = c;              // 不正な値なら黒のまま残る
            const s = colorProbeCtx.fillStyle;
            if (s.startsWith('#')) {
                const h = s.length === 4
                    ? s.slice(1).split('').map(x => parseInt(x + x, 16))
                    : [1, 3, 5].map(i => parseInt(s.substr(i, 2), 16));
                return { r: h[0], g: h[1], b: h[2], a: 1 };
            }
            const n = s.match(/-?\d*\.?\d+/g);
            if (!n) return null;
            return { r: +n[0], g: +n[1], b: +n[2], a: n[3] === undefined ? 1 : +n[3] };
        }
        // 白い紙の上に置いたときの見た目の明るさで判定する
        function centerLineColorFor(cssColor) {
            const c = parseCssColor255(cssColor);
            if (!c) return '#ffffff';
            const r = c.a * c.r + (1 - c.a) * 255;
            const g = c.a * c.g + (1 - c.a) * 255;
            const b = c.a * c.b + (1 - c.a) * 255;
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            return lum > 0.55 ? '#000000' : '#ffffff';
        }

        // 端をドラッグしたときの変形。掴んだ端がカーソルにそのまま付いてくるよう、
        // 反対の端を固定点として「拡大・縮小＋回転」をまとめてかける（線の形は崩れない）
        function endpointTransform(anchor, baseDx, baseDy, curX, curY) {
            const len2 = baseDx * baseDx + baseDy * baseDy;
            const vx = curX - anchor.x, vy = curY - anchor.y;
            if (len2 < 0.0001) return p => ({ x: p.x, y: p.y });
            let a = (baseDx * vx + baseDy * vy) / len2;   // 拡大率（回転を含む複素数の実部）
            let b = (baseDx * vy - baseDy * vx) / len2;   // 同じく虚部＝回転成分
            const mag = Math.hypot(a, b);
            if (mag > 20) { a = a / mag * 20; b = b / mag * 20; }
            return p => {
                const dx = p.x - anchor.x, dy = p.y - anchor.y;
                return { x: anchor.x + a * dx - b * dy, y: anchor.y + b * dx + a * dy };
            };
        }

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

        function initWorkspace(isPdf = false) {
            workspace.querySelectorAll('.canvas-element').forEach(e => e.remove());
            window.deselectCurrent(); window.historyArray = []; window.historyIndex = -1; window.canvasDrawings = [];
            
            setTimeout(() => {
                if (!isPdf) {
                    let drawSvg = workspace.querySelector('.drawing-svg');
                    if (!drawSvg) {
                        drawSvg = createDrawSVG(workspace.offsetWidth, workspace.offsetHeight);
                        workspace.appendChild(drawSvg);
                    } else {
                        drawSvg.setAttribute('viewBox', `0 0 ${workspace.offsetWidth} ${workspace.offsetHeight}`);
                    }
                }

                workspace.querySelectorAll('.drawing-svg').forEach((c, i) => {
                    c.dataset.canvasIndex = i;
                    window.canvasDrawings[i] = [];
                    renderStrokesToSVG(c, []);
                });
                
                setZoom(1.0);
                window.centerWorkspace();   // 読み込み直後は紙を画面の中央に置く
                // 空の初期状態を履歴の起点(index 0)として必ず積む（undoで全消去される不具合の防止）
                window.historyArray = []; window.historyIndex = -1;
                window.saveState();
            }, 50);
        }

        // いま表示しているページ。表示を書き換えるのは変わった時だけにする
        // （毎フレーム書き換えると、一覧が滑り続けて操作を奪う）。
        let shownPage = 1;
        function markActivePage(p, scrollThumb) {
            if (p === shownPage) return;
            shownPage = p;
            // 打ちかけの数字だけは横から書き換えない（ただ触っているだけなら追随する）
            if (!(document.activeElement === pageInput && pageInputDirty)) pageInput.value = p;
            document.querySelectorAll('.pdf-thumb').forEach(t => t.classList.toggle('active', parseInt(t.dataset.page) === p));
            if (!scrollThumb) return;
            const activeThumb = document.querySelector(`.pdf-thumb[data-page="${p}"]`);
            // 一覧の中だけを動かす。`scrollIntoView` は親（本文側）まで動かしてしまう。
            if (activeThumb) {
                const top = activeThumb.offsetTop - (pdfSidebar.clientHeight - activeThumb.offsetHeight) / 2;
                pdfSidebar.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
            }
        }

        // 「いま飛んでいる先」。決まっている間は、通過するページで番号や印を書き換えない。
        // これが無いと、飛んでいる途中のページ番号が入力欄に入り、次の1回がその数字から
        // 始まる＝矢印を押しているのに戻っていく（Rayan様の報告・08-03）。
        // 以前は「1200ms のあいだ」という時間で抑えていたが、抑えていたのは一覧の追従だけで
        // 番号は素通りしていた。目的地そのものを持たせて、着くまで一切触らせない。
        let jumpTarget = null;
        let jumpIdleTimer = 0;
        let jumpScrollTimer = 0;

        // スクロールが止まってから少し待って「着いた」とみなす（時間の決め打ちをやめる）
        // 着いた時点で必ず実際の位置から番号を引き直す。飛んでいる途中に人が手で
        // スクロールして割り込むと、番号が飛び先のまま古く残るため。
        function endJumpWhenSettled() {
            clearTimeout(jumpIdleTimer);
            jumpIdleTimer = setTimeout(() => {
                jumpTarget = null;
                syncPageFromScroll();
            }, 220);
        }

        function goToPage(p) {
            if (!Number.isFinite(p)) { pageInput.value = shownPage; return; }
            p = Math.min(Math.max(Math.round(p), 1), totalPdfPages || 1);
            if (!document.getElementById(`pdf-page-${p}`)) return;

            jumpTarget = p;
            pageInput.value = p;
            markActivePage(p, true);
            endJumpWhenSettled();

            // 連打の途中で毎回スクロールをやり直すとガタつく。押し終わってから1回だけ飛ぶ。
            clearTimeout(jumpScrollTimer);
            jumpScrollTimer = setTimeout(() => {
                const targetPage = document.getElementById(`pdf-page-${jumpTarget}`);
                if (!targetPage) return;
                const currentMarginTop = parseFloat(workspaceWrapper.style.marginTop) || 0;
                workspaceContainer.scrollTo({
                    top: (targetPage.offsetTop * zoomLevel) + currentMarginTop,
                    behavior: 'smooth'
                });
                endJumpWhenSettled();
            }, 160);
        }

        // 矢印は紙の動く向きに合わせる：↑＝前のページ、↓＝次のページ。
        // 入力欄でのキーボードの上下も同じ向きに揃える（ボタンと食い違わないように）。
        document.getElementById('btn-page-prev').addEventListener('click', () => goToPage((jumpTarget ?? shownPage) - 1));
        document.getElementById('btn-page-next').addEventListener('click', () => goToPage((jumpTarget ?? shownPage) + 1));

        let pageInputDirty = false;
        pageInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); goToPage((jumpTarget ?? shownPage) - 1); }
            else if (e.key === 'ArrowDown') { e.preventDefault(); goToPage((jumpTarget ?? shownPage) + 1); }
        });
        pageInput.addEventListener('input', () => { pageInputDirty = true; });
        pageInput.addEventListener('blur', () => { pageInputDirty = false; });
        pageInput.addEventListener('change', () => { pageInputDirty = false; goToPage(parseInt(pageInput.value)); });

        // いまのスクロール位置から現在ページを割り出して表示に反映する
        function syncPageFromScroll() {
            if (pdfContainer.style.display !== 'block') return;
            const currentMarginTop = parseFloat(workspaceWrapper.style.marginTop) || 0;
            const containerCenter = (workspaceContainer.scrollTop - currentMarginTop + workspaceContainer.clientHeight / 2) / zoomLevel;
            // 画面の真ん中にいちばん近いページを今のページとする。
            // 「真ん中を含むページ」だけを見ると、ページの隙間に来た時に
            // 1ページ目へ跳ね返っていた。
            let currentP = shownPage, best = Infinity;
            document.querySelectorAll('.pdf-page').forEach(p => {
                const top = p.offsetTop, bottom = top + p.offsetHeight;
                const d = containerCenter < top ? top - containerCenter
                        : containerCenter > bottom ? containerCenter - bottom : 0;
                if (d < best) { best = d; currentP = parseInt(p.dataset.page); }
            });
            markActivePage(currentP, true);
        }

        let scrollRafPending = false;
        workspaceContainer.addEventListener('scroll', () => {
            if (pdfContainer.style.display !== 'block') return;
            if (scrollRafPending) return; // 1フレームに1回だけ処理（大量ページでのジャンク防止）
            scrollRafPending = true;
            requestAnimationFrame(() => {
                scrollRafPending = false;
                // 指定ページへ飛んでいる最中は、通過するページで番号も一覧も動かさない
                if (jumpTarget !== null) { endJumpWhenSettled(); return; }
                syncPageFromScroll();
            });
        });

        let isSidebarOpen = false;
        btnToggleSidebar.addEventListener('click', () => {
            isSidebarOpen = !isSidebarOpen;
            pdfSidebar.style.display = isSidebarOpen ? 'flex' : 'none';
        });

        async function renderPdfPageAsync(pageDiv, targetZoom = 1.0) {
            pageDiv.dataset.rendering = "true";
            const pageNum = parseInt(pageDiv.dataset.page);
            try {
                const page = await window.currentPdfDoc.getPage(pageNum);
                const viewport = page.getViewport({ scale: window.pdfBaseScale });
                
                pageDiv.style.width = viewport.width + 'px'; 
                pageDiv.style.height = viewport.height + 'px';
                
                const dynamicScale = Math.min(RENDER_SCALE * targetZoom, 4.0);
                
                const canvas = pageDiv.querySelector('canvas:not(.drawing-canvas)');
                canvas.width = viewport.width * dynamicScale; 
                canvas.height = viewport.height * dynamicScale; 
                
                const textLayerDiv = pageDiv.querySelector('.textLayer');
                textLayerDiv.style.width = viewport.width + 'px'; 
                textLayerDiv.style.height = viewport.height + 'px'; 
                textLayerDiv.style.setProperty('--scale-factor', viewport.scale);
                
                const scaledViewport = page.getViewport({ scale: window.pdfBaseScale * dynamicScale });
                await page.render({ canvasContext: canvas.getContext('2d'), viewport: scaledViewport }).promise;

                const textContent = await page.getTextContent();
                textLayerDiv.textContent = ''; // 再描画（ズーム時など）で既存spanが二重に累積するのを防ぐ
                pdfjsLib.renderTextLayer({ textContentSource: textContent, container: textLayerDiv, viewport: viewport, textDivs: [] });

                // 手描きレイヤー（SVG）はベクターなのでズームで再描画不要。viewBoxだけ保証し、内容を再構築。
                const drawSvg = pageDiv.querySelector('.drawing-svg');
                if (drawSvg) {
                    drawSvg.setAttribute('viewBox', `0 0 ${viewport.width} ${viewport.height}`);
                    const canvasIndex = parseInt(drawSvg.dataset.canvasIndex);
                    renderStrokesToSVG(drawSvg, window.canvasDrawings[canvasIndex] || []);
                }
                pageDiv.dataset.rendered = "true";
            } catch(e) {
                console.error("Page rendering failed", e);
                // 失敗したページは未描画に戻し、次に視界へ入った時に描き直せるようにする
                pageDiv.dataset.rendered = "false";
            } finally {
                pageDiv.dataset.rendering = "false";
            }
        }

        async function renderPdfThumbAsync(thumbDiv) {
            thumbDiv.dataset.rendering = "true";
            const pageNum = parseInt(thumbDiv.dataset.page);
            try {
                const page = await window.currentPdfDoc.getPage(pageNum);
                const thumbScale = 150 / window.pdfViewport1.width; 
                const thumbViewport = page.getViewport({ scale: thumbScale });
                
                const thumbCanvas = thumbDiv.querySelector('canvas');
                thumbCanvas.width = thumbViewport.width; 
                thumbCanvas.height = thumbViewport.height;
                await page.render({ canvasContext: thumbCanvas.getContext('2d'), viewport: thumbViewport }).promise;
                thumbDiv.dataset.rendered = "true";
            } catch(e) {
                console.error("Thumb rendering failed", e);
                thumbDiv.dataset.rendered = "false";
            } finally {
                thumbDiv.dataset.rendering = "false";
            }
        }

        async function loadBackground(bgData) {
            pdfSidebar.innerHTML = ''; document.getElementById('floating-top-left').style.display = 'none';
            isSidebarOpen = false; pdfSidebar.style.display = 'none';
            workspace.querySelectorAll('.drawing-canvas, .drawing-svg').forEach(c => c.remove());
            
            return new Promise(async (resolve, reject) => {
                if (bgData.type === 'pdf') {
                    if (typeof pdfjsLib === 'undefined') {
                        alert('PDF機能の読み込みに失敗しました。通信環境を確認して再読み込みしてください。');
                        return reject(new Error('pdfjsLib unavailable'));
                    }
                    uploadedImage.style.display = 'none'; pdfContainer.style.display = 'block';
                    const loadingOverlay = document.getElementById('loading-overlay');
                    loadingOverlay.style.display = 'flex';
                    setLoadingDetail('PDFを読み込み中...');
                    
                    try {
                        // 旧 PDF を破棄してから新しいものを読む（destroy しないとワーカ/バッファが積み上がる・08-02 修正）
                        if (window.currentPdfDoc) { try { await window.currentPdfDoc.destroy(); } catch (_) {} window.currentPdfDoc = null; }
                        const res = await fetch(bgData.dataURL);
                        const arrayBuffer = await res.arrayBuffer();
                        const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
                        pdfContainer.innerHTML = ''; 
                        
                        totalPdfPages = pdf.numPages; pageTotal.innerText = totalPdfPages; pageInput.max = totalPdfPages; pageInput.value = 1;
                        document.getElementById('floating-top-left').style.display = 'flex';

                        const page1 = await pdf.getPage(1); 
                        const viewport1 = page1.getViewport({ scale: 1.0 });
                        const containerW = workspaceContainer.clientWidth; 
                        const baseScale = (containerW * 0.9) / viewport1.width;
                        const defaultViewport = page1.getViewport({ scale: baseScale });
                        
                        window.currentPdfDoc = pdf;
                        window.pdfBaseScale = baseScale;
                        window.pdfViewport1 = viewport1;
                        shownPage = 1; jumpTarget = null; // 新しいPDFなので現在ページを1に戻す
                        
                        if (window.pageObserver) window.pageObserver.disconnect();
                        if (window.thumbObserver) window.thumbObserver.disconnect();
                        
                        window.pageObserver = new IntersectionObserver((entries) => {
                            entries.forEach(entry => {
                                if (entry.isIntersecting && entry.target.dataset.rendered !== "true" && entry.target.dataset.rendering !== "true") {
                                    renderPdfPageAsync(entry.target, zoomLevel);
                                }
                            });
                        }, { root: workspaceContainer, rootMargin: '800px 0px' });

                        window.thumbObserver = new IntersectionObserver((entries) => {
                            entries.forEach(entry => {
                                if (entry.isIntersecting && entry.target.dataset.rendered !== "true" && entry.target.dataset.rendering !== "true") {
                                    renderPdfThumbAsync(entry.target);
                                }
                            });
                        }, { root: pdfSidebar, rootMargin: '300px 0px' });

                        for (let i = 1; i <= pdf.numPages; i++) {
                            const pageDiv = document.createElement('div'); 
                            pageDiv.className = 'pdf-page'; 
                            pageDiv.id = `pdf-page-${i}`; 
                            pageDiv.dataset.page = i;
                            pageDiv.dataset.rendered = "false";
                            pageDiv.style.width = defaultViewport.width + 'px'; 
                            pageDiv.style.height = defaultViewport.height + 'px';
                            
                            const canvas = document.createElement('canvas'); 
                            canvas.style.display = 'block'; 
                            canvas.style.width = '100%'; 
                            canvas.style.height = '100%';
                            pageDiv.appendChild(canvas);
                            
                            const textLayerDiv = document.createElement('div'); 
                            textLayerDiv.className = 'textLayer'; 
                            textLayerDiv.style.width = defaultViewport.width + 'px'; 
                            textLayerDiv.style.height = defaultViewport.height + 'px';
                            pageDiv.appendChild(textLayerDiv);
                            
                            const drawSvg = createDrawSVG(defaultViewport.width, defaultViewport.height);
                            pageDiv.appendChild(drawSvg);
                            
                            pdfContainer.appendChild(pageDiv);
                            window.pageObserver.observe(pageDiv);

                            const thumbDiv = document.createElement('div'); 
                            thumbDiv.className = 'pdf-thumb'; 
                            if (i === 1) thumbDiv.classList.add('active');
                            thumbDiv.dataset.page = i; 
                            thumbDiv.dataset.rendered = "false";
                            
                            const thumbCanvas = document.createElement('canvas'); 
                            const thumbScale = 150 / viewport1.width; 
                            thumbCanvas.width = viewport1.width * thumbScale; 
                            thumbCanvas.height = viewport1.height * thumbScale;
                            thumbDiv.appendChild(thumbCanvas);
                            
                            const thumbSpan = document.createElement('span');
                            thumbSpan.innerText = `Page ${i}`;
                            thumbDiv.appendChild(thumbSpan);
                            
                            pdfSidebar.appendChild(thumbDiv);
                            window.thumbObserver.observe(thumbDiv);
                            
                            thumbDiv.addEventListener('click', () => goToPage(i));
                        }
                        
                        loadingOverlay.style.display = 'none'; 
                        initWorkspace(true);
                        setTimeout(resolve, 100);
                    } catch (error) {
                        // 知らせるのは呼んだ側の仕事。ここで alert すると二重に出る
                        console.error("PDFの読み込みに失敗:", error); loadingOverlay.style.display = 'none';
                        reject(error);
                    }
                } else {
                    pdfContainer.style.display = 'none';
                    const tempImg = new Image();
                    tempImg.onload = function() {
                        const containerW = workspaceContainer.clientWidth; 
                        const finalScale = (containerW * 0.72) / tempImg.naturalWidth;
                        uploadedImage.style.width = (tempImg.naturalWidth * finalScale) + 'px'; uploadedImage.style.height = (tempImg.naturalHeight * finalScale) + 'px';
                        uploadedImage.src = tempImg.src; uploadedImage.style.display = 'block';
                        initWorkspace(false);
                        setTimeout(resolve, 100);
                    };
                    tempImg.onerror = reject;
                    tempImg.src = bgData.dataURL;
                }
            });
        }

        imageInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const lastDotIndex = file.name.lastIndexOf('.');
            window.setCurrentFileName(lastDotIndex > 0 ? file.name.substring(0, lastDotIndex) : file.name);

            const isPdfFile = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
            const reader = new FileReader();
            reader.onload = async function(event) {
                const loadingOverlay = document.getElementById('loading-overlay');
                try {
                    currentBackground = {
                        type: isPdfFile ? 'pdf' : 'image',
                        dataURL: event.target.result
                    };
                    await loadBackground(currentBackground);
                    await persistBackground(); // 新しい背景を自動保存に反映
                    scheduleAutosave();
                } catch (error) {
                    console.error(error);
                    currentBackground = null;
                    loadingOverlay.style.display = 'none';
                    alert(isPdfFile
                        ? 'このPDFを開けませんでした。\nファイルが壊れているか、パスワードで保護されている可能性があります。'
                        : 'この画像を開けませんでした。\n対応していない形式か、ファイルが壊れている可能性があります。');
                } finally {
                    // 失敗した時こそ空にする。空にしないと同じファイルを選び直しても反応しない
                    e.target.value = '';
                }
            };
            reader.onerror = () => {
                console.error(reader.error);
                e.target.value = '';
                alert('ファイルを読み取れませんでした。もう一度選び直してください。');
            };
            reader.readAsDataURL(file);
        });

        document.getElementById('btn-save-project-menu').addEventListener('click', () => {
            saveDropdownMenu.classList.remove('show');
            if (!currentBackground) {
                alert("まずは画像かPDFを新規作成で開いてください。");
                return;
            }
            
            const loadingOverlay = document.getElementById('loading-overlay');
            setLoadingDetail('プロジェクトを保存中...');
            loadingOverlay.style.display = 'flex';
            
            try {
                const projectData = buildProjectData();
                const jsonStr = JSON.stringify(projectData);
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                
                a.download = `${window.currentFileName}.amk`;
                a.href = url;
                a.click();
                // すぐ捨てると保存が途中で切られることがある。他の書き出しと同じく遅らせる
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } catch (e) {
                console.error(e);
                alert("保存エラーが発生しました。");
            } finally {
                loadingOverlay.style.display = 'none';
            }
        });

        function loadDataToWorkspace(projectData) {
            workspace.querySelectorAll('.canvas-element').forEach(el => el.remove());
            window.deselectCurrent();

            if (projectData.elements && projectData.elements.length > 0) {
                projectData.elements.forEach(data => {
                    let el;
                    if (data.type === 'mask') el = window.createMaskElement(data.left, data.top, data.width, data.height, data.color);
                    else if (data.type === 'shape') el = window.createShapeElement(data.left, data.top, data.width, data.height, data.shapeType, data.color, data.strokeWidth, data.lineDir);
                    else if (data.type === 'freehand-mask') el = window.createFreehandMaskElement(data.left, data.top, data.width, data.height, data.pathD, data.strokeWidth, data.color);
                    else if (data.type === 'freehand-highlight') el = window.createFreehandHighlightElement(data.left, data.top, data.width, data.height, data.pathD, data.strokeWidth, data.color);
                    else if (data.type === 'highlight') el = window.createHighlightElement(data.left, data.top, data.width, data.height, data.backgroundColor);
                    else if (data.type === 'image') el = window.createImageElement(data.left, data.top, data.width, data.height, data.dataUrl);
                    else el = window.createTextElement(data.left, data.top, data.width, data.height, data.content, data.fontSize, data.color, data.textAlign, data.writingMode); 
                    
                    if (data.zIndex) {
                        el.style.zIndex = data.zIndex;
                        if (parseInt(data.zIndex) > window.globalZIndex) window.globalZIndex = parseInt(data.zIndex);
                    }
                });
            }

            if (projectData.canvasCommandsArray) {
                window.canvasDrawings = projectData.canvasCommandsArray;
            } else if (projectData.canvasDataArray) {
                window.canvasDrawings = projectData.canvasDataArray.map(data => 
                    data ? [{ tool: 'legacy_base64', dataURL: data }] : []
                );
            }

            const svgs = Array.from(workspace.querySelectorAll('.drawing-svg'));
            svgs.forEach((svg, i) => {
                if (projectData.canvasZIndexes && projectData.canvasZIndexes[i]) {
                    svg.style.zIndex = projectData.canvasZIndexes[i];
                }
                renderStrokesToSVG(svg, window.canvasDrawings[i] || []);
            });

            window.historyArray = [];
            window.historyIndex = -1;
            window.saveState();
        }

        document.getElementById('projectInput').addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const lastDotIndex = file.name.lastIndexOf('.');
            window.setCurrentFileName(lastDotIndex > 0 ? file.name.substring(0, lastDotIndex) : file.name);

            // 「編集用」として書き出したPDFなら、中の作業データを取り出して続きから開く
            const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
            if (isPdf) {
                const r = new FileReader();
                r.onload = async (ev) => {
                    const loadingOverlay = document.getElementById('loading-overlay');
                    try {
                        setLoadingDetail('データを復元中...');
                        loadingOverlay.style.display = 'flex';
                        await new Promise(res => setTimeout(res, 50));

                        const buf = ev.target.result;
                        const embedded = await readEmbeddedProject(buf);
                        const dataURL = 'data:application/pdf;base64,' + bytesToBase64(new Uint8Array(buf));

                        if (embedded) {
                            await applyProjectData({ ...embedded, background: { type: 'pdf', dataURL } });
                        } else {
                            // 作業データが入っていないPDF＝ただのPDF。新規として開く
                            currentBackground = { type: 'pdf', dataURL };
                            await loadBackground(currentBackground);
                            alert('このPDFには作業データが入っていません。新しいPDFとして開きました。\n（続きから編集するには「編集できるPDFで保存」で出したファイルを選んでください）');
                        }
                        await persistBackground();
                        scheduleAutosave();
                    } catch (error) {
                        console.error(error);
                        alert('このPDFを開けませんでした。\nファイルが壊れているか、パスワードで保護されている可能性があります。');
                    } finally {
                        loadingOverlay.style.display = 'none';
                        // 失敗した時こそ空にする。空にしないと同じファイルを選び直しても反応しない
                        e.target.value = '';
                    }
                };
                r.onerror = () => {
                    console.error(r.error);
                    e.target.value = '';
                    alert('ファイルを読み取れませんでした。もう一度選び直してください。');
                };
                r.readAsArrayBuffer(file);
                return;
            }

            const reader = new FileReader();
            reader.onload = async (event) => {
                const loadingOverlay = document.getElementById('loading-overlay');
                try {
                    loadingOverlay.style.display = 'flex';
                    setLoadingDetail('データを復元中...');

                    let projectData = JSON.parse(event.target.result);
                    await applyProjectData(projectData);
                } catch (error) {
                    console.error(error);
                    alert("ファイルの読み込みに失敗しました。正しいデータを選択してください。");
                } finally {
                    loadingOverlay.style.display = 'none';
                    // 失敗した時こそ空にする。空にしないと同じファイルを選び直しても反応しない
                    e.target.value = '';
                }
            };
            reader.onerror = () => {
                console.error(reader.error);
                e.target.value = '';
                alert('ファイルを読み取れませんでした。もう一度選び直してください。');
            };
            reader.readAsText(file);
        });

        // .amk読込・自動保存復元で共通のプロジェクト適用処理（背景ロード＋スケール補正＋要素復元）
        async function applyProjectData(projectData) {
            if (!projectData || !projectData.background) throw new Error("無効なデータです");

            currentBackground = projectData.background;
            await loadBackground(currentBackground);

            const bgScale = currentBgScale();
            const savedScale = projectData.bgScale || bgScale;
            const scaleRatio = bgScale / savedScale;

            let originalPageHeight = 0;
            const GAP = 20;
            if (currentBackground.type === 'pdf') {
                originalPageHeight = window.pdfViewport1.height * savedScale;
            }

            if (projectData.elements) {
                projectData.elements = projectData.elements.map(el => {
                    if (el.left) el.left = (parseFloat(el.left) * scaleRatio) + 'px';
                    if (el.top) {
                        let oldTop = parseFloat(el.top);
                        if (currentBackground.type === 'pdf' && originalPageHeight > 0) {
                            const k = Math.floor(oldTop / (originalPageHeight + GAP));
                            const oldTopWithoutGaps = oldTop - (k * GAP);
                            const newTopWithoutGaps = oldTopWithoutGaps * scaleRatio;
                            el.top = (newTopWithoutGaps + (k * GAP)) + 'px';
                        } else {
                            el.top = (oldTop * scaleRatio) + 'px';
                        }
                    }
                    if (el.width) el.width = (parseFloat(el.width) * scaleRatio) + 'px';
                    if (el.height) el.height = (parseFloat(el.height) * scaleRatio) + 'px';
                    if (el.fontSize) el.fontSize = (parseFloat(el.fontSize) * scaleRatio) + 'px';
                    if (el.strokeWidth) el.strokeWidth = parseFloat(el.strokeWidth) * scaleRatio;
                    if (el.pathD) {
                        el.pathD = el.pathD.replace(/([\d.-]+)/g, match => (parseFloat(match) * scaleRatio).toFixed(2));
                    }
                    return el;
                });
            }

            if (projectData.canvasCommandsArray) {
                projectData.canvasCommandsArray = projectData.canvasCommandsArray.map(cmds => {
                    return cmds.map(cmd => {
                        if (cmd.tool === 'legacy_base64') return cmd;
                        return {
                            ...cmd,
                            width: cmd.width * scaleRatio,
                            points: cmd.points.map(p => ({ x: p.x * scaleRatio, y: p.y * scaleRatio }))
                        };
                    });
                });
            }

            await new Promise(r => setTimeout(r, 500));
            loadDataToWorkspace(projectData);
            await persistBackground(); // 復元後、以降の自動保存のため背景を確実に保存
        }

        /* =========================================================
           指での操作（スマホ・タブレット）
           - #workspace-container は touch-action:none（1本指で描くために必須）なので、
             拡大・縮小・スクロールはブラウザ任せにできない。ここで自前で実装する。
           - 2本目の指が触れた時点で、描きかけの操作を畳んでピンチへ移る。
           - リスナーは document の capture（捕捉）側に置く。document は常に祖先なので、
             要素側の pointerdown/move/up より必ず先に走り、割り込める。
           ========================================================= */
        const activeTouches = new Map();   // pointerId -> {x, y}
        let touchGesture = null;           // {startDist, startZoom, prevMidX, prevMidY}
        let touchGestureActive = false;    // 2本指中は要素側の処理を止める
        // 指のタップは数px ぶれる。マウスより広い許容量を使う
        const TAP_SLOP = (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) ? 12 : 5;
        let focusTapMask = null;           // 学習モードでタップした黒塗り
        let focusTapStart = null;

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
        function measuredLineHeightPx(fontSizePx) {
            const key = Math.round(fontSizePx * 100);
            if (__lhCache.has(key)) return __lhCache.get(key);
            const probe = document.createElement('div');
            probe.style.cssText = `position:absolute;left:-99999px;top:0;visibility:hidden;white-space:pre;line-height:normal;font-family:${TEXT_FONT_STACK};font-size:${fontSizePx}px;`;
            probe.textContent = 'Mgあ';
            (workspace || document.body).appendChild(probe);
            const lh = probe.getBoundingClientRect().height || fontSizePx * 1.2;
            probe.remove();
            __lhCache.set(key, lh);
            return lh;
        }

        async function drawDOMElementToCanvas(ctx, data) {
            if (window.isMasksHidden && (data.type === 'mask' || data.type === 'freehand-mask')) {
                return;
            }

            const left = parseFloat(data.left || 0);
            const top = parseFloat(data.top || 0);
            let width = parseFloat(data.width);
            if (isNaN(width)) width = 300; 
            let height = parseFloat(data.height);
            if (isNaN(height)) height = 100;

            ctx.save();
            ctx.translate(left, top);

            if (data.type === 'mask') {
                ctx.fillStyle = data.color || 'black';
                ctx.fillRect(0, 0, width, height);
            } else if (data.type === 'highlight') {
                ctx.globalCompositeOperation = 'multiply';
                ctx.fillStyle = data.backgroundColor;
                ctx.fillRect(0, 0, width, height);
            } else if (data.type === 'freehand-mask') {
                ctx.strokeStyle = data.color || 'black';
                ctx.lineWidth = parseFloat(data.strokeWidth || 15);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke(new Path2D(data.pathD));
            } else if (data.type === 'freehand-highlight') {
                ctx.globalCompositeOperation = 'multiply';
                ctx.strokeStyle = data.color;
                ctx.lineWidth = parseFloat(data.strokeWidth || 20);
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.stroke(new Path2D(data.pathD));
            } else if (data.type === 'shape') {
                ctx.strokeStyle = data.color;
                ctx.lineWidth = parseFloat(data.strokeWidth || 3);
                ctx.beginPath();
                if (data.shapeType === 'rect') {
                    ctx.strokeRect(0, 0, width, height);
                } else if (data.shapeType === 'circle') {
                    ctx.ellipse(width/2, height/2, width/2, height/2, 0, 0, Math.PI * 2);
                    ctx.stroke();
                } else if (data.shapeType === 'line') {
                    if (data.lineDir === '/') {
                        ctx.moveTo(0, height);
                        ctx.lineTo(width, 0);
                    } else {
                        ctx.moveTo(0, 0);
                        ctx.lineTo(width, height);
                    }
                    ctx.stroke();
                }
            } else if (data.type === 'image') {
                if (data._cachedImg) {
                    ctx.drawImage(data._cachedImg, 0, 0, width, height);
                }
            } else if (data.type === 'text') {
                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = sanitizeTextHTML(data.content);

                const baseFontSize = parseFloat(data.fontSize || 20);
                // 画面DOMを忠実に再現する。.text-wrapper の padding は上2px・左8px（固定）。
                ctx.translate(8, 2);

                // 行の高さは画面の line-height:normal を実測して合わせる（端末で 1.15〜1.5 と変わる）。
                const lineHeight = measuredLineHeightPx(baseFontSize);
                // 縦位置は「文字の基準線(ベースライン)」で合わせる。textBaseline='top' は canvas と
                // CSS で基準がずれる（フォントごとに数px）ため、実測のフォント上下幅(fontBoundingBox)から
                // 行ボックス内のベースライン位置を計算して alphabetic で描く（画面と一致）。
                ctx.font = `${baseFontSize}px ${TEXT_FONT_STACK}`;
                const __fm = ctx.measureText('あ');
                const fAscent = __fm.fontBoundingBoxAscent || baseFontSize * 0.88;
                const fDescent = __fm.fontBoundingBoxDescent || baseFontSize * 0.25;
                const leadTop = (lineHeight - (fAscent + fDescent)) / 2; // 行ボックス上端→文字content上端
                const firstBaseline = leadTop + fAscent;                 // 箱上端→1行目ベースライン
                ctx.textBaseline = 'alphabetic';
                // 旧コード互換の名残（縦書き分岐で使用）
                const halfLeading = (lineHeight - baseFontSize) / 2;

                const isVertical = data.writingMode === 'vertical-rl' || data.writingMode === 'vertical-lr';

                let lines = [];
                let currentLine = [];

                function parseNode(node, color, isBold, isUnderline, isStrike) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        const texts = node.textContent.split(/\r?\n/);
                        texts.forEach((text, index) => {
                            if (index > 0) {
                                lines.push(currentLine);
                                currentLine = [];
                            }
                            if (text) currentLine.push({ text, color, isBold, isUnderline, isStrike });
                        });
                    } else if (node.nodeType === Node.ELEMENT_NODE) {
                        const tag = node.tagName.toLowerCase();
                        if (tag === 'br') {
                            lines.push(currentLine);
                            currentLine = [];
                        } else if (tag === 'div' || tag === 'p') {
                            if (currentLine.length > 0) {
                                lines.push(currentLine);
                                currentLine = [];
                            }
                        }

                        let nodeColor = color;
                        if (node.style && node.style.color) {
                            nodeColor = node.style.color;
                        } else if (node.hasAttribute('color')) {
                            let attrColor = node.getAttribute('color');
                            if (attrColor) {
                                // ★修正5: 空白や引用符などのゴミを除去し、Canvasが黒くなるのを完全ブロック
                                attrColor = attrColor.replace(/['"]/g, '').trim();
                                if (/^[0-9A-Fa-f]{3,6}$/.test(attrColor)) {
                                    attrColor = '#' + attrColor;
                                }
                                nodeColor = attrColor;
                            }
                        }

                        let nodeBold = isBold || tag === 'b' || tag === 'strong' || (node.style && node.style.fontWeight === 'bold');
                        let nodeUnderline = isUnderline || tag === 'u' || (node.style && node.style.textDecoration && node.style.textDecoration.includes('underline'));
                        let nodeStrike = isStrike || tag === 's' || tag === 'strike' || (node.style && node.style.textDecoration && node.style.textDecoration.includes('line-through'));

                        Array.from(node.childNodes).forEach(child => parseNode(child, nodeColor, nodeBold, nodeUnderline, nodeStrike));

                        if (tag === 'div' || tag === 'p') {
                            if (currentLine.length > 0) {
                                lines.push(currentLine);
                                currentLine = [];
                            }
                        }
                    }
                }

                parseNode(tempDiv, data.color || '#ef4444', false, false, false);
                if (currentLine.length > 0) lines.push(currentLine);

                if (isVertical) {
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top'; // 縦書きは字を上端基準で積む（横書きの alphabetic とは別）
                    const isRL = data.writingMode === 'vertical-rl';
                    // 保存された box 幅は 'max-content'(→NaN でフォールバック300px) になり得るため、
                    // 実際の列数から内容幅を求めて右端の基準にする（縦書きが画面外へ飛ぶのを防ぐ）
                    const vContentWidth = lines.length * lineHeight;
                    lines.forEach((line, i) => {
                        let lx = isRL ? (vContentWidth - (i * lineHeight) - baseFontSize / 2) : ((i * lineHeight) + baseFontSize / 2);
                        let ly = 0; // 縦書きの進行方向(下)は content 上端から。横方向の中央寄せは textAlign/lx が担う
                        line.forEach(seg => {
                            ctx.fillStyle = seg.color || data.color || '#ef4444'; // ★保険: 万が一色を見失っても元の色を維持
                            ctx.font = `${seg.isBold ? 'bold ' : ''}${baseFontSize}px ${TEXT_FONT_STACK}`;
                            for (let j = 0; j < seg.text.length; j++) {
                                const char = seg.text[j];
                                ctx.fillText(char, lx, ly);
                                ly += baseFontSize;
                            }
                        });
                    });
                } else {
                    ctx.textAlign = 'left';
                    lines.forEach((line, i) => {
                        let lx = 0;
                        let ly = firstBaseline + i * lineHeight; // 各行のベースライン（画面と一致）

                        if (data.textAlign === 'center' || data.textAlign === 'right') {
                            let totalLineWidth = 0;
                            line.forEach(seg => {
                                ctx.font = `${seg.isBold ? 'bold ' : ''}${baseFontSize}px ${TEXT_FONT_STACK}`;
                                totalLineWidth += ctx.measureText(seg.text).width;
                            });
                            if (data.textAlign === 'center') {
                                lx = (width - 16 - totalLineWidth) / 2;
                            } else if (data.textAlign === 'right') {
                                lx = width - 16 - totalLineWidth;
                            }
                        }

                        line.forEach(seg => {
                            ctx.fillStyle = seg.color || data.color || '#ef4444'; // ★保険: 万が一色を見失っても元の色を維持
                            ctx.font = `${seg.isBold ? 'bold ' : ''}${baseFontSize}px ${TEXT_FONT_STACK}`;
                            const segWidth = ctx.measureText(seg.text).width;
                            ctx.fillText(seg.text, lx, ly);

                            if (seg.isUnderline) {
                                // 下線はベースラインの少し下
                                ctx.fillRect(lx, ly + baseFontSize * 0.12, segWidth, Math.max(1, baseFontSize * 0.05));
                            }
                            if (seg.isStrike) {
                                // 取り消し線は文字の中ほど（ベースラインより上）
                                ctx.fillRect(lx, ly - baseFontSize * 0.30, segWidth, Math.max(1, baseFontSize * 0.05));
                            }
                            lx += segWidth;
                        });
                    });
                }
            }

            ctx.restore();
        }

        // 【改修】オリジナル画質での書き出し処理（PDF解像度対応）
        // 書き出しは1つだけ。今の画面の見た目（黒塗りを隠しているかどうか）そのままで出す。
        document.getElementById('btn-download-menu').addEventListener('click', () => runNativeExport());
        document.getElementById('btn-save-editable-pdf-menu').addEventListener('click', () => exportEditablePdf());

        async function runNativeExport() {
            saveDropdownMenu.classList.remove('show');
            if (uploadedImage.style.display === 'none' && pdfContainer.style.display === 'none') { alert('先に画像かPDFを新規作成で開いてください。'); return; }
            window.deselectCurrent(); brushCursor.style.display = 'none';
            
            const loadingOverlay = document.getElementById('loading-overlay');
            loadingOverlay.style.display = 'flex'; 
            setLoadingDetail('ネイティブ書き出し中...');
            
            await new Promise(resolve => setTimeout(resolve, 50)); 

            try {
                const state = window.historyArray[window.historyIndex] || { elements: [], canvasCommandsArray: [] };
                
                await Promise.all(state.elements.filter(el => el.type === 'image').map(el => {
                    return new Promise(res => {
                        const img = new Image();
                        img.onload = () => { el._cachedImg = img; res(); };
                        img.onerror = res;
                        img.src = el.dataUrl;
                    });
                }));
                
                if (uploadedImage.style.display === 'block') {
                    const natWidth = uploadedImage.naturalWidth;
                    const natHeight = uploadedImage.naturalHeight;
                    const cssWidth = parseFloat(uploadedImage.style.width);
                    const scaleRatio = natWidth / cssWidth; 

                    const exportCanvas = document.createElement('canvas');
                    exportCanvas.width = natWidth;
                    exportCanvas.height = natHeight;
                    const eCtx = exportCanvas.getContext('2d');
                    
                    eCtx.drawImage(uploadedImage, 0, 0, natWidth, natHeight);

                    // 手描き（ペン/消しゴム）は独立レイヤーで合成し、消しゴムが背景画像を削らないようにする
                    const cmds = state.canvasCommandsArray[0] || [];
                    if (cmds.length > 0) {
                        const penLayer = document.createElement('canvas');
                        penLayer.width = natWidth;
                        penLayer.height = natHeight;
                        const pCtx = penLayer.getContext('2d');
                        pCtx.scale(scaleRatio, scaleRatio);
                        await executeCanvasCommands(pCtx, cmds);
                        eCtx.drawImage(penLayer, 0, 0);
                    }

                    eCtx.scale(scaleRatio, scaleRatio);
                    for (const el of state.elements) {
                        await drawDOMElementToCanvas(eCtx, el);
                    }
                    
                    const link = document.createElement('a'); 
                    link.download = `${window.currentFileName}_マスキング.png`; 
                    link.href = exportCanvas.toDataURL('image/png'); 
                    link.click();

                } else if (pdfContainer.style.display === 'block') {
                    // 本命＝元PDFをラスタ化せず注釈だけ重ねる（劣化ゼロ・文字選択も生きる・サイズも元PDFとほぼ同じ）。
                    // pdf-lib が読めない／元PDFのバイト列が取れない／暗号化などで load に失敗した時だけ、
                    // 従来のラスタ化書き出し（exportPdfRaster）に自動で退避して機能を落とさない。
                    let usedVector = false;
                    if (typeof PDFLib !== 'undefined' && currentBackground && currentBackground.type === 'pdf' && currentBackground.dataURL) {
                        try {
                            await exportPdfVector(state, loadingOverlay);
                            usedVector = true;
                        } catch (e) {
                            console.warn('ベクタ書き出しに失敗。ラスタ化へ退避します:', e);
                        }
                    }
                    if (!usedVector) {
                        await exportPdfRaster(state, loadingOverlay);
                    }
                }
            } catch (error) {
                console.error("ダウンロードエラー:", error);
                alert("エラーが発生しました。");
            } finally {
                loadingOverlay.style.display = 'none';
            }
        }

        // 注釈だけを透明キャンバスに描き、元PDFのそのページへPNGとして重ねる。
        // page.render() を呼ばない＝元PDFの文字はベクタのまま残り、劣化ゼロ・文字選択も生きる。
        async function buildAnnotationCanvas(page, pageIndex, state) {
            // 注釈（黒塗り/図形/ペン/文字）の解像度。背景がベクタでくっきりな分、注釈のラスタが甘く見えるため
            // 従来の3.0から引き上げる。ただしキャンバスの最長辺を上限で抑えてメモリ暴走を防ぐ。
            const base1 = page.getViewport({ scale: 1.0 });
            const maxDim = Math.max(base1.width, base1.height);
            const OVERLAY_MAX_DIM = 4000; // 最長辺のピクセル上限
            const OVERLAY_SCALE = Math.max(3.0, Math.min(5.0, OVERLAY_MAX_DIM / maxDim));
            const renderViewport = page.getViewport({ scale: OVERLAY_SCALE }); // 表示と同じ向き（回転を含む）
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(renderViewport.width);
            canvas.height = Math.round(renderViewport.height);
            const ctx = canvas.getContext('2d'); // 背景は描かない＝透明のまま

            const drawScale = OVERLAY_SCALE / window.pdfBaseScale;

            // 手描き（ペン/消しゴム）は独立レイヤーで合成し、消しゴム(destination-out)が
            // 後続の描画へ残留しないようにする（従来のラスタ経路と同じ作法）。
            const cmds = state.canvasCommandsArray[pageIndex - 1] || [];
            if (cmds.length > 0) {
                const penLayer = document.createElement('canvas');
                penLayer.width = canvas.width;
                penLayer.height = canvas.height;
                const pCtx = penLayer.getContext('2d');
                pCtx.scale(drawScale, drawScale);
                await executeCanvasCommands(pCtx, cmds);
                ctx.drawImage(penLayer, 0, 0);
            }

            ctx.save();
            ctx.scale(drawScale, drawScale);
            const pageDiv = document.getElementById(`pdf-page-${pageIndex}`);
            const pageTop = pageDiv ? pageDiv.offsetTop : 0;
            ctx.translate(0, -pageTop);
            for (const el of state.elements) {
                await drawDOMElementToCanvas(ctx, el);
            }
            ctx.restore();
            return canvas;
        }

        // キャンバスが完全に透明（＝注釈が1つも乗っていない）かを、縮小版のアルファで安く判定する。
        function isCanvasBlank(canvas) {
            const probe = document.createElement('canvas');
            probe.width = 256;
            probe.height = 256;
            const pc = probe.getContext('2d');
            pc.drawImage(canvas, 0, 0, probe.width, probe.height);
            const data = pc.getImageData(0, 0, probe.width, probe.height).data;
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] !== 0) return false;
            }
            return true;
        }

        // CSSの色文字列を pdf-lib の rgb(0..1) と alpha に変換（共有canvasで全形式に対応）。
        const _colorCtx = document.createElement('canvas').getContext('2d');
        function parseCssColor(css, fallback) {
            try {
                _colorCtx.clearRect(0, 0, 1, 1);
                _colorCtx.fillStyle = fallback || '#000000';
                _colorCtx.fillStyle = css || fallback || '#000000';
                _colorCtx.fillRect(0, 0, 1, 1);
                const d = _colorCtx.getImageData(0, 0, 1, 1).data;
                return { r: d[0] / 255, g: d[1] / 255, b: d[2] / 255, a: d[3] / 255 };
            } catch (e) { return { r: 0, g: 0, b: 0, a: 1 }; }
        }

        // SVGパス文字列（このアプリは M / L / Q / Z のみ生成）を pdf-lib の描画オペレータへ。原点(ox,oy)へ平行移動。
        function svgPathToOps(L, d, ox, oy) {
            const toks = (d || '').match(/[a-zA-Z]|-?\d*\.?\d+(?:[eE]-?\d+)?/g) || [];
            const ops = []; let i = 0, cmd = '';
            const num = () => parseFloat(toks[i++]);
            while (i < toks.length) {
                if (/[a-zA-Z]/.test(toks[i])) { cmd = toks[i++]; }
                if (cmd === 'M') { const x = num(), y = num(); ops.push(L.moveTo(ox + x, oy + y)); cmd = 'L'; }
                else if (cmd === 'L') { const x = num(), y = num(); ops.push(L.lineTo(ox + x, oy + y)); }
                else if (cmd === 'Q') { const cxp = num(), cyp = num(), x = num(), y = num(); ops.push(L.appendQuadraticCurve(ox + cxp, oy + cyp, ox + x, oy + y)); }
                else if (cmd === 'Z' || cmd === 'z') { ops.push(L.closePath()); }
                else { i++; }
            }
            return ops;
        }

        // 本命：元PDFはベクタのまま、注釈もできる限りベクタで描き込む（劣化ゼロ・拡大に強い）。
        // 黒塗り/図形/手描きマスク/ペン線＝ベクタ、テキストと消しゴム入りのペン層＝高精細画像、
        // 貼り込んだ画像＝原寸で埋め込み。回転・CropBoxはページ毎の1枚のCTMで吸収する。
        async function exportPdfVector(state, loadingOverlay) {
            const L = PDFLib;
            const srcBytes = await (await fetch(currentBackground.dataURL)).arrayBuffer();
            const outDoc = await L.PDFDocument.load(srcBytes, { ignoreEncryption: true });
            const outPages = outDoc.getPages();

            // dataURL を pdf-lib の画像に（PNG/JPEGはそのまま、その他はcanvas経由でPNG化）。
            async function embedDataUrl(dataUrl) {
                if (/^data:image\/(png)/i.test(dataUrl)) {
                    return await outDoc.embedPng(dataUrl);
                } else if (/^data:image\/(jpe?g)/i.test(dataUrl)) {
                    return await outDoc.embedJpg(dataUrl);
                }
                const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = dataUrl; });
                const cv = document.createElement('canvas'); cv.width = img.naturalWidth || 1; cv.height = img.naturalHeight || 1;
                cv.getContext('2d').drawImage(img, 0, 0);
                const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
                return await outDoc.embedPng(new Uint8Array(await blob.arrayBuffer()));
            }
            // canvas を PNG 埋め込みに。
            async function embedCanvas(cv) {
                const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
                return await outDoc.embedPng(new Uint8Array(await blob.arrayBuffer()));
            }
            // E空間(左上原点・px・y下向き)の矩形へ画像を上向きで貼るオペレータ。
            function imageOps(outPage, img, ox, oy, w, h) {
                const name = outPage.node.newXObject('Img', img.ref);
                return [L.pushGraphicsState(), L.concatTransformationMatrix(w, 0, 0, -h, ox, oy + h), L.drawObject(name), L.popGraphicsState()];
            }

            const ST = 5; // テキスト等のラスタ部分の解像度倍率

            for (let i = 1; i <= totalPdfPages; i++) {
                setLoadingDetail(`PDFを生成中... (${i}/${totalPdfPages})`);
                await new Promise(r => setTimeout(r, 10));

                const page = await window.currentPdfDoc.getPage(i);
                const outPage = outPages[i - 1];

                // E空間(要素のスクリーンpx・ページ左上原点・y下向き) → pdf-lib ページ座標 のCTMを作る。
                // pdf.js の viewport.transform(user→表示px) を逆にし、pdfBaseScale と MediaBox原点を織り込む。
                const vp1 = page.getViewport({ scale: 1.0 });
                const V = vp1.transform; // [a,b,c,d,e,f]
                const mb = outPage.getMediaBox();
                const s = 1 / window.pdfBaseScale;
                const det = V[0] * V[3] - V[1] * V[2];
                const ia = V[3] / det, ib = -V[1] / det, ic = -V[2] / det, id = V[0] / det;
                const ie = (V[2] * V[5] - V[3] * V[4]) / det, iff = (V[1] * V[4] - V[0] * V[5]) / det;
                const N = { a: ia * s, b: ib * s, c: ic * s, d: id * s, e: ie - mb.x, f: iff - mb.y };

                const pageDiv = document.getElementById(`pdf-page-${i}`);
                const pageTop = pageDiv ? pageDiv.offsetTop : 0;
                const dispW = vp1.width * window.pdfBaseScale;  // ページ表示幅(px)
                const dispH = vp1.height * window.pdfBaseScale; // ページ表示高(px)

                // multiply / 半透明 の ExtGState をページ毎に一度だけ登録して名前を再利用。
                let mulName = null; const getMul = () => { if (!mulName) mulName = outPage.node.newExtGState('GS', outDoc.context.register(outDoc.context.obj({ Type: 'ExtGState', BM: 'Multiply' }))); return mulName; };
                const alphaNames = {}; const getAlpha = (o) => { const k = o.toFixed(3); if (!alphaNames[k]) alphaNames[k] = outPage.node.newExtGState('GS', outDoc.context.register(outDoc.context.obj({ Type: 'ExtGState', ca: o, CA: o }))); return alphaNames[k]; };

                const body = []; // クリップの内側に積む描画オペレータ
                const yHit = (top, h) => !((top + h) < pageTop || top > (pageTop + dispH)); // このページに掛かるか

                // --- ペン層（最背面）。消しゴム/旧base64があれば正しく合成するため高精細ラスタ、無ければベクタ線。
                const cmds = state.canvasCommandsArray[i - 1] || [];
                if (cmds.length > 0) {
                    const needsRaster = cmds.some(c => c.tool && c.tool !== 'pen');
                    if (needsRaster) {
                        // ペン点はページ内ローカルpx。高精細のためスクリーンpxをST倍で焼く。
                        const pcv = document.createElement('canvas');
                        pcv.width = Math.max(1, Math.round(dispW * ST));
                        pcv.height = Math.max(1, Math.round(dispH * ST));
                        const pctx = pcv.getContext('2d');
                        pctx.scale(ST, ST);
                        await executeCanvasCommands(pctx, cmds);
                        const img = await embedCanvas(pcv);
                        body.push(...imageOps(outPage, img, 0, 0, dispW, dispH));
                    } else {
                        for (const cmd of cmds) {
                            const pts = cmd.points; if (!pts || pts.length === 0) continue;
                            const col = parseCssColor(cmd.color, '#000000');
                            const o = (cmd.opacity === undefined) ? 1 : parseFloat(cmd.opacity);
                            const seg = [L.pushGraphicsState()];
                            if (o < 1) seg.push(L.setGraphicsState(getAlpha(o)));
                            seg.push(L.setStrokingColor(L.rgb(col.r, col.g, col.b)), L.setLineWidth(cmd.width), L.setLineCap(L.LineCapStyle.Round), L.setLineJoin(L.LineJoinStyle.Round));
                            seg.push(L.moveTo(pts[0].x, pts[0].y));
                            if (pts.length < 3) {
                                seg.push(L.lineTo((pts[1] || pts[0]).x + 0.01, (pts[1] || pts[0]).y + 0.01));
                            } else {
                                for (let k = 1; k < pts.length - 1; k++) {
                                    const mx = (pts[k].x + pts[k + 1].x) / 2, my = (pts[k].y + pts[k + 1].y) / 2;
                                    seg.push(L.appendQuadraticCurve(pts[k].x, pts[k].y, mx, my));
                                }
                                seg.push(L.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y));
                            }
                            seg.push(L.stroke(), L.popGraphicsState());
                            body.push(...seg);
                        }
                    }
                }

                // --- 要素をz順に。ベクタで描けるものはベクタ、テキスト/画像はラスタ埋め込み。
                for (const data of state.elements) {
                    if (window.isMasksHidden && (data.type === 'mask' || data.type === 'freehand-mask')) continue;
                    const left = parseFloat(data.left || 0);
                    const top = parseFloat(data.top || 0);
                    let w = parseFloat(data.width); if (isNaN(w)) w = 300;
                    let h = parseFloat(data.height); if (isNaN(h)) h = 100;
                    if (!yHit(top, h)) continue;
                    const ox = left, oy = top - pageTop; // E空間の要素原点

                    if (data.type === 'mask') {
                        const c = parseCssColor(data.color, 'black');
                        body.push(L.pushGraphicsState(), L.setFillingColor(L.rgb(c.r, c.g, c.b)), L.rectangle(ox, oy, w, h), L.fill(), L.popGraphicsState());
                    } else if (data.type === 'highlight') {
                        const c = parseCssColor(data.backgroundColor, '#ffff00');
                        body.push(L.pushGraphicsState(), L.setGraphicsState(getMul()), L.setFillingColor(L.rgb(c.r, c.g, c.b)), L.rectangle(ox, oy, w, h), L.fill(), L.popGraphicsState());
                    } else if (data.type === 'freehand-mask') {
                        const c = parseCssColor(data.color, 'black');
                        body.push(L.pushGraphicsState(), L.setStrokingColor(L.rgb(c.r, c.g, c.b)), L.setLineWidth(parseFloat(data.strokeWidth || 15)), L.setLineCap(L.LineCapStyle.Round), L.setLineJoin(L.LineJoinStyle.Round), ...svgPathToOps(L, data.pathD, ox, oy), L.stroke(), L.popGraphicsState());
                    } else if (data.type === 'freehand-highlight') {
                        const c = parseCssColor(data.color, '#ffff00');
                        body.push(L.pushGraphicsState(), L.setGraphicsState(getMul()), L.setStrokingColor(L.rgb(c.r, c.g, c.b)), L.setLineWidth(parseFloat(data.strokeWidth || 20)), L.setLineCap(L.LineCapStyle.Round), L.setLineJoin(L.LineJoinStyle.Round), ...svgPathToOps(L, data.pathD, ox, oy), L.stroke(), L.popGraphicsState());
                    } else if (data.type === 'shape') {
                        const c = parseCssColor(data.color, '#ef4444');
                        const seg = [L.pushGraphicsState(), L.setStrokingColor(L.rgb(c.r, c.g, c.b)), L.setLineWidth(parseFloat(data.strokeWidth || 3))];
                        if (data.shapeType === 'rect') {
                            seg.push(L.rectangle(ox, oy, w, h), L.stroke());
                        } else if (data.shapeType === 'circle') {
                            const K = 0.5522847498, rx = w / 2, ry = h / 2, mxc = ox + rx, myc = oy + ry;
                            seg.push(L.moveTo(mxc, oy));
                            seg.push(L.appendBezierCurve(mxc + K * rx, oy, ox + w, myc - K * ry, ox + w, myc));
                            seg.push(L.appendBezierCurve(ox + w, myc + K * ry, mxc + K * rx, oy + h, mxc, oy + h));
                            seg.push(L.appendBezierCurve(mxc - K * rx, oy + h, ox, myc + K * ry, ox, myc));
                            seg.push(L.appendBezierCurve(ox, myc - K * ry, mxc - K * rx, oy, mxc, oy));
                            seg.push(L.stroke());
                        } else if (data.shapeType === 'line') {
                            if (data.lineDir === '/') { seg.push(L.moveTo(ox, oy + h), L.lineTo(ox + w, oy)); }
                            else { seg.push(L.moveTo(ox, oy), L.lineTo(ox + w, oy + h)); }
                            seg.push(L.stroke());
                        }
                        seg.push(L.popGraphicsState());
                        body.push(...seg);
                    } else if (data.type === 'image') {
                        if (data.dataUrl) {
                            const img = await embedDataUrl(data.dataUrl);
                            body.push(...imageOps(outPage, img, ox, oy, w, h));
                        }
                    } else if (data.type === 'text') {
                        const tcv = document.createElement('canvas');
                        tcv.width = Math.max(1, Math.round(w * ST));
                        tcv.height = Math.max(1, Math.round(h * ST));
                        const tctx = tcv.getContext('2d');
                        tctx.scale(ST, ST);
                        await drawDOMElementToCanvas(tctx, { ...data, left: 0, top: 0 });
                        const img = await embedCanvas(tcv);
                        body.push(...imageOps(outPage, img, ox, oy, w, h));
                    }
                }

                // このページに描くものが無ければ、元ページを一切触らない（サイズも増やさない）。
                if (body.length === 0) continue;

                const ops = [
                    L.pushGraphicsState(),
                    L.concatTransformationMatrix(N.a, N.b, N.c, N.d, N.e, N.f),
                    L.rectangle(0, 0, dispW, dispH), L.clip(), L.endPath(),
                    ...body,
                    L.popGraphicsState(),
                ];
                outPage.pushOperators(...ops);
            }

            const outBytes = await outDoc.save();
            const blob = new Blob([outBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.download = `${window.currentFileName}_マスキング.pdf`;
            link.href = url;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
        }

        // 退避経路：pdf-lib が使えない時だけ従来どおりページ全体をラスタ化して貼る（画質は落ちるが確実に出る）。
        async function exportPdfRaster(state, loadingOverlay) {
            const { jsPDF } = window.jspdf;
            let pdf = null;
            const EXPORT_RENDER_SCALE = 3.0;

            for (let i = 1; i <= totalPdfPages; i++) {
                setLoadingDetail(`PDFを生成中... (${i}/${totalPdfPages})`);
                await new Promise(r => setTimeout(r, 10));

                const page = await window.currentPdfDoc.getPage(i);
                const originalViewport = page.getViewport({ scale: 1.0 });
                const renderViewport = page.getViewport({ scale: EXPORT_RENDER_SCALE });

                const exportCanvas = document.createElement('canvas');
                exportCanvas.width = renderViewport.width;
                exportCanvas.height = renderViewport.height;
                const eCtx = exportCanvas.getContext('2d');

                await page.render({ canvasContext: eCtx, viewport: renderViewport }).promise;

                eCtx.save();
                const drawScale = EXPORT_RENDER_SCALE / window.pdfBaseScale;
                const cmds = state.canvasCommandsArray[i-1] || [];
                if (cmds.length > 0) {
                    const penLayer = document.createElement('canvas');
                    penLayer.width = exportCanvas.width;
                    penLayer.height = exportCanvas.height;
                    const pCtx = penLayer.getContext('2d');
                    pCtx.scale(drawScale, drawScale);
                    await executeCanvasCommands(pCtx, cmds);
                    eCtx.drawImage(penLayer, 0, 0);
                }

                eCtx.scale(drawScale, drawScale);
                const pageDiv = document.getElementById(`pdf-page-${i}`);
                const pageTop = pageDiv ? pageDiv.offsetTop : 0;
                eCtx.translate(0, -pageTop);
                for (const el of state.elements) {
                    await drawDOMElementToCanvas(eCtx, el);
                }
                eCtx.restore();

                const imgData = exportCanvas.toDataURL('image/jpeg', 0.9);
                if (!pdf) {
                    pdf = new jsPDF(originalViewport.width > originalViewport.height ? 'l' : 'p', 'pt', [originalViewport.width, originalViewport.height]);
                } else {
                    pdf.addPage([originalViewport.width, originalViewport.height], originalViewport.width > originalViewport.height ? 'l' : 'p');
                }
                pdf.addImage(imgData, 'JPEG', 0, 0, originalViewport.width, originalViewport.height);
            }
            pdf.save(`${window.currentFileName}_マスキング.pdf`);
        }

        // --- 画像貼り付け・生成機能 ---
        window.createImageElement = function(left, top, width, height, dataUrl) {
            const wrapper = document.createElement('div');
            wrapper.className = 'canvas-element image-element';
            wrapper.style.left = left; wrapper.style.top = top;
            wrapper.style.width = width; wrapper.style.height = height;

            const img = document.createElement('img');
            img.src = dataUrl;
            img.draggable = false;
            wrapper.appendChild(img);

            addResizeHandles(wrapper);
            window.bringToFront(wrapper);
            workspace.appendChild(wrapper);
            return wrapper;
        };

        // at を渡すと、その位置（ワークスペース座標）を画像の左上に合わせる。
        // 渡さなければ従来どおり表示中の領域の中央に置く。
        function insertImageToWorkspace(dataUrl, at) {
            const img = new Image();
            img.onload = () => {
                let w = img.width; let h = img.height;
                const maxDim = 300; 
                if (w > maxDim || h > maxDim) {
                    if (w > h) { h = h * (maxDim / w); w = maxDim; }
                    else { w = w * (maxDim / h); h = maxDim; }
                }
                const containerW = workspaceContainer.clientWidth;
                const containerH = workspaceContainer.clientHeight;
                const oldMarginLeft = parseFloat(workspaceWrapper.style.marginLeft) || 0;
                const oldMarginTop = parseFloat(workspaceWrapper.style.marginTop) || 0;
                const centerX = (workspaceContainer.scrollLeft + containerW / 2 - oldMarginLeft) / zoomLevel;
                const centerY = (workspaceContainer.scrollTop + containerH / 2 - oldMarginTop) / zoomLevel;

                const left = (at ? at.x : centerX - w / 2) + 'px';
                const top = (at ? at.y : centerY - h / 2) + 'px';

                const newImgEl = window.createImageElement(left, top, w + 'px', h + 'px', dataUrl);
                window.deselectCurrent();
                selectedElements = [newImgEl];
                newImgEl.classList.add('selected');
                
                document.getElementById('tool-select').checked = true;
                currentTool = 'select';
                updateToolbar();
                workspaceContainer.className = ''; 
                workspaceContainer.classList.add('tool-select');
                
                window.saveState();
            };
            img.src = dataUrl;
        }

        const overlayImageInput = document.getElementById('overlayImageInput');
        if (document.getElementById('btn-add-image')) {
            document.getElementById('btn-add-image').addEventListener('click', () => { overlayImageInput.click(); });
        }
        if (overlayImageInput) {
            overlayImageInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = (event) => { insertImageToWorkspace(event.target.result); e.target.value = ''; };
                reader.readAsDataURL(file);
            });
        }

        // クリップボードからのペースト(Ctrl+V)に対応
        document.addEventListener('paste', (e) => {
            if (isTypingTarget(e.target)) return;
            const data = e.clipboardData || e.originalEvent.clipboardData;
            // 直前のコピーがアプリ内なら、OS クリップボードに古い画像が残っていても
            // そちらを見ない（見てしまうと「コピーしたはずの図形が貼れない」ことになる）
            if (hasClipboard() && isOwnClipboard(data)) {
                e.preventDefault(); pasteClipboard(); return;
            }
            const items = data.items;
            let handledImage = false;
            for (let index in items) {
                const item = items[index];
                if (item.kind === 'file' && item.type.startsWith('image/')) {
                    const blob = item.getAsFile();
                    const at = lastMouseWs ? { x: lastMouseWs.x, y: lastMouseWs.y } : null;
                    const reader = new FileReader();
                    reader.onload = (event) => { insertImageToWorkspace(event.target.result, at); };
                    reader.readAsDataURL(blob);
                    handledImage = true;
                }
            }
            // OS クリップボードに画像が無ければ、アプリ内クリップボード(図形・マスク等)を貼る
            if (!handledImage && hasClipboard()) { e.preventDefault(); pasteClipboard(); }
        });

        // --- ファイルのドラッグ&ドロップで開く（画像/PDF→新規作成、.amk→データ読込） ---
        (function setupDropZone() {
            const zone = document.getElementById('workspace-outer');
            if (!zone) return;
            ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, (e) => {
                if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    zone.classList.add('drag-over');
                }
            }));
            ['dragleave', 'dragend'].forEach(ev => zone.addEventListener(ev, (e) => {
                if (e.target === zone) zone.classList.remove('drag-over');
            }));
            zone.addEventListener('drop', (e) => {
                e.preventDefault();
                zone.classList.remove('drag-over');
                const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
                if (!f) return;
                const isProject = f.name.toLowerCase().endsWith('.amk');
                const input = document.getElementById(isProject ? 'projectInput' : 'imageInput');
                if (!input) return;
                const dt = new DataTransfer();
                dt.items.add(f);
                input.files = dt.files;
                input.dispatchEvent(new Event('change'));
            });
        })();

        // 起動直後は履歴が無いので undo/redo を無効表示にしておく
        updateHistoryButtons();

        // --- データ損失防止：離脱警告 ＋ 前回作業の復元 ---
        // 自動保存が完了する前（編集直後）に閉じた場合のみ警告する
        window.addEventListener('beforeunload', (e) => {
            if (isDirty) { e.preventDefault(); e.returnValue = ''; }
        });

        function showRestoreBanner(projectData) {
            const bar = document.createElement('div');
            bar.id = 'restore-banner';
            bar.innerHTML =
                '<span class="material-symbols-outlined">history</span>' +
                '<span>前回の作業データが残っています。復元しますか？</span>' +
                '<button class="btn btn-primary" id="restore-yes">復元する</button>' +
                '<button class="btn" id="restore-no">破棄</button>';
            document.body.appendChild(bar);

            document.getElementById('restore-yes').addEventListener('click', async () => {
                bar.remove();
                const loadingOverlay = document.getElementById('loading-overlay');
                loadingOverlay.style.display = 'flex';
                setLoadingDetail('データを復元中...');
                try {
                    window.setCurrentFileName(projectData.fileName);
                    await applyProjectData(projectData);
                } catch (err) {
                    console.error(err);
                    alert("前回データの復元に失敗しました。");
                }
                loadingOverlay.style.display = 'none';
            });

            document.getElementById('restore-no').addEventListener('click', async () => {
                bar.remove();
                try { await idbDel('session'); await idbDel('background'); }
                catch (err) { console.error(err); }
            });
        }

        (async function checkAutosaveRestore() {
            try {
                const session = await idbGet('session');
                const background = await idbGet('background');
                if (!session || !background) return;
                showRestoreBanner({ ...session, background });
            } catch (err) { console.error('自動保存データの読み込みに失敗しました', err); }
        })();
