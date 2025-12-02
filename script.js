import { jsPDF } from "jspdf";
import "svg2pdf.js";

const config = {
    duration: 400,
    nodeHeight: 80,  // Increased spacing to prevent stacking
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

    // Download Actions
    document.getElementById('btn-download-png').onclick = () => downloadImage('png');
    document.getElementById('btn-download-pdf').onclick = downloadPDF;
    document.getElementById('btn-download-json').onclick = downloadJSON;

    // Context Menu Items
    document.getElementById('ctx-add-child').onclick = () => { addChildNode(state.selectedNode); };
    document.getElementById('ctx-delete').onclick = () => { deleteNode(state.selectedNode); };
    document.getElementById('ctx-edit').onclick = () => { startEditing(state.selectedNode); };

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (state.editingNode) return; // Don't delete while editing text
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (state.selectedNode) {
                deleteNode(state.selectedNode);
                state.selectedNode = null; // Clear selection after delete
            }
        }
    });
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

    // Special handling for depth 1 nodes (direct children of root)
    if (d.depth === 1) {
        const idx = state.rootData.children.indexOf(d.data);
        if (idx > -1) {
            state.rootData.children.splice(idx, 1);
            if (state.rootData.children.length === 0) delete state.rootData.children;
        }
        update(state.root);
        return;
    }

    // Update Data (for depth > 1)
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

function update(source, duration = config.duration) {
    // Calculate dynamic node width based on text length in the current tree
    let maxTextLen = 0;
    if (state.root) {
        state.root.descendants().forEach(d => {
            const len = d.data.name.length;
            if (len > maxTextLen) maxTextLen = len;
        });
    }
    // Estimate width: ~8px per char + 60px padding. Min width from config.
    const dynamicNodeWidth = Math.max(config.nodeWidth, (maxTextLen * 8) + 60);

    state.treeLeft = d3.tree().nodeSize([config.nodeHeight, dynamicNodeWidth]);
    state.treeRight = d3.tree().nodeSize([config.nodeHeight, dynamicNodeWidth]);

    const rightData = { children: [] };
    const leftData = { children: [] };

    // Use _collapsed property to determine if we should show children
    const rootChildren = state.rootData._collapsed ? [] : (state.rootData.children || []);

    if (rootChildren.length) {
        rootChildren.forEach((child, i) => {
            if (i % 2 === 0) { child.side = "right"; rightData.children.push(child); }
            else { child.side = "left"; leftData.children.push(child); }
        });
    }

    let nodes = [state.root];
    state.root.x = 0; state.root.y = 0;

    // Custom children accessor that respects _collapsed state
    const childrenAccessor = d => d._collapsed ? null : d.children;

    if (rightData.children.length) {
        const rRoot = d3.hierarchy(rightData, childrenAccessor);
        state.treeRight(rRoot);
        rRoot.children.forEach(d => { adjustCoords(d, 1); nodes = nodes.concat(d.descendants()); });
    }
    if (leftData.children.length) {
        const lRoot = d3.hierarchy(leftData, childrenAccessor);
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
            state.selectedNode = d;

            // Toggle children using data property
            if (d.data.children || d.data._collapsed) {
                d.data._collapsed = !d.data._collapsed;
                update(d);
            }
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

    nodeUpdate.classed('selected', d => d === state.selectedNode);

    nodeUpdate.transition().duration(duration)
        .attr("transform", d => `translate(${d.y},${d.x})`);

    nodeUpdate.select('text').text(d => d.data.name).style("opacity", 1);

    nodeUpdate.select('rect')
        .attr('width', function (d) { return this.parentNode.querySelector('text').getComputedTextLength() + 30; })
        .attr('x', function (d) { return -(this.parentNode.querySelector('text').getComputedTextLength() + 30) / 2; })
        .style("stroke", d => d.depth === 0 ? "none" : getBranchColor(d));

    const nodeExit = node.exit().transition().duration(duration)
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
    linkUpdate.transition().duration(duration)
        .attr('d', d => diagonal(d.source, d.target))
        .style("stroke", d => getBranchColor(d.target));

    link.exit().transition().duration(duration).remove();

    nodes.forEach(d => { d.x0 = d.x; d.y0 = d.y; });
}

// --- Recursive Drag Function ---
// --- Recursive Drag Function ---
function dragged(e, d) {
    const dx = e.dx;
    const dy = e.dy;

    // Function to recursively move children data
    function moveNodeAndChildren(node) {
        // Update internal data for persistence
        node.data.dx = (node.data.dx || 0) + dy; // Vertical shift (Visual Y)
        node.data.dy = (node.data.dy || 0) + dx; // Horizontal shift (Visual X)

        // Recurse on data children (since we are updating data)
        if (node.data.children) {
            // We need to find the hierarchy nodes that correspond to these data nodes?
            // Actually, we just need to update the data.
            // But wait, the recursion in the previous version was on hierarchy nodes 'node.children'.
            // If we want to move the whole subtree, we should traverse the hierarchy.
            // But 'd' is a hierarchy node.
        }
    }

    // We traverse the hierarchy 'd' to update 'data' for all descendants.
    d.descendants().forEach(node => {
        node.data.dx = (node.data.dx || 0) + dy;
        node.data.dy = (node.data.dy || 0) + dx;
    });

    // Update the whole tree immediately without transition
    update(state.root, 0);
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
    document.getElementById('loading').style.display = 'flex';
    try {
        // 1. Prepare SVG (Clone and Style)
        const clone = state.svg.node().cloneNode(true);
        clone.querySelector('g').removeAttribute('transform');

        // Calculate bounds
        const bounds = state.g.node().getBBox();
        const pad = 50;
        const w = bounds.width + pad * 2;
        const h = bounds.height + pad * 2;

        clone.setAttribute('viewBox', `${bounds.x - pad} ${bounds.y - pad} ${w} ${h}`);
        clone.setAttribute('width', w);
        clone.setAttribute('height', h);

        // Add styles for PDF
        const style = document.createElement('style');
        style.textContent = `
            text { font-family: 'Roboto', sans-serif; font-size: 14px; fill: #1f1f1f; }
            .root text { font-size: 16px; fill: white; font-weight: bold; }
            rect { fill: white; stroke-width: 2px; }
            .root rect { fill: #1a73e8; stroke: none; }
            path { fill: none; stroke-width: 2px; opacity: 0.6; }
        `;
        clone.prepend(style);

        // Append to body (hidden) so svg2pdf can compute styles
        clone.style.position = 'absolute';
        clone.style.left = '-9999px';
        clone.style.top = '-9999px';
        document.body.appendChild(clone);

        // 2. Create PDF
        // Use points (pt) for dimensions to match SVG units roughly
        const pdf = new jsPDF(w > h ? 'l' : 'p', 'pt', [w, h]);

        // 3. Render SVG to PDF
        await pdf.svg(clone, {
            x: 0,
            y: 0,
            width: w,
            height: h
        });

        // Cleanup
        document.body.removeChild(clone);

        pdf.save('notebook_map.pdf');

    } catch (e) {
        console.error(e);
        alert("PDF Export Error: " + e.message);
    } finally {
        document.getElementById('loading').style.display = 'none';
    }
}

function downloadJSON() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.rootData, null, 2));
    const a = document.createElement('a');
    a.href = dataStr; a.download = 'notebook_map.json'; a.click();
}
