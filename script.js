// --- Config ---
const config = {
    duration: 400,
    nodeHeight: 65,  // Spacing to prevent stacking
    nodeWidth: 180,
    colors: [
        "#4285F4", "#EA4335", "#FBBC05", "#34A853",
        "#8E24AA", "#00ACC1", "#F4511E", "#7CB342"
    ]
};

// --- State ---
let state = {
    rootData: null,
    root: null,
    i: 0,
    svg: null,
    g: null,
    zoom: null,
    treeLeft: null,
    treeRight: null,
    selectedNode: null
};

const colorScale = d3.scaleOrdinal(config.colors);

// --- Demo Data ---
const demoXML = `
<map version="1.0.1">
<node TEXT="Project Launch">
<node TEXT="Preparation">
<node TEXT="Research Market"/>
<node TEXT="Define Goals"/>
<node TEXT="Team Assembly"/>
</node>
<node TEXT="Development">
<node TEXT="Frontend">
    <node TEXT="React"/>
    <node TEXT="Tailwind"/>
</node>
<node TEXT="Backend">
    <node TEXT="Node.js"/>
    <node TEXT="Database"/>
</node>
</node>
<node TEXT="Marketing">
<node TEXT="Social Media"/>
<node TEXT="Email Campaign"/>
<node TEXT="Launch Event"/>
</node>
</node>
</map>`;

// --- Init ---
document.addEventListener('DOMContentLoaded', () => {
    initViz();
    setupInteractions();
    loadXMLString(demoXML);
});

function setupInteractions() {
    // Drop Zone Logic (Global)
    const body = document.body;

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        body.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    body.addEventListener('dragenter', () => body.classList.add('drag-active'));
    body.addEventListener('dragleave', (e) => {
        // Only remove if leaving the window
        if (!e.relatedTarget) body.classList.remove('drag-active');
    });

    body.addEventListener('drop', (e) => {
        body.classList.remove('drag-active');
        if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    // Buttons
    document.getElementById('demo-btn').onclick = () => loadXMLString(demoXML);
    document.getElementById('fit-btn').onclick = fitToScreen;
    document.getElementById('file-input').onchange = e => handleFile(e.target.files[0]);

    // Menus
    const dlMenu = document.getElementById('download-menu');
    document.getElementById('download-trigger').onclick = (e) => {
        e.stopPropagation();
        dlMenu.classList.toggle('show');
    };
    document.addEventListener('click', () => {
        dlMenu.classList.remove('show');
        document.getElementById('context-menu').style.display = 'none';
        saveEdit();
    });

    // Context Menu Items
    document.getElementById('ctx-add-child').onclick = () => { addChildNode(state.selectedNode); };
    document.getElementById('ctx-delete').onclick = () => { deleteNode(state.selectedNode); };
    document.getElementById('ctx-edit').onclick = () => { startEditing(state.selectedNode); };
}

// --- Logic ---
function addChildNode(d) {
    if (!d) return;
    const newNodeData = { name: "New Node", children: [], id: Math.random().toString(36).substr(2, 9) };

    // Update Data
    if (!d.data.children) d.data.children = [];
    d.data.children.push(newNodeData);

    // Update Hierarchy
    const newNode = d3.hierarchy(newNodeData);
    newNode.depth = d.depth + 1;
    newNode.parent = d;

    if (d.children) {
        d.children.push(newNode);
    } else if (d._children) {
        d._children.push(newNode);
        d.children = d._children;
        d._children = null;
    } else {
        d.children = [newNode];
    }

    update(state.root);
}

function deleteNode(d) {
    if (!d || !d.parent) return;

    // Update Data
    const siblingsData = d.parent.data.children;
    if (siblingsData) {
        const idx = siblingsData.indexOf(d.data);
        if (idx > -1) siblingsData.splice(idx, 1);
        if (siblingsData.length === 0) delete d.parent.data.children;
    }

    // Update Hierarchy
    const siblings = d.parent.children || d.parent._children;
    if (siblings) {
        const idx = siblings.indexOf(d);
        if (idx > -1) siblings.splice(idx, 1);
        if (siblings.length === 0) {
            d.parent.children = null;
            d.parent._children = null;
        }
    }

    update(state.root);
}

function startEditing(d) {
    if (!d) return;
    const inp = document.getElementById('edit-input');
    const nodeEl = document.getElementById('node-' + d.data.id);
    if (!nodeEl) return;

    const rect = nodeEl.getBoundingClientRect();
    inp.value = d.data.name;
    inp.style.display = 'block';
    inp.style.left = (rect.left + window.scrollX - 20) + 'px';
    inp.style.top = (rect.top + window.scrollY - 5) + 'px';
    inp.style.minWidth = (rect.width + 40) + 'px';
    inp.focus();
    inp.select();

    state.editingNode = d;
    inp.onkeydown = (e) => { if (e.key === 'Enter') saveEdit(); };
    inp.onclick = e => e.stopPropagation();
}

function saveEdit() {
    const inp = document.getElementById('edit-input');
    if (inp.style.display === 'none' || !state.editingNode) return;
    const val = inp.value.trim();
    if (val) {
        state.editingNode.data.name = val;
        update(state.root);
    }
    inp.style.display = 'none';
    state.editingNode = null;
}

function handleFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => loadXMLString(e.target.result);
    reader.readAsText(file);
}

function loadXMLString(xmlStr) {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlStr, "text/xml");
    const map = xml.getElementsByTagName('map')[0];
    const rootNode = Array.from(map.children).find(c => c.tagName === 'node');

    if (!rootNode) return alert("No root node found");
    state.rootData = parseNode(rootNode);
    state.root = d3.hierarchy(state.rootData, d => d.children);
    update(state.root);
    setTimeout(fitToScreen, 500);
}

function parseNode(node) {
    const data = {
        name: node.getAttribute('TEXT') || "Untitled",
        children: [],
        id: Math.random().toString(36).substr(2, 9)
    };
    for (let child of node.children) {
        if (child.tagName === 'node') data.children.push(parseNode(child));
    }
    if (!data.children.length) delete data.children;
    return data;
}

// --- D3 Visualization ---
function initViz() {
    state.zoom = d3.zoom().scaleExtent([0.1, 4]).on("zoom", e => state.g.attr("transform", e.transform));
    state.svg = d3.select("#viz-container").append("svg")
        .attr("width", "100%")
        .attr("height", "100%")
        .call(state.zoom)
        .on("dblclick.zoom", null);
    state.g = state.svg.append("g");
}

function getBranchColor(d) {
    if (d.depth === 0) return "#1a73e8";
    let ancestor = d;
    while (ancestor.depth > 1 && ancestor.parent) ancestor = ancestor.parent;
    return colorScale(ancestor.data.id || ancestor.data.name);
}

function update(source) {
    state.treeLeft = d3.tree().nodeSize([config.nodeHeight, config.nodeWidth]);
    state.treeRight = d3.tree().nodeSize([config.nodeHeight, config.nodeWidth]);

    const rightData = { children: [] };
    const leftData = { children: [] };

    if (state.root.children) {
        state.root.children.forEach((child, i) => {
            if (i % 2 === 0) { child.data.side = "right"; rightData.children.push(child.data); }
            else { child.data.side = "left"; leftData.children.push(child.data); }
        });
    }

    let nodes = [state.root];
    state.root.x = 0; state.root.y = 0;

    if (rightData.children.length) {
        const rRoot = d3.hierarchy(rightData, d => d.children);
        state.treeRight(rRoot);
        rRoot.children.forEach(d => { adjustCoords(d, 1); nodes = nodes.concat(d.descendants()); });
    }
    if (leftData.children.length) {
        const lRoot = d3.hierarchy(leftData, d => d.children);
        state.treeLeft(lRoot);
        lRoot.children.forEach(d => { adjustCoords(d, -1); nodes = nodes.concat(d.descendants()); });
    }

    // Apply manual offsets if stored
    nodes.forEach(d => {
        if (d.data.dx) d.x += d.data.dx;
        if (d.data.dy) d.y += d.data.dy;
    });

    function adjustCoords(n, dir) {
        const tmpX = n.x;
        const tmpY = n.y;
        n.x = tmpX;
        n.y = (tmpY + 60) * dir;
        n.side = dir === 1 ? "right" : "left";
        if (n.children) n.children.forEach(c => adjustCoords(c, dir));
    }

    const links = [];
    nodes.forEach(d => {
        if (d !== state.root) {
            let p = d.parent;
            if (d.depth === 1) p = state.root;
            if (p) links.push({ source: p, target: d });
        }
    });

    const node = state.g.selectAll('g.node')
        .data(nodes, d => d.data.id);

    const nodeEnter = node.enter().append('g')
        .attr('class', d => `node ${d.depth === 0 ? 'root' : 'child'}`)
        .attr('id', d => 'node-' + d.data.id)
        .attr("transform", d => `translate(${source.y0 || 0},${source.x0 || 0})`)
        .on('click', (e, d) => {
            if (e.defaultPrevented) return;
            if (d.depth > 0 && d.children) { d._children = d.children; d.children = null; update(d); }
            else if (d.depth > 0 && d._children) { d.children = d._children; d._children = null; update(d); }
        })
        .on('dblclick', (e, d) => { e.stopPropagation(); startEditing(d); })
        .on('contextmenu', (e, d) => {
            e.preventDefault();
            e.stopPropagation();
            state.selectedNode = d;
            const menu = document.getElementById('context-menu');
            menu.style.display = 'block';
            menu.style.left = e.pageX + 'px';
            menu.style.top = e.pageY + 'px';
        })
        .call(d3.drag()
            .on("drag", dragged)
        );

    nodeEnter.append('rect')
        .attr('rx', 20)
        .attr('ry', 20)
        .attr('height', 36)
        .attr('y', -18);

    nodeEnter.append('text')
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .text(d => d.data.name)
        .style("opacity", 0);

    const nodeUpdate = node.merge(nodeEnter);

    nodeUpdate.transition().duration(config.duration)
        .attr("transform", d => `translate(${d.y},${d.x})`);

    nodeUpdate.select('text').text(d => d.data.name).style("opacity", 1);

    nodeUpdate.select('rect')
        .attr('width', function (d) { return this.parentNode.querySelector('text').getComputedTextLength() + 30; })
        .attr('x', function (d) { return -(this.parentNode.querySelector('text').getComputedTextLength() + 30) / 2; })
        .style("stroke", d => d.depth === 0 ? "none" : getBranchColor(d));

    const nodeExit = node.exit().transition().duration(config.duration)
        .attr("transform", d => `translate(${source.y},${source.x})`)
        .remove();
    nodeExit.select('rect').attr('width', 0);
    nodeExit.select('text').style("opacity", 0);

    const link = state.g.selectAll('path.link').data(links, d => d.target.data.id);

    const linkEnter = link.enter().insert('path', "g")
        .attr("class", "link")
        .attr('d', d => {
            const o = { x: source.x0 || 0, y: source.y0 || 0 };
            return diagonal(o, o);
        })
        .style("stroke", d => getBranchColor(d.target));

    const linkUpdate = link.merge(linkEnter);
    linkUpdate.transition().duration(config.duration)
        .attr('d', d => diagonal(d.source, d.target))
        .style("stroke", d => getBranchColor(d.target));

    link.exit().transition().duration(config.duration).remove();

    nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });
}

// --- Recursive Drag Function ---
function dragged(e, d) {
    // FIXED: Directly use e.dx and e.dy without swapping
    // Because our x/y are already aligned to visual screen space in update()
    const dx = e.dx;
    const dy = e.dy;

    // Function to recursively move children
    function moveNodeAndChildren(node) {
        // Update internal data for persistence
        node.data.dx = (node.data.dx || 0) + dy; // Vertical shift (Visual Y)
        node.data.dy = (node.data.dy || 0) + dx; // Horizontal shift (Visual X)

        // Update visual position immediately
        node.x += dy;
        node.y += dx;

        // Move visual element
        d3.select('#node-' + node.data.id).attr("transform", `translate(${node.y},${node.x})`);

        // Recurse
        if (node.children) node.children.forEach(moveNodeAndChildren);
        if (node._children) node._children.forEach(moveNodeAndChildren); // Also move hidden children
    }

    moveNodeAndChildren(d);

    // Update all links
    state.g.selectAll('path.link').attr('d', l => diagonal(l.source, l.target));
}

function diagonal(s, d) {
    return `M ${s.y} ${s.x} C ${(s.y + d.y) / 2} ${s.x}, ${(s.y + d.y) / 2} ${d.x}, ${d.y} ${d.x}`;
}

function fitToScreen() {
    if (!state.root) return;
    const bounds = state.g.node().getBBox();
    const parent = state.svg.node().parentElement;
    if (bounds.width === 0) return;
    const scale = 0.85 / Math.max(bounds.width / parent.clientWidth, bounds.height / parent.clientHeight);
    const transform = d3.zoomIdentity
        .translate(parent.clientWidth / 2, parent.clientHeight / 2)
        .scale(scale)
        .translate(-(bounds.x + bounds.width / 2), -(bounds.y + bounds.height / 2));
    state.svg.transition().duration(750).call(state.zoom.transform, transform);
}

// --- Exports ---
async function downloadImage(fmt) {
    document.getElementById('loading').style.display = 'flex';
    try {
        const clone = state.svg.node().cloneNode(true);
        clone.querySelector('g').removeAttribute('transform');
        const bounds = state.g.node().getBBox();
        const pad = 50;
        const w = bounds.width + pad * 2;
        const h = bounds.height + pad * 2;
        clone.setAttribute('viewBox', `${bounds.x - pad} ${bounds.y - pad} ${w} ${h}`);
        clone.setAttribute('width', w); clone.setAttribute('height', h);

        const style = document.createElement('style');
        style.textContent = `
            text { font-family: 'Roboto', sans-serif; font-size: 14px; fill: #1f1f1f; }
            .root text { font-size: 16px; fill: white; font-weight: bold; }
            rect { fill: white; stroke-width: 2px; }
            .root rect { fill: #1a73e8; stroke: none; }
            path { fill: none; stroke-width: 2px; opacity: 0.6; }
        `;
        clone.prepend(style);

        const svgStr = new XMLSerializer().serializeToString(clone);
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));
        await new Promise(r => img.onload = r);

        const canvas = document.createElement('canvas');
        canvas.width = w * 2; canvas.height = h * 2;
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        ctx.fillStyle = "#f8f9fa";
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        if (fmt === 'png') {
            const a = document.createElement('a');
            a.download = 'notebook_map.png';
            a.href = canvas.toDataURL('image/png');
            a.click();
        }
        return canvas;
    } catch (e) { console.error(e); alert("Export Error"); }
    finally { document.getElementById('loading').style.display = 'none'; }
}

async function downloadPDF() {
    const cvs = await downloadImage('canvas');
    if (!cvs) return;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF(cvs.width > cvs.height ? 'l' : 'p', 'mm', 'a4');
    const pw = pdf.internal.pageSize.getWidth();
    const ph = pdf.internal.pageSize.getHeight();
    const r = Math.min(pw / cvs.width, ph / cvs.height);
    pdf.addImage(cvs.toDataURL('image/png'), 'PNG', (pw - cvs.width * r) / 2, (ph - cvs.height * r) / 2, cvs.width * r, cvs.height * r);
    pdf.save('notebook_map.pdf');
}

function downloadJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.rootData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr; a.download = 'notebook_map.json'; a.click();
}
