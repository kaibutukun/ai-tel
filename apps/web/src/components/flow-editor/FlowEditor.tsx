"use client";

import { useCallback, useRef, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  ReactFlowInstance,
  NodeTypes,
  BackgroundVariant,
  Panel,
  MarkerType,
} from "reactflow";
import "reactflow/dist/style.css";

import { Save, Undo2, Redo2, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { NodePalette } from "./NodePalette";
import { NodeConfigPanel } from "./NodeConfigPanel";
import { initialNodes, initialEdges } from "./initialFlowData";
import { AnyNodeData } from "./types";

import StartNode from "./nodes/StartNode";
import MessageNode from "./nodes/MessageNode";
import ConditionNode from "./nodes/ConditionNode";
import ActionNode from "./nodes/ActionNode";
import EndNode from "./nodes/EndNode";

const nodeTypes: NodeTypes = {
  start: StartNode,
  message: MessageNode,
  condition: ConditionNode,
  action: ActionNode,
  end: EndNode,
};

let nodeIdCounter = 100;
function newId() {
  return `node-${++nodeIdCounter}`;
}

interface FlowEditorProps {
  flowName: string;
  flowStatus: string;
}

export function FlowEditor({ flowName, flowStatus }: FlowEditorProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node<AnyNodeData> | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [saved, setSaved] = useState(true);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);

  // ──────── connect
  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            style: { strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
          },
          eds
        )
      );
      setSaved(false);
    },
    [setEdges]
  );

  // ──────── select
  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node as Node<AnyNodeData>);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  // ──────── node data update
  const handleNodeChange = useCallback(
    (id: string, data: Partial<AnyNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, ...data } } : n
        )
      );
      setSelectedNode((prev) =>
        prev?.id === id ? { ...prev, data: { ...prev.data, ...data } } : prev
      );
      setSaved(false);
    },
    [setNodes]
  );

  // ──────── delete node
  const handleDeleteNode = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== id));
      setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
      setSelectedNode(null);
      setSaved(false);
    },
    [setNodes, setEdges]
  );

  // ──────── add node from palette (click)
  const handleAddNode = useCallback(
    (type: string, data: Record<string, unknown>) => {
      const center = rfInstance?.getViewport();
      const x = center ? (window.innerWidth / 2 - center.x) / center.zoom : 400;
      const y = center ? (window.innerHeight / 2 - center.y) / center.zoom : 300;

      const newNode: Node = {
        id: newId(),
        type,
        position: { x: x + Math.random() * 40 - 20, y: y + Math.random() * 40 - 20 },
        data,
      };
      setNodes((nds) => [...nds, newNode]);
      setSaved(false);
    },
    [rfInstance, setNodes]
  );

  // ──────── drag-and-drop from palette
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const type = e.dataTransfer.getData("application/reactflow/type");
      const rawData = e.dataTransfer.getData("application/reactflow/data");
      if (!type || !rfInstance || !reactFlowWrapper.current) return;

      const data = rawData ? JSON.parse(rawData) : {};
      const bounds = reactFlowWrapper.current.getBoundingClientRect();
      const position = rfInstance.project({
        x: e.clientX - bounds.left,
        y: e.clientY - bounds.top,
      });

      const newNode: Node = { id: newId(), type, position, data };
      setNodes((nds) => [...nds, newNode]);
      setSaved(false);
    },
    [rfInstance, setNodes]
  );

  // ──────── save
  const handleSave = useCallback(() => {
    if (!rfInstance) return;
    const flow = rfInstance.toObject();
    console.log("Saving flow:", JSON.stringify(flow, null, 2));
    // TODO: POST /api/call-flows/:id with flow JSON
    setSaved(true);
  }, [rfInstance]);

  return (
    <div className="flex h-full w-full">
      {/* Left: node palette */}
      <NodePalette onAddNode={handleAddNode} />

      {/* Center: canvas */}
      <div ref={reactFlowWrapper} className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={(changes) => {
            onNodesChange(changes);
            setSaved(false);
          }}
          onEdgesChange={(changes) => {
            onEdgesChange(changes);
            setSaved(false);
          }}
          onConnect={onConnect}
          onInit={setRfInstance}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.15 }}
          deleteKeyCode="Delete"
          className="bg-gray-50"
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1.5}
            color="#d1d5db"
          />
          <Controls className="!shadow-md !rounded-lg !border !border-gray-200" />
          <MiniMap
            nodeColor={(n) => {
              switch (n.type) {
                case "start": return "#22c55e";
                case "message": return "#3b82f6";
                case "condition": return "#f59e0b";
                case "end": return "#ef4444";
                default: return "#8b5cf6";
              }
            }}
            className="!shadow-md !rounded-lg !border !border-gray-200"
            zoomable
            pannable
          />

          {/* Top bar inside canvas */}
          <Panel position="top-center">
            <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl shadow-md px-4 py-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-800">{flowName}</span>
                <Badge variant={flowStatus === "PUBLISHED" ? "success" : "secondary"}>
                  {flowStatus === "PUBLISHED" ? "公開中" : "下書き"}
                </Badge>
              </div>
              <div className="w-px h-5 bg-gray-200" />
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                  <Undo2 className="w-4 h-4 text-gray-400" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" disabled>
                  <Redo2 className="w-4 h-4 text-gray-400" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => rfInstance?.fitView({ padding: 0.15 })}>
                  <ZoomIn className="w-4 h-4 text-gray-500" />
                </Button>
              </div>
              <div className="w-px h-5 bg-gray-200" />
              <Button
                size="sm"
                onClick={handleSave}
                className={saved ? "opacity-60" : ""}
                disabled={saved}
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {saved ? "保存済み" : "保存する"}
              </Button>
            </div>
          </Panel>

          {/* Hint */}
          <Panel position="bottom-center">
            <p className="text-xs text-gray-400 bg-white/80 px-3 py-1 rounded-full border border-gray-200">
              ノードをドラッグして移動 / ハンドルをドラッグして接続 / Delete キーで削除
            </p>
          </Panel>
        </ReactFlow>
      </div>

      {/* Right: config panel */}
      {selectedNode && (
        <NodeConfigPanel
          node={selectedNode}
          onChange={handleNodeChange}
          onClose={() => setSelectedNode(null)}
          onDelete={handleDeleteNode}
        />
      )}
    </div>
  );
}
