import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import * as d3 from 'd3';
import { clsx } from 'clsx';

const config = {
    duration: 400,
    nodeHeight: 80,
    nodeWidth: 180,
    colors: [
        "#4285F4", "#EA4335", "#FBBC05", "#34A853",
        "#8E24AA", "#00ACC1", "#F4511E", "#7CB342"
    ]
};

const colorScale = d3.scaleOrdinal(config.colors);

const MindMap = forwardRef(({ data, onNodeClick, onNodeContextMenu, onEdit }, ref) => {
    const svgRef = useRef(null);
    const gRef = useRef(null);
    const zoomRef = useRef(null);
    const rootRef = useRef(null);
    const oldPositions = useRef(new Map());

    const fitToScreen = () => {
        if (!gRef.current || !svgRef.current) return;
        const bounds = gRef.current.getBBox();
        const width = svgRef.current.clientWidth;
        const height = svgRef.current.clientHeight;

        if (bounds.width === 0 || bounds.height === 0) return;

        const scale = 0.85 / Math.max(bounds.width / width, bounds.height / height);
        const transform = d3.zoomIdentity
            .translate(width / 2, height / 2)
            .scale(scale)
            .translate(-(bounds.x + bounds.width / 2), -(bounds.y + bounds.height / 2));

        d3.select(svgRef.current).transition().duration(750).call(zoomRef.current.transform, transform);
    };

    useImperativeHandle(ref, () => ({
        getSvg: () => svgRef.current,
        fitToScreen: () => fitToScreen()
    }));

    useEffect(() => {
        if (!data) return;

        // Initialize Hierarchy
        const root = d3.hierarchy(data, d => d.children);
        rootRef.current = root;

        // Map old positions to new nodes for smooth transitions
        const oldMap = oldPositions.current;
        root.descendants().forEach(d => {
            const old = oldMap.get(d.data.id);
            if (old) {
                d.x0 = old.x;
                d.y0 = old.y;
            } else {
                // New node: start at parent's old position
                // We need to find the parent's ID and look it up in oldMap
                if (d.parent) {
                    const parentOld = oldMap.get(d.parent.data.id);
                    if (parentOld) {
                        d.x0 = parentOld.x;
                        d.y0 = parentOld.y;
                    } else {
                        // Parent is also new? Fallback to grandparent or root
                        // For now, just 0,0 (root) if parent not found in old map
                        d.x0 = 0;
                        d.y0 = 0;
                    }
                } else {
                    d.x0 = 0;
                    d.y0 = 0;
                }
            }
        });

        // Initialize Zoom if not already done
        if (!zoomRef.current) {
            const svg = d3.select(svgRef.current);
            const g = d3.select(gRef.current);

            const zoom = d3.zoom()
                .scaleExtent([0.1, 4])
                .on("zoom", (e) => {
                    g.attr("transform", e.transform);
                });

            svg.call(zoom)
                .on("dblclick.zoom", null); // Disable double click zoom

            zoomRef.current = zoom;

            // Initial center
            svg.call(zoom.transform, d3.zoomIdentity.translate(svgRef.current.clientWidth / 2, svgRef.current.clientHeight / 2));
        }

        // Initial Update
        // root.x0 = 0; // This is now handled by the oldPositions mapping logic
        // root.y0 = 0; // This is now handled by the oldPositions mapping logic

        // Clear previous if any (or just update? D3 handles enter/exit)
        // For a completely new file, we might want to reset zoom?
        // Let's just update.

        update(root);

        // Fit to screen after a short delay to allow layout to settle
        // We only do this on initial load or if explicitly requested, 
        // but here we do it on data change which might be annoying if user panned away.
        // Let's only do it if it's the first render of this data set? 
        // For now, let's keep it but maybe we can check if it's a "new" file load vs just an edit.
        // Actually, let's NOT auto-fit on every small edit, only on mount.
        // But we need to center the root initially.

    }, [data]);



    const getBranchColor = (d) => {
        if (d.depth === 0) return "#2563eb"; // primary blue
        let ancestor = d;
        while (ancestor.depth > 1 && ancestor.parent) ancestor = ancestor.parent;
        return colorScale(ancestor.data.id || ancestor.data.name);
    };

    const update = (source, duration = config.duration) => {
        if (!gRef.current) return;

        // Dynamic Width Calculation
        let maxTextLen = 0;
        rootRef.current.descendants().forEach(d => {
            const len = d.data.name.length;
            if (len > maxTextLen) maxTextLen = len;
        });
        const dynamicNodeWidth = Math.max(config.nodeWidth, (maxTextLen * 8) + 60);

        const treeLeft = d3.tree().nodeSize([config.nodeHeight, dynamicNodeWidth]);
        const treeRight = d3.tree().nodeSize([config.nodeHeight, dynamicNodeWidth]);

        const rightData = { children: [] };
        const leftData = { children: [] };

        // Handle Collapsed State
        const rootChildren = rootRef.current.data._collapsed ? [] : (rootRef.current.data.children || []);

        rootChildren.forEach((child, i) => {
            if (i % 2 === 0) { child.side = "right"; rightData.children.push(child); }
            else { child.side = "left"; leftData.children.push(child); }
        });

        let nodes = [rootRef.current];
        rootRef.current.x = 0; rootRef.current.y = 0;

        const childrenAccessor = d => d._collapsed ? null : d.children;

        if (rightData.children.length) {
            const rRoot = d3.hierarchy(rightData, childrenAccessor);
            treeRight(rRoot);
            rRoot.children.forEach(d => { adjustCoords(d, 1); nodes = nodes.concat(d.descendants()); });
        }
        if (leftData.children.length) {
            const lRoot = d3.hierarchy(leftData, childrenAccessor);
            treeLeft(lRoot);
            lRoot.children.forEach(d => { adjustCoords(d, -1); nodes = nodes.concat(d.descendants()); });
        }

        // Apply manual offsets (drag)
        nodes.forEach(d => {
            if (d.data.dx) d.x += d.data.dx;
            if (d.data.dy) d.y += d.data.dy;
        });

        function adjustCoords(n, dir) {
            // In d3.tree (vertical), x is height (vertical), y is depth (horizontal).
            // We want horizontal tree. So we swap x and y in the transform.
            // But here we are adjusting the raw d3 coordinates.
            // d3.tree puts root at (x,y) = (0,0). Children at (x, y+depth).
            // We want to shift children to left/right.

            // n.y is the depth (horizontal distance from root in standard tree).
            // We multiply by dir to send left (-1) or right (1).
            // We add 60 for root spacing?

            if (n.depth > 0) {
                n.y = (n.y + 60) * dir;
            } else {
                n.y = 0;
            }

            n.side = dir === 1 ? "right" : "left";
            if (n.children) n.children.forEach(c => adjustCoords(c, dir));
        }

        // Links
        const links = [];
        nodes.forEach(d => {
            if (d !== rootRef.current) {
                let p = d.parent;
                if (d.depth === 1) p = rootRef.current;
                if (p) links.push({ source: p, target: d });
            }
        });

        const g = d3.select(gRef.current);

        // --- Nodes ---
        const node = g.selectAll('g.node')
            .data(nodes, d => d.data.id);

        const nodeEnter = node.enter().append('g')
            .attr('class', d => `node ${d.depth === 0 ? 'root' : 'child'} cursor-pointer`)
            .attr('id', d => 'node-' + d.data.id)
            .attr("transform", d => {
                // Enter from parent's previous position
                // If d.parent exists (it's a new node), use its old position.
                // If d is the root, use center?
                // The 'source' argument to update() is the node that triggered the update.
                // For collapse/expand, source is the clicked node.
                // For new data (useEffect), source is root.

                // If we have a stored position for this node ID (it existed before), use it.
                // (This happens if we re-render but node didn't move much, or if we are updating existing nodes)
                // But enter() is only for NEW nodes.

                // So for NEW nodes, we want them to pop out from their parent.
                // We stored parent's old position in d.x0/d.y0 in useEffect.
                // But if update() was called from click (collapse/expand), useEffect didn't run.
                // So d.x0/d.y0 might be undefined for new nodes created by expand?

                // When expanding: d.children are new nodes.
                // We want them to start at 'd' (the source).

                // So:
                const p = source && source.x0 !== undefined ? source : (d.parent || d);
                return `translate(${p.y0 || 0},${p.x0 || 0})`;
            })
            .on('click', (e, d) => {
                if (e.defaultPrevented) return; // Dragged
                e.stopPropagation();

                // Toggle Collapse
                if (d.data.children || d.data._collapsed) {
                    d.data._collapsed = !d.data._collapsed;
                    update(d); // Update from d to keep context? No, update(root) is safer for layout.
                    // But if we update(root), we lose the 'source' context for animation?
                    // The 'source' param in update(source) determines where new nodes pop out from.
                    // If we collapse/expand 'd', we want animation to start from 'd'.
                    update(d);
                }

                if (onNodeClick) onNodeClick(d);
            })
            .on('dblclick', (e, d) => {
                e.stopPropagation();
                if (onEdit) onEdit(d, e);
            })
            .on('contextmenu', (e, d) => {
                e.preventDefault();
                e.stopPropagation();
                if (onNodeContextMenu) onNodeContextMenu(e, d);
            })
            .call(d3.drag()
                .on("start", (e, d) => {
                    // d3.select(e.sourceEvent.currentTarget).raise(); // Raising causes click issues
                })
                .on("drag", (e, d) => {
                    const dx = e.dx;
                    const dy = e.dy;
                    // Move the node and its descendants
                    d.descendants().forEach(node => {
                        // We are updating the visual coordinates (x, y) which are mapped to (y, x) in transform
                        // d3.tree is vertical (x=height, y=width), but we rotate 90deg.
                        // So visual X is tree Y, visual Y is tree X.
                        // Drag dx (visual X) -> tree Y
                        // Drag dy (visual Y) -> tree X
                        node.data.dx = (node.data.dx || 0) + dy;
                        node.data.dy = (node.data.dy || 0) + dx;
                    });
                    update(rootRef.current, 0); // 0 duration for smooth drag
                })
            );

        nodeEnter.append('rect')
            .attr('rx', 20)
            .attr('ry', 20)
            .attr('height', 36)
            .attr('y', -18)
            .style("fill", "white")
            .style("stroke-width", "2px");

        nodeEnter.append('text')
            .attr("dy", "0.35em")
            .attr("text-anchor", "middle")
            .text(d => d.data.name)
            .style("opacity", 0)
            .style("font-family", "Inter, sans-serif")
            .style("font-size", "14px")
            .style("fill", "#1f1f1f");

        // Toggle Indicator (Optional visual cue, maybe just a small dot or icon inside the rect?)
        // Since clicking the whole node toggles, we might not need the external circle.
        // Let's remove the external toggle-circle to clean up the UI as requested.

        // Update
        const nodeUpdate = node.merge(nodeEnter);

        nodeUpdate.transition().duration(duration)
            .attr("transform", d => `translate(${d.y},${d.x})`);

        nodeUpdate.select('text')
            .text(d => d.data.name)
            .style("opacity", 1);

        nodeUpdate.select('rect')
            .attr('width', function () { return this.parentNode.querySelector('text').getComputedTextLength() + 30; })
            .attr('x', function () { return -(this.parentNode.querySelector('text').getComputedTextLength() + 30) / 2; })
            .style("stroke", d => d.depth === 0 ? "none" : getBranchColor(d))
            .style("fill", d => d.depth === 0 ? "#2563eb" : "white");

        nodeUpdate.select('.root text')
            .style("fill", "white")
            .style("font-weight", "bold")
            .style("font-size", "16px");

        // Update Toggle Indicator Position and Icon
        // Removed toggle-circle logic


        // Exit
        const nodeExit = node.exit().transition().duration(duration)
            .attr("transform", d => {
                // Exit to the source's new position (usually the node that was clicked to collapse)
                // or the parent's new position.
                const p = source || d.parent || d;
                return `translate(${p.y},${p.x})`;
            })
            .remove();

        nodeExit.select('rect').attr('width', 0);
        nodeExit.select('text').style("opacity", 0);

        // --- Links ---
        const link = g.selectAll('path.link').data(links, d => d.target.data.id);

        const linkEnter = link.enter().insert('path', "g")
            .attr("class", "link")
            .attr('d', d => {
                const o = { x: source.x0 || 0, y: source.y0 || 0 };
                return diagonal(o, o);
            })
            .style("fill", "none")
            .style("stroke-width", "2px")
            .style("opacity", 0.6)
            .style("stroke", d => getBranchColor(d.target));

        const linkUpdate = link.merge(linkEnter);
        linkUpdate.transition().duration(duration)
            .attr('d', d => diagonal(d.source, d.target))
            .style("stroke", d => getBranchColor(d.target));

        link.exit().transition().duration(duration)
            .attr('d', d => {
                const o = { x: source.x || 0, y: source.y || 0 };
                return diagonal(o, o);
            })
            .remove();

        // Stash positions for next update
        nodes.forEach(d => {
            d.x0 = d.x;
            d.y0 = d.y;
            // Also update the persistent map
            oldPositions.current.set(d.data.id, { x: d.x, y: d.y });
        });
    };

    const diagonal = (s, d) => {
        return `M ${s.y} ${s.x} C ${(s.y + d.y) / 2} ${s.x}, ${(s.y + d.y) / 2} ${d.x}, ${d.y} ${d.x}`;
    };

    return (
        <div className="w-full h-full bg-slate-50 overflow-hidden relative">
            <svg ref={svgRef} className="w-full h-full block">
                <g ref={gRef}></g>
            </svg>
        </div>
    );
});

export default MindMap;
