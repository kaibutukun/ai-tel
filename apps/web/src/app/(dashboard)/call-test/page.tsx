"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Mic,
  MicOff,
  PhoneOff,
  Play,
  RefreshCw,
  Volume2,
  Wrench,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { callFlowsApi, type CallFlow } from "@/lib/api/call-flows";
import { phoneNumbersApi, type PhoneNumber } from "@/lib/api/phone-numbers";
import { getCompanyId } from "@/lib/get-company-id";

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const INPUT_SAMPLE_RATE = 24000;
const NO_FLOW = "__no_flow__";
const NO_PHONE_NUMBER = "__no_phone_number__";

type CallStatus = "idle" | "connecting" | "connected" | "ended" | "error";

type LogKind = "system" | "assistant" | "user" | "tool" | "error";

type CallLog = {
  id: string;
  kind: LogKind;
  message: string;
  time: string;
};

type DevCallEvent =
  | {
      type: "started";
      callSessionId: string;
      providerCallId: string;
      flowId: string | null;
      phoneNumberId: string | null;
    }
  | { type: "text_delta"; text: string }
  | { type: "user_transcript"; text: string }
  | { type: "assistant_transcript_done"; text: string }
  | { type: "function_call"; callId: string; name: string; arguments: string }
  | {
      type: "tool_result";
      callId: string;
      name: string;
      output: Record<string, unknown>;
      sideEffect?: Record<string, unknown>;
    }
  | { type: "error"; message: string }
  | { type: "ended"; reason: string };

function getDevCallWsUrl() {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001/api";
  const apiUrl = new URL(apiBase);
  const basePath = apiUrl.pathname.replace(/\/api\/?$/, "");
  apiUrl.protocol = apiUrl.protocol === "https:" ? "wss:" : "ws:";
  apiUrl.pathname = `${basePath}/dev-call/media-stream`.replace(/\/{2,}/g, "/");
  apiUrl.search = "";
  return apiUrl.toString();
}

function formatNow() {
  return new Date().toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function makeLog(kind: LogKind, message: string): CallLog {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind,
    message,
    time: formatNow(),
  };
}

function clampSample(value: number) {
  return Math.max(-1, Math.min(1, value));
}

function convertFloat32ToPcm16(input: Float32Array, inputRate: number) {
  const ratio = inputRate / INPUT_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.floor(input.length / ratio));
  const output = new Int16Array(outputLength);

  for (let i = 0; i < outputLength; i += 1) {
    const sample = clampSample(input[Math.floor(i * ratio)] ?? 0);
    output[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
  }

  return output;
}

function stringifyToolPayload(value: unknown) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function CallTestPage() {
  const [companyId, setCompanyId] = useState("");
  const [flows, setFlows] = useState<CallFlow[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState(NO_FLOW);
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState(NO_PHONE_NUMBER);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [logs, setLogs] = useState<CallLog[]>([
    makeLog("system", "開始するとブラウザのマイクで開発用の疑似通話を開始します。"),
  ]);

  const wsRef = useRef<WebSocket | null>(null);
  const inputContextRef = useRef<AudioContext | null>(null);
  const playbackContextRef = useRef<AudioContext | null>(null);
  const nextPlaybackAtRef = useRef(0);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mutedRef = useRef(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  /** status の最新値を closure 越しに参照するため */
  const statusRef = useRef<CallStatus>("idle");
  /** 「started 受信前は音声を送らない」フラグ。bridge listener アタッチ前のフレームロスを防ぐ */
  const audioGateOpenRef = useRef(false);
  /** ユーザー操作で意図的に終了したか。重複ログ抑止に使う */
  const intentionalCloseRef = useRef(false);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const connected = status === "connecting" || status === "connected";

  const statusLabel = useMemo(() => {
    switch (status) {
      case "connecting":
        return "接続中";
      case "connected":
        return "通話中";
      case "ended":
        return "終了";
      case "error":
        return "エラー";
      default:
        return "待機中";
    }
  }, [status]);

  const appendLog = useCallback((kind: LogKind, message: string) => {
    setLogs((prev) => [...prev, makeLog(kind, message)]);
  }, []);

  const appendAssistantDelta = useCallback((text: string) => {
    setLogs((prev) => {
      const last = prev[prev.length - 1];
      if (last?.kind === "assistant") {
        return [...prev.slice(0, -1), { ...last, message: `${last.message}${text}` }];
      }
      return [...prev, makeLog("assistant", text)];
    });
  }, []);

  /** 確定した AI 発話で、ストリーミング途中の assistant バブルを置き換える。
   * - assistant が直近なら中身を確定文に差し替え
   * - 既に別 kind が挟まっていれば新規バブルとして追加 */
  const replaceLatestAssistant = useCallback((text: string) => {
    setLogs((prev) => {
      const last = prev[prev.length - 1];
      if (last?.kind === "assistant") {
        return [...prev.slice(0, -1), { ...last, message: text }];
      }
      return [...prev, makeLog("assistant", text)];
    });
  }, []);

  const cleanupCall = useCallback(() => {
    audioGateOpenRef.current = false;

    processorRef.current?.disconnect();
    sourceRef.current?.disconnect();
    processorRef.current = null;
    sourceRef.current = null;

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    inputContextRef.current?.close().catch(() => undefined);
    inputContextRef.current = null;

    playbackContextRef.current?.close().catch(() => undefined);
    playbackContextRef.current = null;
    nextPlaybackAtRef.current = 0;

    const ws = wsRef.current;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
    wsRef.current = null;
  }, []);

  const playPcm16 = useCallback((buffer: ArrayBuffer) => {
    if (buffer.byteLength === 0) return;

    const context = playbackContextRef.current ?? new AudioContext();
    playbackContextRef.current = context;

    const samples = new Int16Array(buffer);
    const audioBuffer = context.createBuffer(1, samples.length, INPUT_SAMPLE_RATE);
    const channel = audioBuffer.getChannelData(0);
    for (let i = 0; i < samples.length; i += 1) {
      channel[i] = samples[i] / 0x8000;
    }

    const source = context.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(context.destination);

    const startAt = Math.max(context.currentTime + 0.02, nextPlaybackAtRef.current);
    source.start(startAt);
    nextPlaybackAtRef.current = startAt + audioBuffer.duration;
  }, []);

  const handleDevEvent = useCallback(
    (event: DevCallEvent) => {
      switch (event.type) {
        case "started":
          setStatus("connected");
          audioGateOpenRef.current = true;
          appendLog("system", `テスト通話を開始しました: ${event.providerCallId}`);
          break;
        case "text_delta":
          appendAssistantDelta(event.text);
          break;
        case "assistant_transcript_done":
          // 1 ターン分の AI 発話が確定したら、ストリーミング途中のバブルを最終文に置き換える
          replaceLatestAssistant(event.text);
          break;
        case "user_transcript":
          appendLog("user", event.text);
          break;
        case "function_call":
          appendLog(
            "tool",
            `tool call: ${event.name}\n${event.arguments || "{}"}`
          );
          break;
        case "tool_result":
          appendLog(
            "tool",
            `tool result: ${event.name}\n${stringifyToolPayload({
              output: event.output,
              sideEffect: event.sideEffect,
            })}`
          );
          break;
        case "ended":
          intentionalCloseRef.current = true;
          setStatus("ended");
          appendLog("system", `通話が終了しました: ${event.reason}`);
          cleanupCall();
          break;
        case "error":
          intentionalCloseRef.current = true;
          setStatus("error");
          appendLog("error", event.message);
          break;
      }
    },
    [appendAssistantDelta, appendLog, cleanupCall]
  );

  const startAudioCapture = useCallback(
    async (ws: WebSocket) => {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
      const context = new AudioContextCtor();
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);

      processor.onaudioprocess = (event) => {
        // audioGateOpenRef: サーバー側で bridge listener が attach されるまで送らない
        if (
          !audioGateOpenRef.current ||
          mutedRef.current ||
          ws.readyState !== WebSocket.OPEN
        ) {
          return;
        }
        const input = event.inputBuffer.getChannelData(0);
        const pcm = convertFloat32ToPcm16(input, context.sampleRate);
        ws.send(pcm.buffer);
      };

      source.connect(processor);
      processor.connect(context.destination);

      mediaStreamRef.current = stream;
      inputContextRef.current = context;
      sourceRef.current = source;
      processorRef.current = processor;
    },
    []
  );

  const startCall = useCallback(async () => {
    if (!companyId || connected) return;

    intentionalCloseRef.current = false;
    audioGateOpenRef.current = false;
    setStatus("connecting");
    setLogs([makeLog("system", "マイクを準備しています。")]);

    try {
      const ws = new WebSocket(getDevCallWsUrl());
      ws.binaryType = "arraybuffer";
      wsRef.current = ws;

      ws.onopen = () => {
        // ws.onopen は同期に保つ。マイク取得の await は別の async 関数に分けて、
        // ここで失敗を握り潰さないようにする。
        ws.send(
          JSON.stringify({
            event: "dev_call:start",
            companyId,
            flowId: selectedFlowId === NO_FLOW ? undefined : selectedFlowId,
            phoneNumberId:
              selectedPhoneNumberId === NO_PHONE_NUMBER
                ? undefined
                : selectedPhoneNumberId,
          })
        );
        startAudioCapture(ws)
          .then(() => {
            appendLog("system", "接続しました。AI の応答を待っています。");
          })
          .catch((err) => {
            intentionalCloseRef.current = true;
            setStatus("error");
            appendLog(
              "error",
              `マイクの準備に失敗しました: ${(err as Error).message}`
            );
            cleanupCall();
          });
      };

      ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playPcm16(event.data);
          return;
        }
        if (typeof event.data === "string") {
          try {
            handleDevEvent(JSON.parse(event.data) as DevCallEvent);
          } catch {
            appendLog("error", "サーバーイベントの解析に失敗しました。");
          }
        }
      };

      ws.onerror = () => {
        // onerror の直後に onclose が来る。onclose 側でステータスをまとめて確定するので、
        // ここでは log のみ残してステータスは触らない (closing→ended/error のフリッカー回避)。
        if (statusRef.current === "connecting" || statusRef.current === "connected") {
          appendLog("error", "WebSocket 接続でエラーが発生しました。");
        }
      };

      ws.onclose = () => {
        const cur = statusRef.current;
        if (!intentionalCloseRef.current && cur !== "ended" && cur !== "error") {
          setStatus(cur === "idle" ? "error" : "ended");
          appendLog(
            "system",
            cur === "connecting"
              ? "サーバーへの接続に失敗しました。"
              : "接続が閉じられました。"
          );
        }
        cleanupCall();
      };
    } catch (err) {
      intentionalCloseRef.current = true;
      setStatus("error");
      cleanupCall();
      appendLog("error", (err as Error).message);
    }
  }, [
    appendLog,
    cleanupCall,
    companyId,
    connected,
    handleDevEvent,
    playPcm16,
    selectedFlowId,
    selectedPhoneNumberId,
    startAudioCapture,
  ]);

  const endCall = useCallback(() => {
    intentionalCloseRef.current = true;
    appendLog("system", "テスト通話を終了しました。");
    setStatus("ended");
    cleanupCall();
  }, [appendLog, cleanupCall]);

  const toggleMuted = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      appendLog("system", next ? "マイクをミュートしました。" : "ミュートを解除しました。");
      return next;
    });
  }, [appendLog]);

  const reloadSettings = useCallback(async () => {
    const nextCompanyId = getCompanyId();
    setCompanyId(nextCompanyId);
    if (!nextCompanyId) {
      setLoadingSettings(false);
      return;
    }

    setLoadingSettings(true);
    try {
      const [flowRes, phoneRes] = await Promise.all([
        callFlowsApi.list(nextCompanyId),
        phoneNumbersApi.list(nextCompanyId),
      ]);
      setFlows(flowRes.data);
      setPhoneNumbers(phoneRes.data);
      setSelectedFlowId(flowRes.data[0]?.id ?? NO_FLOW);
      setSelectedPhoneNumberId(phoneRes.data[0]?.id ?? NO_PHONE_NUMBER);
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  useEffect(() => {
    void reloadSettings();
  }, [reloadSettings]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [logs]);

  useEffect(() => () => cleanupCall(), [cleanupCall]);

  return (
    <>
      <Header title="通話テスト" />
      <main className="flex-1 p-6 space-y-6">
        <section className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[260px_260px]">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">対応フロー</label>
                <Select
                  value={selectedFlowId}
                  onValueChange={setSelectedFlowId}
                  disabled={connected || loadingSettings}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="フローを選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_FLOW}>フローなし</SelectItem>
                    {flows.map((flow) => (
                      <SelectItem key={flow.id} value={flow.id}>
                        {flow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">電話番号設定</label>
                <Select
                  value={selectedPhoneNumberId}
                  onValueChange={setSelectedPhoneNumberId}
                  disabled={connected || loadingSettings}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="番号設定を選択" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_PHONE_NUMBER}>指定なし</SelectItem>
                    {phoneNumbers.map((phoneNumber) => (
                      <SelectItem key={phoneNumber.id} value={phoneNumber.id}>
                        {phoneNumber.displayName ?? phoneNumber.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Badge
                variant={
                  status === "connected"
                    ? "success"
                    : status === "error"
                      ? "destructive"
                      : status === "connecting"
                        ? "warning"
                        : "secondary"
                }
              >
                {statusLabel}
              </Badge>
              <Button variant="outline" size="icon" onClick={reloadSettings} disabled={connected}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="outline" onClick={toggleMuted} disabled={!connected}>
                {muted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                {muted ? "ミュート中" : "マイク"}
              </Button>
              {connected ? (
                <Button variant="destructive" onClick={endCall}>
                  <PhoneOff className="mr-2 h-4 w-4" />
                  終了
                </Button>
              ) : (
                <Button onClick={startCall} disabled={!companyId || loadingSettings}>
                  <Play className="mr-2 h-4 w-4" />
                  開始
                </Button>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_360px]">
          <div className="bg-white border border-gray-200 rounded-lg">
            <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-semibold text-gray-900">通話ログ</h2>
              </div>
              <span className="text-xs text-gray-500">音声応答はスピーカーから再生されます</span>
            </div>
            <div className="h-[520px] overflow-y-auto p-5 space-y-3">
              {logs.map((log) => {
                if (log.kind === "user") {
                  return (
                    <div key={log.id} className="flex justify-end">
                      <div className="max-w-[75%] rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2 text-white shadow-sm">
                        <p className="whitespace-pre-wrap text-sm leading-6">{log.message}</p>
                        <p className="mt-1 text-right text-[10px] text-blue-100">
                          お客様 ・ {log.time}
                        </p>
                      </div>
                    </div>
                  );
                }
                if (log.kind === "assistant") {
                  return (
                    <div key={log.id} className="flex justify-start">
                      <div className="max-w-[75%] rounded-2xl rounded-tl-sm bg-gray-100 px-4 py-2 text-gray-900 shadow-sm">
                        <p className="whitespace-pre-wrap text-sm leading-6">{log.message}</p>
                        <p className="mt-1 text-[10px] text-gray-500">AI ・ {log.time}</p>
                      </div>
                    </div>
                  );
                }
                const chipColor =
                  log.kind === "error"
                    ? "bg-red-50 text-red-700 border-red-100"
                    : log.kind === "tool"
                      ? "bg-amber-50 text-amber-800 border-amber-100"
                      : "bg-gray-50 text-gray-600 border-gray-100";
                const chipLabel =
                  log.kind === "error" ? "エラー" : log.kind === "tool" ? "ツール" : "システム";
                return (
                  <div key={log.id} className="flex justify-center">
                    <div
                      className={`max-w-[85%] rounded-md border px-3 py-2 text-xs ${chipColor}`}
                    >
                      <p className="mb-0.5 text-[10px] opacity-70">
                        {chipLabel} ・ {log.time}
                      </p>
                      <p className="whitespace-pre-wrap leading-5">{log.message}</p>
                    </div>
                  </div>
                );
              })}
              <div ref={logEndRef} />
            </div>
          </div>

          <aside className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-semibold text-gray-900">接続情報</h2>
            </div>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-xs text-gray-500">WebSocket</dt>
                <dd className="mt-1 break-all text-gray-800">{getDevCallWsUrl()}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">音声形式</dt>
                <dd className="mt-1 text-gray-800">PCM16 / 24kHz / mono</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">会社ID</dt>
                <dd className="mt-1 break-all text-gray-800">{companyId || "未取得"}</dd>
              </div>
            </dl>
            <div className="border-t border-gray-200 pt-5">
              <div className="mb-2 flex items-center gap-2">
                <Wrench className="h-4 w-4 text-amber-600" />
                <h3 className="text-sm font-semibold text-gray-900">確認できる動き</h3>
              </div>
              <p className="text-sm leading-6 text-gray-600">
                FAQ検索、資料検索、情報収集、通知、転送、通話終了のツール呼び出しはログに表示されます。
              </p>
            </div>
          </aside>
        </section>
      </main>
    </>
  );
}
