"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { callFlowsApi } from "@/entities/call-flow/api/call-flows-api";
import type { CallFlow } from "@/entities/call-flow/api/call-flows-api";
import { phoneNumbersApi } from "@/entities/phone-number/api/phone-numbers-api";
import type { PhoneNumber } from "@/entities/phone-number/api/phone-numbers-api";
import { getCompanyId } from "@/shared/auth/company";
import { getDevCallWsUrl } from "../lib/dev-call-url";
import { makeLog, stringifyToolPayload } from "../lib/logs";
import {
  NO_FLOW,
  NO_PHONE_NUMBER,
  type CallLog,
  type CallStatus,
  type DevCallEvent,
  type LogKind,
} from "../model/types";
import { useCallAudioCapture } from "./useCallAudioCapture";
import { usePcmPlayback } from "./usePcmPlayback";

export function useDevCall() {
  const [companyId, setCompanyId] = useState("");
  const [flows, setFlows] = useState<CallFlow[]>([]);
  const [phoneNumbers, setPhoneNumbers] = useState<PhoneNumber[]>([]);
  const [selectedFlowId, setSelectedFlowId] = useState(NO_FLOW);
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState(NO_PHONE_NUMBER);
  const [status, setStatus] = useState<CallStatus>("idle");
  const [muted, setMuted] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [logs, setLogs] = useState<CallLog[]>([]);

  useEffect(() => {
    setLogs((prev) =>
      prev.length === 0
        ? [makeLog("system", "開始するとブラウザのマイクで開発用の疑似通話を開始します。")]
        : prev,
    );
  }, []);

  const wsRef = useRef<WebSocket | null>(null);
  const mutedRef = useRef(false);
  const statusRef = useRef<CallStatus>("idle");
  const audioGateOpenRef = useRef(false);
  const intentionalCloseRef = useRef(false);

  const { playPcm16, cleanupPlayback } = usePcmPlayback();
  const { startAudioCapture, cleanupAudioCapture } = useCallAudioCapture({
    audioGateOpenRef,
    mutedRef,
  });

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
    cleanupAudioCapture();
    cleanupPlayback();

    const ws = wsRef.current;
    if (ws && ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
    wsRef.current = null;
  }, [cleanupAudioCapture, cleanupPlayback]);

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
          replaceLatestAssistant(event.text);
          break;
        case "user_transcript":
          appendLog("user", event.text);
          break;
        case "function_call":
          appendLog("tool", `tool call: ${event.name}\n${event.arguments || "{}"}`);
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
    [appendAssistantDelta, appendLog, cleanupCall, replaceLatestAssistant]
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
            appendLog("error", `マイクの準備に失敗しました: ${(err as Error).message}`);
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

  useEffect(() => () => cleanupCall(), [cleanupCall]);

  return {
    state: {
      companyId,
      flows,
      phoneNumbers,
      selectedFlowId,
      selectedPhoneNumberId,
      status,
      statusLabel,
      muted,
      loadingSettings,
      logs,
      connected,
    },
    actions: {
      setSelectedFlowId,
      setSelectedPhoneNumberId,
      reloadSettings,
      toggleMuted,
      startCall,
      endCall,
    },
  };
}
