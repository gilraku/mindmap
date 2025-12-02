import { jsPDF } from "jspdf";
import "svg2pdf.js";

export const demoData = {
    name: "Project Launch",
    id: "root",
    children: [
        {
            name: "Preparation",
            id: "c1",
            children: [
                { name: "Research Market", id: "c1-1" },
                { name: "Define Goals", id: "c1-2" },
                { name: "Team Assembly", id: "c1-3" }
            ]
        },
        {
            name: "Development",
            id: "c2",
            children: [
                {
                    name: "Frontend",
                    id: "c2-1",
                    children: [
                        { name: "React", id: "c2-1-1" },
                        { name: "Tailwind", id: "c2-1-2" }
                    ]
                },
                {
                    name: "Backend",
                    id: "c2-2",
                    children: [
                        { name: "Node.js", id: "c2-2-1" },
                        { name: "Database", id: "c2-2-2" }
                    ]
                }
            ]
        },
        {
            name: "Marketing",
            id: "c3",
            children: [
                { name: "Social Media", id: "c3-1" },
                { name: "Email Campaign", id: "c3-2" },
                { name: "Launch Event", id: "c3-3" }
            ]
        }
    ]
};

export const parseXML = (xmlStr) => {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlStr, "text/xml");
    const map = xml.getElementsByTagName('map')[0];
    if (!map) throw new Error("Invalid MM file: No map tag");

    const rootNode = Array.from(map.children).find(c => c.tagName === 'node');
    if (!rootNode) throw new Error("No root node found");

    return parseNode(rootNode);
};

const parseNode = (node) => {
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
};

export const downloadPDF = async (svgElement, setLoading) => {
    if (setLoading) setLoading(true);
    try {
        // 1. Prepare SVG (Clone and Style)
        const clone = svgElement.cloneNode(true);
        const g = clone.querySelector('g');
        if (g) g.removeAttribute('transform');

        // Calculate bounds from the original group to get correct dimensions
        const originalG = svgElement.querySelector('g');
        const bounds = originalG.getBBox();
        const pad = 50;
        const w = bounds.width + pad * 2;
        const h = bounds.height + pad * 2;

        clone.setAttribute('viewBox', `${bounds.x - pad} ${bounds.y - pad} ${w} ${h}`);
        clone.setAttribute('width', w);
        clone.setAttribute('height', h);

        // Add styles for PDF
        const style = document.createElement('style');
        style.textContent = `
        text { font-family: 'Inter', sans-serif; font-size: 14px; fill: #1f1f1f; }
        .root text { font-size: 16px; fill: white; font-weight: bold; text-anchor: middle; }
        rect { fill: white; stroke-width: 2px; }
        .root rect { fill: #2563eb; stroke: none; }
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

        pdf.save('mindmap.pdf');

    } catch (e) {
        console.error(e);
        alert("PDF Export Error: " + e.message);
    } finally {
        if (setLoading) setLoading(false);
    }
};

export const downloadImage = async (svgElement, setLoading) => {
    if (setLoading) setLoading(true);
    try {
        const clone = svgElement.cloneNode(true);
        const g = clone.querySelector('g');
        if (g) g.removeAttribute('transform');

        const originalG = svgElement.querySelector('g');
        const bounds = originalG.getBBox();
        const pad = 50;
        const w = bounds.width + pad * 2;
        const h = bounds.height + pad * 2;

        clone.setAttribute('viewBox', `${bounds.x - pad} ${bounds.y - pad} ${w} ${h}`);
        clone.setAttribute('width', w);
        clone.setAttribute('height', h);

        const style = document.createElement('style');
        style.textContent = `
        text { font-family: 'Inter', sans-serif; font-size: 14px; fill: #1f1f1f; }
        .root text { font-size: 16px; fill: white; font-weight: bold; text-anchor: middle; }
        rect { fill: white; stroke-width: 2px; }
        .root rect { fill: #2563eb; stroke: none; }
        path { fill: none; stroke-width: 2px; opacity: 0.6; }
        .toggle-circle { display: none; } /* Hide toggles in export */
    `;
        clone.prepend(style);

        const svgStr = new XMLSerializer().serializeToString(clone);
        const img = new Image();
        img.src = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgStr)));

        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
        });

        const canvas = document.createElement('canvas');
        // 2x scale for better quality
        canvas.width = w * 2;
        canvas.height = h * 2;
        const ctx = canvas.getContext('2d');
        ctx.scale(2, 2);
        ctx.fillStyle = "#f8fafc"; // bg-slate-50
        ctx.fillRect(0, 0, w, h);
        ctx.drawImage(img, 0, 0, w, h);

        const a = document.createElement('a');
        a.download = 'mindmap.png';
        a.href = canvas.toDataURL('image/png');
        a.click();

    } catch (e) {
        console.error(e);
        alert("Image Export Error: " + e.message);
    } finally {
        if (setLoading) setLoading(false);
    }
};
