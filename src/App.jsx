import React, { useState, useRef, useEffect } from 'react';
import MindMap from './components/MindMap';
import { demoData, parseXML, downloadPDF, downloadImage } from './utils/mindmapUtils';
import { Download, Upload, Monitor, ZoomIn, Plus, Trash2, Edit2, FileText, Image as ImageIcon, FileJson } from 'lucide-react';

function App() {
  const [data, setData] = useState(demoData);
  const [loading, setLoading] = useState(false);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, node: null });
  const [editInput, setEditInput] = useState({ visible: false, x: 0, y: 0, value: '', node: null });
  const mindMapRef = useRef(null);
  const fileInputRef = useRef(null);

  // Close menus on click outside
  useEffect(() => {
    const handleClick = () => {
      setContextMenu({ ...contextMenu, visible: false });
      if (editInput.visible) saveEdit();
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [contextMenu, editInput]);

  const handleFileUpload = (e) => {
    const file = e.target.files ? e.target.files[0] : e.dataTransfer.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const newData = parseXML(e.target.result);
        setData(newData);
      } catch (err) {
        alert("Failed to load file: " + err.message);
      }
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleFileUpload(e);
  };

  const handleNodeClick = (node) => {
    // Selection logic if needed
  };

  const handleNodeContextMenu = (e, node) => {
    setContextMenu({
      visible: true,
      x: e.pageX,
      y: e.pageY,
      node: node
    });
  };

  const handleAddChild = () => {
    const { node } = contextMenu;
    if (!node) return;

    const newNode = {
      name: "New Node",
      children: [],
      id: Math.random().toString(36).substr(2, 9)
    };

    if (!node.data.children) node.data.children = [];
    node.data.children.push(newNode);

    // Expand if collapsed
    if (node.data._collapsed) node.data._collapsed = false;

    setData({ ...data }); // Trigger update
    setContextMenu({ ...contextMenu, visible: false });
  };

  const deleteNodeRecursive = (nodes, id) => {
    return nodes.filter(node => {
      if (node.id === id) return false;
      if (node.children) {
        node.children = deleteNodeRecursive(node.children, id);
        if (node.children.length === 0) delete node.children;
      }
      return true;
    });
  };

  const handleDeleteNode = () => {
    const { node } = contextMenu;
    if (!node) return;

    // Cannot delete root
    if (node.depth === 0 || !node.parent) {
      alert("Cannot delete root node");
      return;
    }

    console.log("Deleting node ID:", node.data.id);

    // Deep clone data to ensure immutability and trigger update
    const newData = JSON.parse(JSON.stringify(data));

    // We need to find the parent of the node to delete in the new data
    // Actually, since we have a recursive filter, we can just filter the children of the root?
    // But root is a single object, not an array.

    if (newData.children) {
      newData.children = deleteNodeRecursive(newData.children, node.data.id);
    }

    setData(newData);
    setContextMenu({ ...contextMenu, visible: false });
  };

  const handleStartEdit = (node, e) => {
    // If called from context menu, node is in contextMenu state
    // If called from dblclick, node is passed directly
    const targetNode = node || contextMenu.node;
    if (!targetNode) return;

    // Find node element position
    const nodeEl = document.getElementById('node-' + targetNode.data.id);
    if (!nodeEl) return;
    const rect = nodeEl.getBoundingClientRect();

    setEditInput({
      visible: true,
      x: rect.left + window.scrollX - 20,
      y: rect.top + window.scrollY - 5,
      value: targetNode.data.name,
      node: targetNode,
      width: rect.width + 40
    });
    setContextMenu({ ...contextMenu, visible: false });
  };

  const saveEdit = () => {
    if (!editInput.visible || !editInput.node) return;
    if (editInput.value.trim()) {
      editInput.node.data.name = editInput.value.trim();
      setData({ ...data });
    }
    setEditInput({ ...editInput, visible: false, node: null });
  };

  const handleDownload = async (type) => {
    if (!mindMapRef.current) return;
    const svg = mindMapRef.current.getSvg();

    if (type === 'pdf') {
      await downloadPDF(svg, setLoading);
    } else if (type === 'png') {
      await downloadImage(svg, setLoading);
    } else if (type === 'json') {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(data, null, 2));
      const a = document.createElement('a');
      a.href = dataStr; a.download = 'mindmap.json'; a.click();
    }
  };

  return (
    <div
      className="w-screen h-screen flex flex-col bg-slate-50 text-slate-900 font-sans overflow-hidden"
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-50 bg-white/80 flex flex-col items-center justify-center backdrop-blur-sm">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
          <div className="text-slate-600 font-medium">Processing...</div>
        </div>
      )}

      {/* Header & Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-10 p-4 pointer-events-none">
        <div className="max-w-7xl mx-auto flex justify-between items-start">
          {/* Title */}
          <div className="bg-white/90 backdrop-blur shadow-sm border border-slate-200 rounded-2xl p-4 pointer-events-auto flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white shadow-lg">
              <Monitor size={20} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">MindMap</h1>
              <p className="text-xs text-slate-500 font-medium">Pro Converter</p>
            </div>
          </div>

          {/* Actions */}
          {/* Actions Toolbar */}
          <div className="flex gap-4 pointer-events-auto">

            {/* File Group */}
            <div className="bg-white/90 backdrop-blur shadow-sm border border-slate-200 rounded-2xl p-2 flex items-center gap-1">
              <button
                onClick={() => fileInputRef.current.click()}
                className="p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all"
                title="Open File"
              >
                <Upload size={20} />
                <input ref={fileInputRef} type="file" accept=".mm" className="hidden" onChange={handleFileUpload} />
              </button>
              <button
                onClick={() => setData(demoData)}
                className="p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all"
                title="Load Demo"
              >
                <Monitor size={20} />
              </button>
            </div>

            {/* View Group */}
            <div className="bg-white/90 backdrop-blur shadow-sm border border-slate-200 rounded-2xl p-2 flex items-center gap-1">
              <button
                onClick={() => mindMapRef.current?.fitToScreen()}
                className="p-2 text-slate-600 hover:text-blue-600 hover:bg-slate-50 rounded-xl transition-all"
                title="Fit to Screen"
              >
                <ZoomIn size={20} />
              </button>
            </div>

            {/* Export Group */}
            <div className="bg-white/90 backdrop-blur shadow-sm border border-slate-200 rounded-2xl p-2 flex items-center gap-2">
              <button
                onClick={() => handleDownload('png')}
                className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:text-blue-600 hover:bg-slate-50 rounded-xl text-sm font-medium transition-all"
                title="Export as PNG Image"
              >
                <ImageIcon size={18} />
                <span>PNG</span>
              </button>
              <div className="w-px h-6 bg-slate-200"></div>
              <button
                onClick={() => handleDownload('pdf')}
                className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:text-blue-600 hover:bg-slate-50 rounded-xl text-sm font-medium transition-all"
                title="Export as PDF Document"
              >
                <FileText size={18} />
                <span>PDF</span>
              </button>
              <div className="w-px h-6 bg-slate-200"></div>
              <button
                onClick={() => handleDownload('json')}
                className="flex items-center gap-2 px-3 py-2 text-slate-700 hover:text-blue-600 hover:bg-slate-50 rounded-xl text-sm font-medium transition-all"
                title="Export as JSON Data"
              >
                <FileJson size={18} />
                <span>JSON</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Viz */}
      <div className="flex-1 relative">
        <MindMap
          ref={mindMapRef}
          data={data}
          onNodeClick={handleNodeClick}
          onNodeContextMenu={handleNodeContextMenu}
          onEdit={handleStartEdit}
        />

        {/* Empty State / Drop Zone Hint */}
        {!data && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-slate-400 text-center">
              <Upload size={48} className="mx-auto mb-4 opacity-50" />
              <p className="text-lg">Drag & Drop .mm file here</p>
            </div>
          </div>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu.visible && (
        <div
          className="fixed z-50 bg-white rounded-xl shadow-xl border border-slate-100 py-2 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={handleAddChild} className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
            <Plus size={14} /> Add Child
          </button>
          <button onClick={() => handleStartEdit()} className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center gap-2">
            <Edit2 size={14} /> Edit Text
          </button>
          <div className="h-px bg-slate-100 my-1"></div>
          <button onClick={handleDeleteNode} className="w-full px-4 py-2 text-left text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
            <Trash2 size={14} /> Delete Node
          </button>
        </div>
      )}

      {/* Edit Input */}
      {editInput.visible && (
        <input
          autoFocus
          value={editInput.value}
          onChange={(e) => setEditInput({ ...editInput, value: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 px-3 py-1.5 rounded-lg border-2 border-blue-500 shadow-lg outline-none text-sm font-medium text-slate-900 bg-white"
          style={{
            left: editInput.x,
            top: editInput.y,
            minWidth: editInput.width
          }}
        />
      )}

      {/* Footer Credit */}
      <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
        <p className="text-xs text-slate-400">Created by Gilang</p>
      </div>
    </div>
  );
}

export default App;
