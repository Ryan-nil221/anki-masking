// ===== 00-base.js : 起動時の変数・ヘッダーのメニュー・狭い画面(compact-ui) =====
// app.js を分割したもの。素のスクリプトなので変数は全ファイルで共有される。
// index.html の読み込み順を変えると壊れる。

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

