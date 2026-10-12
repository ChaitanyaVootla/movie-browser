"use client";

/**
 * The `ai-chat-trigger` window event → AssistantFloaty. Without `prefill` the
 * message is sent at once (existing behaviour); with `prefill: true` the chat
 * opens with the text in the input and focus set, and nothing is sent
 * (taste v2 §5.1 "Steer with words").
 */
import { useEffect, useRef } from "react";
import { AI_CHAT_TRIGGER_EVENT, type AiChatTriggerDetail } from "./types";

export interface ChatTriggerHandlers {
  send: (message: string) => void;
  prefill: (message: string) => void;
}

function isTriggerDetail(d: unknown): d is AiChatTriggerDetail {
  return typeof d === "object" && d !== null && typeof (d as { message?: unknown }).message === "string";
}

export function useChatTrigger(handlers: ChatTriggerHandlers): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => {
    const onTrigger = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isTriggerDetail(detail) || !detail.message.trim()) return;
      if (detail.prefill === true) ref.current.prefill(detail.message);
      else ref.current.send(detail.message);
    };
    window.addEventListener(AI_CHAT_TRIGGER_EVENT, onTrigger);
    return () => window.removeEventListener(AI_CHAT_TRIGGER_EVENT, onTrigger);
  }, []);
}

/**
 * Focus the chat input (cursor at the end) whenever `signal` changes to a
 * truthy value. `delayMs` lets the mobile drawer wait out its open animation
 * (focusing mid-flight makes the keyboard resize fight the transition).
 */
export function useFocusOnSignal(
  ref: { current: HTMLInputElement | null },
  signal: number | undefined,
  delayMs = 0
): void {
  useEffect(() => {
    if (!signal) return;
    const focus = () => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    };
    const timer = setTimeout(focus, delayMs);
    return () => clearTimeout(timer);
  }, [ref, signal, delayMs]);
}
