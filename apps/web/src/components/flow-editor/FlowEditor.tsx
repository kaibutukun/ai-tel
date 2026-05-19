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

import { Save, Undo2, Redo2, ZoomIn, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { callFlowsApi } from "@/lib/api/call-flows";
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
  flowId: string;
  flowName: string;
  flowStatus: string;
  initialFlowJson?: unknown;
  onSaved?: (flowJson: object) => void;
}

const BASIC_INFO_MAX_LENGTH = 30;

function getInitialFlow(flowJson: unknown) {
  if (
    flowJson &&
    typeof flowJson === "object" &&
    "nodes" in flowJson &&
    "edges" in flowJson &&
    Array.isArray((flowJson as { nodes: unknown }).nodes) &&
    Array.isArray((flowJson as { edges: unknown }).edges)
  ) {
    const parsed = flowJson as {
      nodes: Node<AnyNodeData>[];
      edges: Edge[];
      basicInfo?: unknown;
    };
    return {
      nodes: parsed.nodes,
      edges: parsed.edges,
      basicInfo: parseBasicInfo(parsed.basicInfo),
    };
  }

  return { nodes: initialNodes, edges: initialEdges, basicInfo: "" };
}

function parseBasicInfo(value: unknown) {
  if (typeof value === "string") return value.slice(0, BASIC_INFO_MAX_LENGTH);
  if (Array.isArray(value)) {
    return value
      .filter((line): line is string => typeof line === "string")
      .join(" ")
      .slice(0, BASIC_INFO_MAX_LENGTH);
  }
  return "";
}

function syncNodeCounter(nodes: Node[]) {
  const maxId = nodes.reduce((max, node) => {
    const match = /^node-(\d+)$/.exec(node.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, nodeIdCounter);
  nodeIdCounter = maxId;
}

export function FlowEditor({
  flowId,
  flowName,
  flowStatus,
  initialFlowJson,
  onSaved,
}: FlowEditorProps) {
  const initialFlow = getInitialFlow(initialFlowJson);
  syncNodeCounter(initialFlow.nodes);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);
  const [selectedNode, setSelectedNode] = useState<Node<AnyNodeData> | null>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
  const [saved, setSaved] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [basicInfoOpen, setBasicInfoOpen] = useState(false);
  const [basicInfo, setBasicInfo] = useState<string>(initialFlow.basicInfo);
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

  const handleBasicInfoChange = useCallback((value: string) => {
    setBasicInfo(value.slice(0, BASIC_INFO_MAX_LENGTH));
    setSaved(false);
  }, []);

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
  const handleSave = useCallback(async (options?: { closeBasicInfo?: boolean }) => {
    if (!rfInstance) return;
    const flow = {
      ...rfInstance.toObject(),
      basicInfo: basicInfo.trim(),
    };
    setSaving(true);
    setSaveError(null);

    try {
      await callFlowsApi.update(flowId, { flowJson: flow });
      setSaved(true);
      onSaved?.(flow);
      if (options?.closeBasicInfo) setBasicInfoOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }, [basicInfo, flowId, onSaved, rfInstance]);

  return (
    <div className="relative flex h-full w-full">
      {/* Left: node palette */}
      <NodePalette
        onAddNode={handleAddNode}
        onBasicInfoClick={() => setBasicInfoOpen(true)}
      />

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
                default: return "#6366f1";
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
                onClick={() => void handleSave()}
                className={saved ? "opacity-60" : ""}
                disabled={saved || saving}
              >
                <Save className="w-3.5 h-3.5 mr-1.5" />
                {saving ? "保存中..." : saved ? "保存済" : "保存"}
              </Button>
            </div>
            {saveError && (
              <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-md px-2 py-1">
                {saveError}
              </p>
            )}
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

      {basicInfoOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/20">
          <div className="w-[420px] rounded-lg border border-gray-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">基本情報</h2>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setBasicInfoOpen(false)}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
            <div className="p-4">
              <Label htmlFor="basic-info" className="sr-only">
                基本情報
              </Label>
              <div className="relative">
                <Textarea
                  id="basic-info"
                  value={basicInfo}
                  maxLength={BASIC_INFO_MAX_LENGTH}
                  rows={3}
                  className="pr-12 pb-7"
                  placeholder="例: 美容院の受付担当です。丁寧に接客してください。"
                  onChange={(event) => handleBasicInfoChange(event.target.value)}
                />
                <span className="pointer-events-none absolute bottom-2 right-3 text-[11px] text-gray-400">
                  {basicInfo.length}/{BASIC_INFO_MAX_LENGTH}
                </span>
              </div>
            </div>
            <div className="flex justify-end border-t border-gray-200 px-4 py-3">
              <Button
                size="sm"
                onClick={() => void handleSave({ closeBasicInfo: true })}
                disabled={saving}
              >
                {saving ? "保存中..." : "保存"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
