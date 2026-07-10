"use client";

import { useEffect, useRef, useState } from "react";
import {
  AiChatMessage,
  BillBreakdown,
  Config,
  DerivedMonthlyData,
  LoadShiftAnalysis,
  MonthSummary,
  TariffPrices,
} from "@/lib/types";
import { buildAiSystemPrompt } from "@/lib/aiContext";
import { computeMonthSummary } from "@/lib/calculations";
import { getAllCachedMonthKeys, getCachedMonth } from "@/lib/cache";

interface AiChatProps {
  config: Config;
  monthKey: string;
  derived: DerivedMonthlyData | null;
  bill: BillBreakdown | null;
  billWithoutSolar: number | null;
  tariff: TariffPrices;
  loadShift: LoadShiftAnalysis | null;
  hasFusionSolar: boolean;
  hasConsumption: boolean;
}

const SUGGESTED_QUESTIONS = [
  "Koliko sam uštedio ovaj mjesec zahvaljujući solaru?",
  "Koji je bio najbolji dan proizvodnje i zašto?",
  "Usporedi zadnja dva mjeseca po proizvodnji i računu.",
  "Kada je najbolje pokrenuti perilicu da maksimalno iskoristim solar?",
  "Izračunaj koliko bi platio da nemam solarne panele cijelu godinu.",
];

/** Parse OpenRouter SSE chunk lines and return concatenated content deltas */
function extractDeltasFromSseLines(lines: string[]): string {
  let text = "";
  for (const line of lines) {
    /* OpenRouter sends ": OPENROUTER PROCESSING" keep-alive comments */
    if (!line.startsWith("data: ")) continue;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") continue;
    try {
      const parsed = JSON.parse(payload);
      const delta = parsed.choices?.[0]?.delta?.content;
      if (typeof delta === "string") {
        text += delta;
      }
    } catch {
      /* Incomplete JSON should not happen for complete lines — skip */
    }
  }
  return text;
}

export default function AiChat({
  config,
  monthKey,
  derived,
  bill,
  billWithoutSolar,
  tariff,
  loadShift,
  hasFusionSolar,
  hasConsumption,
}: AiChatProps) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorText, setErrorText] = useState("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const hasApiKey = config.openRouterApiKey.trim().length > 0;

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  async function loadAllMonthSummaries(): Promise<MonthSummary[]> {
    const monthKeys = await getAllCachedMonthKeys();
    const summaries: MonthSummary[] = [];
    for (const key of monthKeys.sort()) {
      const cached = await getCachedMonth(key);
      if (cached) {
        summaries.push(computeMonthSummary(cached, config));
      }
    }
    return summaries;
  }

  async function sendMessage(questionText: string) {
    const trimmedQuestion = questionText.trim();
    if (!trimmedQuestion || isStreaming || !hasApiKey) return;

    setErrorText("");
    setInputText("");
    const historyWithQuestion: AiChatMessage[] = [...messages, { role: "user", content: trimmedQuestion }];
    setMessages([...historyWithQuestion, { role: "assistant", content: "" }]);
    setIsStreaming(true);

    try {
      const monthSummaries = await loadAllMonthSummaries();
      const systemPrompt = buildAiSystemPrompt({
        config,
        monthKey,
        derived,
        bill,
        billWithoutSolar,
        tariff,
        loadShift,
        monthSummaries,
        hasFusionSolar,
        hasConsumption,
      });

      const response = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          apiKey: config.openRouterApiKey,
          model: config.openRouterModel,
          messages: [{ role: "system", content: systemPrompt }, ...historyWithQuestion],
        }),
      });

      if (!response.ok || !response.body) {
        const errorBody = await response.text();
        throw new Error(`${response.status}: ${errorBody.slice(0, 200)}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let lineBuffer = "";
      let assistantText = "";

      /* Stream loop: append content deltas to the last (assistant) message */
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        lineBuffer += decoder.decode(value, { stream: true });
        const lines = lineBuffer.split("\n");
        /* Keep the last, possibly incomplete line in the buffer */
        lineBuffer = lines.pop() ?? "";
        assistantText += extractDeltasFromSseLines(lines);
        setMessages([...historyWithQuestion, { role: "assistant", content: assistantText }]);
      }
      assistantText += extractDeltasFromSseLines([lineBuffer]);

      if (!assistantText) {
        throw new Error("Prazan odgovor modela");
      }
      setMessages([...historyWithQuestion, { role: "assistant", content: assistantText }]);
    } catch (error) {
      setErrorText(`Greška: ${(error as Error).message}`);
      /* Drop the empty assistant placeholder, keep the user's question */
      setMessages(historyWithQuestion);
    } finally {
      setIsStreaming(false);
    }
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(inputText);
    }
  }

  const sectionBox = "bg-surface-1 border border-border rounded-default p-4 mb-4 sm:p-6 sm:mb-6 md:p-8 md:mb-8";
  const sectionHeading = "font-mono text-xs font-semibold uppercase tracking-widest text-text-dim mb-4";
  const noteText = "font-mono text-xs text-text-dim leading-normal";

  const missingKeyNotice = !hasApiKey ? (
    <p className={`${noteText} mb-4`}>
      Za AI asistenta unesite OpenRouter API ključ u Postavkama (sekcija &quot;AI Asistent&quot;).
      Ključ možete besplatno kreirati na openrouter.ai.
    </p>
  ) : null;

  const noDataNotice = hasApiKey && !derived ? (
    <p className={`${noteText} mb-4`}>
      Nema učitanih podataka za odabrani mjesec — asistent će imati samo podatke iz predmemorije.
      Pokrenite analizu na Dashboardu za potpuni kontekst.
    </p>
  ) : null;

  const suggestionButtons =
    hasApiKey && messages.length === 0 ? (
      <div className="flex flex-col items-start gap-2 mb-4">
        {SUGGESTED_QUESTIONS.map((question) => (
          <button
            key={question}
            className="font-mono text-xs text-left text-text-dim border border-border rounded-sm px-3 py-2 cursor-pointer transition-all duration-150 hover:text-amber hover:border-amber/50"
            onClick={() => sendMessage(question)}
            disabled={isStreaming}
          >
            {question}
          </button>
        ))}
      </div>
    ) : null;

  const messageList =
    messages.length > 0 ? (
      <div ref={scrollContainerRef} className="flex flex-col gap-3 max-h-[60vh] overflow-y-auto mb-4 pr-1">
        {messages.map((message, index) => {
          const isUser = message.role === "user";
          const bubbleClasses = isUser
            ? "self-end bg-amber/10 border border-amber/30 text-text"
            : "self-start bg-background border border-border text-text";
          const displayedContent = message.content || "…";
          return (
            <div
              key={index}
              className={`${bubbleClasses} rounded-default px-4 py-3 max-w-[90%] sm:max-w-[80%] font-body text-sm leading-relaxed whitespace-pre-wrap break-words`}
            >
              {displayedContent}
            </div>
          );
        })}
      </div>
    ) : null;

  const errorNotice = errorText ? (
    <p className="font-mono text-xs text-red leading-normal mb-3 break-words">{errorText}</p>
  ) : null;

  const clearButton =
    messages.length > 0 && !isStreaming ? (
      <button
        className="font-mono text-xs text-text-dim border border-border rounded-sm px-3 py-2.5 cursor-pointer transition-all duration-150 hover:text-red hover:border-red/50"
        onClick={() => {
          setMessages([]);
          setErrorText("");
        }}
      >
        Očisti
      </button>
    ) : null;

  const sendButtonLabel = isStreaming ? "..." : "Pošalji";

  return (
    <div className={sectionBox}>
      <h3 className={sectionHeading}>AI Asistent — pitajte bilo što o svojim podacima</h3>
      {missingKeyNotice}
      {noDataNotice}
      {suggestionButtons}
      {messageList}
      {errorNotice}
      <div className="flex gap-2 items-end">
        <textarea
          className="bg-background border border-border rounded-sm px-3 py-2.5 text-text font-body text-sm outline-none transition-all duration-150 w-full resize-y min-h-[44px] focus:border-amber focus:shadow-[0_0_0_2px_rgba(240,164,32,0.2)]"
          rows={2}
          value={inputText}
          onChange={(event) => setInputText(event.target.value)}
          onKeyDown={handleInputKeyDown}
          placeholder={hasApiKey ? "npr. Koliko kWh sam poslao u mrežu prošli tjedan?" : "Prvo unesite OpenRouter API ključ u Postavkama"}
          disabled={!hasApiKey || isStreaming}
        />
        <button
          className="bg-amber text-background border-none rounded-sm px-6 py-2.5 font-body text-sm font-bold cursor-pointer transition-all duration-150 whitespace-nowrap hover:bg-[#f5b030] disabled:opacity-35 disabled:cursor-wait"
          onClick={() => sendMessage(inputText)}
          disabled={!hasApiKey || isStreaming || !inputText.trim()}
        >
          {sendButtonLabel}
        </button>
        {clearButton}
      </div>
      <p className={`${noteText} mt-3`}>
        Model: {config.openRouterModel} — odgovori su generirani AI-em i mogu sadržavati greške. Podaci odabranog mjeseca i sažeci svih učitanih mjeseci šalju se modelu kao kontekst.
      </p>
    </div>
  );
}
