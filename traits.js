/* Trait explorer for traits.html
   Data: Hopper et al. (2023) freshwater mussel trait dataset, filtered to the Atlantic slope. */
(function () {
    'use strict';

    // Site palette (matches style.css :root)
    var C = {
        ocean: '#005F73', teal: '#0A9396', sage: '#94D2BD', amber: '#EE9B00',
        rust: '#CA6702', berry: '#9B2226', text: '#1D3557', muted: '#5b6b7a',
        grid: '#e3eee9', ring: '#9fb3ad', ok: '#2D6A4F', warn: '#c27c00', bad: '#AE2012'
    };

    var COLS = [
        ['Substrate', 'mud', 'Mud'], ['Substrate', 'sand', 'Sand'], ['Substrate', 'claySilt', 'Clay / silt'],
        ['Substrate', 'gravel', 'Gravel'], ['Substrate', 'pebble', 'Pebble'], ['Substrate', 'cobble', 'Cobble'],
        ['Substrate', 'boulder', 'Boulder'], ['Substrate', 'bedrock', 'Bedrock'], ['Substrate', 'macrophyte', 'Macrophytes'],
        ['Waterbody', 'largeRiver', 'Large river'], ['Waterbody', 'smallRiver', 'Small river'], ['Waterbody', 'creek', 'Creek'], ['Waterbody', 'lacustrine', 'Lake'],
        ['Current', 'slowCurrent', 'Slow'], ['Current', 'moderateCurrent', 'Moderate'], ['Current', 'fastCurrent', 'Fast'],
        ['Life history', 'shellSculpture', 'Sculptured shell'], ['Life history', 'hermaphrodite', 'Hermaphrodite'],
        ['Life history', 'broodLongTerm', 'Long-term brooder']
    ].map(function (c) { return { group: c[0], key: c[1], label: c[2] }; });
    var GROUPS = ['Substrate', 'Waterbody', 'Current', 'Life history'];

    var HOSTS = ['mantle lure', 'conglutinate', 'broadcast', 'kinetic lure', 'sacrifice'];
    var HOST_COLORS = { 'mantle lure': C.ocean, 'conglutinate': C.amber, 'broadcast': C.teal, 'kinetic lure': C.rust, 'sacrifice': C.berry };
    var RANKS = [
        ['G1–G2 imperiled', ['G1', 'G2']], ['G3 vulnerable', ['G3']], ['G4–G5 secure', ['G4', 'G5']],
        ['GH / GX possibly extinct', ['GH', 'GX']], ['GU / GNR unranked', ['GU', 'GNR']]
    ];
    var RANK_ORDER = { GX: 0, GH: 0, G1: 1, G2: 2, G3: 3, G4: 4, G5: 5, GU: 6, GNR: 7 };

    var state = { scope: 'all', sort: 'genus' };
    var DATA = [], RI = [];

    // ---------- helpers ----------
    function parseCSV(text) {
        var rows = [], row = [], cell = '', q = false;
        for (var i = 0; i < text.length; i++) {
            var ch = text[i];
            if (q) {
                if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
                else if (ch === '"') q = false;
                else cell += ch;
            } else if (ch === '"') q = true;
            else if (ch === ',') { row.push(cell); cell = ''; }
            else if (ch === '\n' || ch === '\r') {
                if (ch === '\r' && text[i + 1] === '\n') i++;
                row.push(cell); rows.push(row); row = []; cell = '';
            } else cell += ch;
        }
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
        var head = rows.shift();
        return rows.filter(function (r) { return r.length === head.length; }).map(function (r) {
            var o = {}; head.forEach(function (h, j) { o[h] = r[j]; }); return o;
        });
    }
    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function svgEl(tag, attrs) {
        var e = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (var k in attrs) e.setAttribute(k, attrs[k]);
        return e;
    }
    function len(r) { return r.maxLength === '' || r.maxLength == null ? null : +r.maxLength; }
    function isListed(r) { return r.federalStatus === 'endangered' || r.federalStatus === 'threatened'; }
    function rankColor(g) {
        if (/^G[12]$|^GH$|^GX$/.test(g)) return C.bad;
        if (g === 'G3') return C.warn;
        if (/^G[45]$/.test(g)) return C.ok;
        return C.muted;
    }
    function inScope(r) { return state.scope === 'all' || r[state.scope] === '1'; }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function fmtLen(v) { return Math.round(v).toLocaleString(); }

    // ---------- legends ----------
    function drawLegends() {
        document.querySelectorAll('.trait-legend').forEach(function (box) {
            box.replaceChildren();
            function item(swatchCls, color, text) {
                var s = el('span');
                var k = el('i', 'trait-key ' + swatchCls);
                if (color) k.style.background = color;
                s.append(k, document.createTextNode(text));
                box.appendChild(s);
            }
            item('dot', C.ocean, 'Recorded');
            item('ring', null, 'Recorded as absent');
            item('endemic', null, 'Atlantic-only endemic');
            if (box.getAttribute('data-legend') === 'full') box.appendChild(el('span', null, '† Federally endangered or threatened'));
            HOSTS.slice(0, 4).forEach(function (h) { item('', HOST_COLORS[h], cap(h)); });
        });
    }

    // ---------- trait matrix ----------
    function drawMatrix(container, rows, bands) {
        container.replaceChildren();
        var cell = 20, rowH = 22, labelW = 220, top = 138, gap = 12;
        var x = labelW, colX = [];
        COLS.forEach(function (c, i) {
            if (i > 0 && c.group !== COLS[i - 1].group) x += gap;
            colX.push(x + cell / 2); x += cell;
        });
        var lenX = x + 52, lenW = 104, hostX = lenX + lenW + 24, rankX = hostX + 34;
        var W = rankX + 50, H = top + rows.length * rowH + 8;
        var maxLen = Math.max(260, Math.max.apply(null, DATA.map(function (r) { return len(r) || 0; })));
        function ls(v) { return (v / maxLen) * lenW; }

        var svg = svgEl('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Trait matrix for ' + rows.length + ' species' });
        function text(xx, yy, t, style, extra) {
            var n = svgEl('text', Object.assign({ x: xx, y: yy }, extra || {}));
            n.textContent = t;
            Object.assign(n.style, style || {});
            svg.appendChild(n);
            return n;
        }

        if (bands) {
            var band = 0, prev = null;
            rows.forEach(function (r, i) {
                if (r.genus !== prev) { band++; prev = r.genus; }
                if (band % 2 === 0) svg.appendChild(svgEl('rect', { x: 0, y: top + i * rowH, width: W, height: rowH, fill: C.grid, opacity: 0.6 }));
            });
        }

        GROUPS.forEach(function (g) {
            var idx = COLS.map(function (c, i) { return c.group === g ? i : -1; }).filter(function (i) { return i >= 0; });
            var x0 = colX[idx[0]] - cell / 2, x1 = colX[idx[idx.length - 1]] + cell / 2;
            text(x0, 14, g, { fill: C.ocean, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' });
            svg.appendChild(svgEl('line', { x1: x0, x2: x1, y1: 22, y2: 22, stroke: C.sage, 'stroke-width': 2 }));
        });
        [['Max length (mm)', lenX], ['Host', hostX - 6], ['Rank', rankX - 2]].forEach(function (h) {
            text(h[1], 14, h[0], { fill: C.ocean, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' });
        });
        COLS.forEach(function (c, i) {
            text(0, 0, c.label, { fill: C.muted, fontSize: '11px' }, { transform: 'translate(' + (colX[i] + 3) + ',' + (top - 6) + ') rotate(-60)' });
        });
        [0, 100, 200].forEach(function (v) {
            svg.appendChild(svgEl('line', { x1: lenX + ls(v), x2: lenX + ls(v), y1: top - 4, y2: H - 8, stroke: C.grid }));
            text(lenX + ls(v), top - 8, String(v), { fill: C.muted, fontSize: '10px' }, { 'text-anchor': 'middle' });
        });

        rows.forEach(function (r, i) {
            var y = top + i * rowH, cy = y + rowH / 2;
            if (r.endemic === '1') svg.appendChild(svgEl('rect', { x: 2, y: cy - 3.5, width: 7, height: 7, fill: C.muted }));
            var nm = svgEl('text', { x: 14, y: cy + 4 });
            nm.style.fontSize = '12.5px'; nm.style.fill = C.text;
            var sp = svgEl('tspan', {}); sp.style.fontStyle = 'italic'; sp.textContent = r.species; nm.appendChild(sp);
            if (isListed(r)) { var d = svgEl('tspan', {}); d.textContent = ' †'; nm.appendChild(d); }
            svg.appendChild(nm);
            COLS.forEach(function (c, j) {
                var v = r[c.key];
                if (v === '1') svg.appendChild(svgEl('circle', { cx: colX[j], cy: cy, r: 5.5, fill: C.ocean }));
                else if (v === '0') svg.appendChild(svgEl('circle', { cx: colX[j], cy: cy, r: 3, fill: 'none', stroke: C.ring, 'stroke-width': 1.5 }));
            });
            var L = len(r);
            if (L != null) svg.appendChild(svgEl('rect', { x: lenX, y: cy - 4, width: Math.max(1, ls(L)), height: 8, rx: 2, fill: C.teal }));
            else text(lenX, cy + 4, 'no data', { fill: C.muted, fontSize: '10px' });
            if (r.hostInfection) svg.appendChild(svgEl('rect', { x: hostX - 5, y: cy - 5, width: 10, height: 10, rx: 2, fill: HOST_COLORS[r.hostInfection] || C.muted }));
            text(rankX, cy + 4, r.gRank || '', { fill: rankColor(r.gRank), fontSize: '11px', fontWeight: 700 });
            var hit = svgEl('rect', { x: 0, y: y, width: W, height: rowH, fill: 'transparent', 'data-i': i, class: 'trait-hit' });
            svg.appendChild(hit);
        });
        var hl = svgEl('rect', { x: 0, width: W, height: rowH, fill: 'none', stroke: C.amber, 'stroke-width': 1.5, 'pointer-events': 'none' });
        hl.style.display = 'none';
        svg.appendChild(hl);
        container.appendChild(svg);

        var tip = el('div', 'trait-tip'); tip.hidden = true; container.appendChild(tip);
        function show(ev, i) {
            var r = rows[i], L = len(r);
            var areas = [r.north === '1' ? 'Northern Atlantic' : null, r.south === '1' ? 'Southern Atlantic' : null].filter(Boolean).join(' and ');
            tip.replaceChildren(
                el('strong', null, r.species),
                el('div', 'm', r.commonName),
                el('div', null, 'Max length: ' + (L != null ? fmtLen(L) + ' mm' : 'no data')),
                el('div', null, 'Host strategy: ' + (r.hostInfection || 'not recorded') + (r.nHostSpecies ? ' · ' + (+r.nHostSpecies) + ' host species known' : '')),
                el('div', null, 'NatureServe ' + (r.gRank || 'unranked') + ' · federal: ' + (r.federalStatus || 'unknown')),
                el('div', 'm', areas + (r.endemic === '1' ? ' only (Atlantic endemic)' : ', also outside the Atlantic slope'))
            );
            tip.hidden = false;
            hl.style.display = ''; hl.setAttribute('y', top + i * rowH);
            var b = container.getBoundingClientRect();
            var tx = ev.clientX - b.left + 14, ty = ev.clientY - b.top + 14;
            if (tx + tip.offsetWidth > W - 4) tx = ev.clientX - b.left - tip.offsetWidth - 14;
            if (ty + tip.offsetHeight > H) ty = ev.clientY - b.top - tip.offsetHeight - 10;
            tip.style.left = Math.max(0, tx) + 'px';
            tip.style.top = Math.max(0, ty) + 'px';
        }
        svg.addEventListener('pointermove', function (ev) {
            var t = ev.target;
            if (t.classList && t.classList.contains('trait-hit')) show(ev, +t.getAttribute('data-i'));
        });
        svg.addEventListener('pointerleave', function () { tip.hidden = true; hl.style.display = 'none'; });
    }

    // ---------- bar lists ----------
    function barList(box, rows) {
        box.replaceChildren();
        rows.forEach(function (r) {
            var row = el('div', 'trait-bar');
            var lab = el('div', 'lab');
            if (r.color) { var k = el('i', 'trait-key'); k.style.background = r.color; lab.appendChild(k); }
            lab.appendChild(el('span', null, r.label));
            var track = el('div', 'track'), fill = el('div', 'fill');
            fill.style.width = (r.total ? (100 * r.n) / r.total : 0) + '%';
            fill.style.background = r.color || C.ocean;
            track.appendChild(fill);
            var val = el('div', 'val');
            val.append(el('span', null, r.total ? Math.round((100 * r.n) / r.total) + '%' : '–'), el('span', 'm', ' ' + r.n + '/' + r.total));
            row.append(lab, track, val);
            box.appendChild(row);
        });
    }

    // ---------- Atlantic panel ----------
    function drawAtlantic() {
        var rows = DATA.filter(inScope);
        var endemic = rows.filter(function (r) { return r.endemic === '1'; }).length;
        var listed = rows.filter(isListed).length;
        var subs = COLS.filter(function (c) { return c.group === 'Substrate'; }).map(function (c) {
            return { label: c.label, n: rows.filter(function (r) { return r[c.key] === '1'; }).length };
        }).sort(function (a, b) { return b.n - a.n; });

        var sum = document.getElementById('atl-summary');
        sum.replaceChildren(
            document.createTextNode('This view covers '), el('b', null, String(rows.length)),
            document.createTextNode(' species. '), el('b', null, String(endemic)),
            document.createTextNode(' of them live only on the Atlantic slope, and '), el('b', null, String(listed)),
            document.createTextNode(' are federally endangered or threatened. The substrate recorded for the most species is '),
            el('b', null, subs.length ? subs[0].label.toLowerCase() : '—'), document.createTextNode('.')
        );

        var sorted = rows.slice();
        if (state.sort === 'length') sorted.sort(function (a, b) { return (len(b) == null ? -1 : len(b)) - (len(a) == null ? -1 : len(a)) || a.species.localeCompare(b.species); });
        else if (state.sort === 'rank') sorted.sort(function (a, b) { return ((RANK_ORDER[a.gRank] == null ? 9 : RANK_ORDER[a.gRank]) - (RANK_ORDER[b.gRank] == null ? 9 : RANK_ORDER[b.gRank])) || a.species.localeCompare(b.species); });
        else sorted.sort(function (a, b) { return a.species.localeCompare(b.species); });
        drawMatrix(document.getElementById('atl-matrix'), sorted, state.sort === 'genus');

        var shares = document.getElementById('atl-shares');
        shares.replaceChildren();
        GROUPS.forEach(function (g) {
            var box = el('div', 'trait-group');
            box.appendChild(el('h3', null, g));
            var bars = el('div', 'trait-bars');
            barList(bars, COLS.filter(function (c) { return c.group === g; }).map(function (c) {
                var known = rows.filter(function (r) { return r[c.key] === '1' || r[c.key] === '0'; });
                return { label: c.label, n: known.filter(function (r) { return r[c.key] === '1'; }).length, total: known.length };
            }));
            box.appendChild(bars);
            shares.appendChild(box);
        });

        barList(document.getElementById('atl-host'), HOSTS.concat(['']).map(function (h) {
            return { label: h ? cap(h) : 'Not recorded', color: h ? HOST_COLORS[h] : C.ring, n: rows.filter(function (r) { return (r.hostInfection || '') === h; }).length, total: rows.length };
        }).filter(function (r) { return r.n > 0 || r.label === 'Not recorded'; }));

        barList(document.getElementById('atl-rank'), RANKS.map(function (rk) {
            return { label: rk[0], color: rankColor(rk[1][0]), n: rows.filter(function (r) { return rk[1].indexOf(r.gRank) >= 0; }).length, total: rows.length };
        }).filter(function (r) { return r.n > 0; }));
    }

    // ---------- Rhode Island panel ----------
    function drawRI() {
        var joined = RI.map(function (r) {
            return { ri: r, t: DATA.find(function (x) { return x.species === r.species; }) };
        }).filter(function (j) { return j.t; });
        var sgcn = RI.filter(function (r) { return r.sgcn === '1'; }).length;
        var withLen = joined.filter(function (j) { return len(j.t) != null; }).sort(function (a, b) { return len(b.t) - len(a.t); });

        var sum = document.getElementById('ri-summary');
        sum.replaceChildren(
            document.createTextNode('Rhode Island has '), el('b', null, String(RI.length)),
            document.createTextNode(' native freshwater mussel species, and '), el('b', null, String(sgcn)),
            document.createTextNode(' of them are Species of Greatest Conservation Need in the state.'),
            withLen.length ? document.createTextNode(' The largest is the ') : document.createTextNode(''),
            withLen.length ? el('b', null, withLen[0].ri.riCommonName.toLowerCase()) : document.createTextNode(''),
            withLen.length ? document.createTextNode(', at up to ' + fmtLen(len(withLen[0].t)) + ' mm.') : document.createTextNode('')
        );

        var cards = document.getElementById('ri-cards');
        cards.replaceChildren();
        joined.slice().sort(function (a, b) { return a.ri.riCommonName.localeCompare(b.ri.riCommonName); }).forEach(function (j) {
            var r = j.ri, t = j.t;
            var card = el('article', 'trait-sp');
            card.appendChild(el('h3', null, r.riCommonName));
            card.appendChild(el('p', 'sci', r.species));
            var tags = el('div', 'trait-tags');
            if (r.sgcn === '1') tags.appendChild(el('span', 'trait-tag need', 'RI conservation need'));
            if (t.gRank) { var g = el('span', 'trait-tag', 'NatureServe ' + t.gRank); g.style.color = rankColor(t.gRank); tags.appendChild(g); }
            if (t.endemic === '1') tags.appendChild(el('span', 'trait-tag plain', 'Atlantic-only'));
            card.appendChild(tags);
            var dl = el('dl');
            function add(k, v) { dl.append(el('dt', null, k), el('dd', null, v)); }
            var L = len(t);
            add('Max length', L != null ? fmtLen(L) + ' mm' : 'no data');
            add('Host strategy', t.hostInfection || 'not recorded');
            ['Substrate', 'Waterbody', 'Current'].forEach(function (grp) {
                var yes = COLS.filter(function (c) { return c.group === grp && t[c.key] === '1'; }).map(function (c) { return c.label.toLowerCase(); });
                add(grp, yes.length ? yes.join(', ') : 'none recorded');
            });
            add('Brooding', t.broodLongTerm === '1' ? 'long-term (overwinters larvae)' : t.broodLongTerm === '0' ? 'short-term' : 'no data');
            card.appendChild(dl);
            cards.appendChild(card);
        });

        drawMatrix(document.getElementById('ri-matrix'), joined.map(function (j) { return j.t; }).sort(function (a, b) { return a.species.localeCompare(b.species); }), true);
    }

    // ---------- tabs & controls ----------
    function showPanel(id) {
        document.querySelectorAll('.trait-tab').forEach(function (t) { t.setAttribute('aria-selected', t.getAttribute('data-panel') === id ? 'true' : 'false'); });
        document.querySelectorAll('.trait-panel').forEach(function (p) { p.hidden = p.id !== id; });
    }
    document.querySelectorAll('.trait-tab').forEach(function (t) {
        t.addEventListener('click', function () {
            var id = t.getAttribute('data-panel');
            showPanel(id);
            history.replaceState(null, '', id === 'atlantic' ? location.pathname : '#' + id);
        });
    });
    if (location.hash === '#rhode-island') showPanel('rhode-island');

    document.querySelectorAll('.trait-chip').forEach(function (b) {
        b.addEventListener('click', function () {
            state.scope = b.getAttribute('data-scope');
            document.querySelectorAll('.trait-chip').forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
            if (DATA.length) drawAtlantic();
        });
    });
    document.getElementById('trait-sort').addEventListener('change', function (e) {
        state.sort = e.target.value;
        if (DATA.length) drawAtlantic();
    });

    drawLegends();
    Promise.all([
        fetch('assets/data/atlantic_slope_traits.csv').then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); }),
        fetch('assets/data/ri_species.csv').then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
    ]).then(function (res) {
        DATA = parseCSV(res[0]);
        RI = parseCSV(res[1]);
        drawAtlantic();
        drawRI();
    }).catch(function () {
        ['atl-summary', 'ri-summary'].forEach(function (id) {
            document.getElementById(id).textContent = 'The trait data could not be loaded. Please refresh the page.';
        });
    });
})();
