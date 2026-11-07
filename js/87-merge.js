// 暗記マーカーの結合（11-07 Rayan様）。行をまたぐ答えなどを2つ以上のマーカーで隠した時、
// 1つの物として選び・動かし・めくれるようにする。結合は同じ印（data-group）を付けるだけで、
// マーカー自体は今までどおり1つずつ残る（保存・書き出しはそのまま）。
// ボタンは、マーカーを2つ以上選んだ時だけ、選んだ枠の右上に浮かべる（案A）。
(() => {
    const isMask = (el) => el.classList.contains('mask');
    const members = (gid) => Array.from(workspace.querySelectorAll('.canvas-element.mask')).filter(el => el.dataset.group === gid);

    // 結合したマーカーの1つを選んだら、仲間も全部選ぶ
    window.expandGroupSelection = function() {
        const add = [];
        selectedElements.forEach(el => {
            if (!el.dataset.group) return;
            members(el.dataset.group).forEach(m => {
                if (!selectedElements.includes(m) && !add.includes(m)) add.push(m);
            });
        });
        add.forEach(m => { m.classList.add('selected'); selectedElements.push(m); });
    };
    // Ctrl で選択から外す時は、仲間ごと外す
    window.groupOf = (el) => el && el.dataset.group ? members(el.dataset.group) : [el];

    // 複製・貼り付けで増えた物は、元とは別の結合にする（同じ印のままだと元と一緒にめくれる）
    window.remapGroups = function(els) {
        const map = {};
        els.forEach(el => {
            const g = el.dataset.group;
            if (!g) return;
            if (!map[g]) map[g] = newId();
            el.dataset.group = map[g];
        });
    };
    function newId() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    // 今の選択が「結合した1つ」ちょうどか
    function selectionIsOneGroup() {
        if (selectedElements.length < 2) return false;
        const g = selectedElements[0].dataset.group;
        if (!g || !selectedElements.every(el => el.dataset.group === g)) return false;
        return members(g).length === selectedElements.length;
    }
    function canMerge() {
        if (selectedElements.length < 2 || !selectedElements.every(isMask)) return false;
        if (typeof selectedStrokes !== 'undefined' && selectedStrokes.length) return false;
        return !selectionIsOneGroup();
    }

    function merge() {
        const id = newId();
        selectedElements.forEach(el => { el.dataset.group = id; });
        window.track('merge_masks', { count: selectedElements.length });
        window.saveState();
        refresh();
    }
    function unmerge() {
        selectedElements.forEach(el => { delete el.dataset.group; });
        window.track('unmerge_masks');
        window.saveState();
        refresh();
    }

    let pill = null;
    function ensurePill() {
        if (pill && pill.isConnected) return pill;
        pill = document.createElement('button');
        pill.type = 'button';
        pill.id = 'merge-pill';
        // 押しても紙の側の「押した」（選択の解除・範囲選択）に流さない
        pill.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); });
        pill.addEventListener('click', (e) => {
            e.stopPropagation();
            if (pill.dataset.mode === 'unmerge') unmerge(); else merge();
        });
        workspace.appendChild(pill);
        return pill;
    }

    function refresh() {
        const box = document.getElementById('multi-sel-box');
        const one = selectionIsOneGroup();
        workspace.classList.toggle('merged-sel', one);
        if (box) box.classList.toggle('merged', one);
        const show = box && box.style.display !== 'none' && !document.body.classList.contains('focus-mode') && (one || canMerge());
        if (!show) { if (pill) pill.style.display = 'none'; return; }
        const p = ensurePill();
        p.dataset.mode = one ? 'unmerge' : 'merge';
        p.innerHTML = one
            ? '<span class="material-symbols-outlined">link_off</span>結合を解除'
            : '<span class="material-symbols-outlined">link</span>結合';
        p.title = one ? '1つずつのマーカーに戻します' : '選んだマーカーを1つにまとめます。1回押すと全部めくれます';
        p.style.display = 'flex';
        p.style.left = (parseFloat(box.style.left) + parseFloat(box.style.width)) + 'px';
        p.style.top = parseFloat(box.style.top) + 'px';
    }

    // 複数選択の枠が動くたびに、ボタンも付いていく
    const orig = window.updateMultiSelBox;
    window.updateMultiSelBox = function() { orig(); refresh(); };

    // マウスを乗せてめくる時も、仲間を一緒にめくる
    workspace.addEventListener('mouseover', (e) => {
        const m = e.target.closest && e.target.closest('.mask[data-group]');
        if (m) members(m.dataset.group).forEach(x => x.classList.add('grp-hover'));
    });
    workspace.addEventListener('mouseout', (e) => {
        const m = e.target.closest && e.target.closest('.mask[data-group]');
        if (!m) return;
        if (e.relatedTarget && m.contains(e.relatedTarget)) return;
        members(m.dataset.group).forEach(x => x.classList.remove('grp-hover'));
    });
    // 指でめくる時（60-input.js）に使う
    window.toggleRevealGroup = function(m) {
        const on = !m.classList.contains('revealed');
        window.groupOf(m).forEach(x => x.classList.toggle('revealed', on));
    };
})();
