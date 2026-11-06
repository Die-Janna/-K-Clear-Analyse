// Clear-Check: nimmt Standbilder entgegen, prüft den Kurscode und lässt Gemini die Technik analysieren.
// Der API-Schlüssel bleibt hier auf dem Server und ist für Schüler nicht sichtbar.

const KP = [
  { id: "absinken", name: "Schlägerkopf sinkt ab", desc: "Beim Ausholen fällt der Schlägerkopf hinter Kopf und Rücken nach unten ab (Ellbogen oben, Schlägerkopf zeigt Richtung Boden)." },
  { id: "peitsche", name: "Peitschenbewegung", desc: "Der Arm schnellt nach vorn oben: Ellbogen führt, dann Unterarm und Handgelenk mit Einwärtsdrehung (Pronation), wie ein Peitschenschlag." },
  { id: "bein", name: "Gegengleiches Bein vorn", desc: "Seitstellung zum Netz; das Bein auf der Gegenseite der Schlaghand steht vorn." },
  { id: "hohlkreuz", name: "Hohlkreuz", desc: "Beim Ausholen entsteht eine Bogenspannung im Rumpf: Oberkörper leicht nach hinten gebogen, Brust geöffnet, Hüfte nach vorn." },
  { id: "impuls", name: "Impulserhaltung", desc: "Der Schwung wird ohne Stocken von Beinen über Hüfte und Rumpf auf Arm und Schläger übertragen; kein Abbremsen vor dem Treffpunkt, Gewichtsverlagerung nach vorn." },
  { id: "ausschwingen", name: "Ausschwingen", desc: "Nach dem Treffpunkt schwingt der Schläger locker weiter, diagonal vor dem Körper zur Gegenseite nach unten aus; kein abruptes Stoppen." },
  { id: "treffpunkt", name: "Hoher Balltreffpunkt", desc: "Der Ball wird am höchstmöglichen Punkt mit fast gestrecktem Schlagarm getroffen, leicht vor dem Körper." }
];

const env = (name) => {
  try { if (typeof Netlify !== "undefined" && Netlify.env) return Netlify.env.get(name); } catch {}
  try { if (typeof Deno !== "undefined") return Deno.env.get(name); } catch {}
  try { return process.env[name]; } catch {}
  return undefined;
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });

function buildPrompt({ hand, selfNote, times }) {
  const front = hand === "rechts" ? "linke" : "rechte";
  const kpText = KP.map((k, i) => `${i + 1}. id "${k.id}" – ${k.name}: ${k.desc}`).join("\n");
  const frameList = times.map((t, i) => `Bild ${i + 1}: ${t.toFixed(2)} s`).join(", ");
  return [
    "Du bist eine erfahrene Badmintontrainerin und Sportlehrkraft. Du gibst einer Schülerin oder einem Schüler aus einem Sport-Leistungskurs (Oberstufe, 18 Jahre) Rückmeldung zu einem Überkopf-Clear auf der Vorhandseite.",
    "",
    `Du bekommst ${times.length} Standbilder in zeitlicher Reihenfolge aus einem selbst gefilmten Handyvideo, gleichmäßig verteilt über den markierten Schlagabschnitt (${frameList}). Zwischen den Bildern fehlen Phasen; besonders der Treffpunkt kann zwischen zwei Bildern liegen. Schlaghand: ${hand}. Das gegengleiche Bein ist also das ${front} Bein.`,
    selfNote ? `Selbsteinschätzung der Person (nur als Hinweis, worauf sie achtet; prüfe sie am Bild): "${selfNote}"` : "",
    "",
    "Beurteile genau diese sieben Knotenpunkte, die im Unterricht erarbeitet wurden:",
    kpText,
    "",
    'Statuswerte: "sitzt" (klar erkennbar und gut ausgeführt), "teilweise" (ansatzweise vorhanden), "noch_nicht" (erkennbar nicht oder deutlich fehlerhaft ausgeführt), "nicht_beurteilbar" (auf den Bildern nicht sicher zu sehen, etwa wegen Bildausschnitt, Unschärfe oder weil die Phase zwischen zwei Bildern liegt).',
    "",
    "Regeln:",
    '- Beschreibe nur, was auf den Bildern wirklich zu sehen ist. Erfinde nichts. Bist du unsicher, wähle "nicht_beurteilbar" und sag kurz, warum. Nenne bei Beobachtungen, wenn hilfreich, die Bildnummer.',
    "- Sprich die Person direkt in der Du-Form an. Ton: wertschätzend, ehrlich, sachlich und auf Augenhöhe mit jungen Erwachsenen. Keine Kindersprache, keine Emojis, keine Ausrufezeichen-Ketten, keine übertriebenen Superlative.",
    "- Verwende die Fachbegriffe aus dem Unterricht (Knotenpunkte, Ausholbewegung, Treffpunkt, Pronation, Bogenspannung) und erkläre sie nicht kindlich.",
    "- Tipps sind konkret, kurz und körperbezogen umsetzbar (ein Satz).",
    "- Wähle als Fokus höchstens zwei Knotenpunkte, deren Verbesserung am meisten bringt, jeweils mit einer konkreten Übung für die nächste Stunde (Wiederholungszahl angeben).",
    '- Falls auf den Bildern kein Überkopf-Clear zu sehen ist (anderer Schlag, keine Person, Schlag nicht im Abschnitt), setze "erkannt" auf false, alle Status auf "nicht_beurteilbar", lass staerken und fokus leer und erkläre im videohinweis, wie die Person das Video oder die Markierung verbessern kann.',
    "- videohinweis: leer lassen, wenn die Bilder gut beurteilbar sind; sonst ein Satz, was beim nächsten Filmen oder Markieren besser geht.",
    "",
    "Antworte ausschließlich mit einem JSON-Objekt in genau dieser Form:",
    '{"erkannt": true, "gesamteindruck": "2–3 Sätze", "staerken": ["1–3 konkrete Stärken"], "knotenpunkte": [{"id": "absinken", "status": "sitzt", "beobachtung": "1–2 Sätze", "tipp": "1 Satz"}], "fokus": [{"titel": "kurz", "warum": "1 Satz", "uebung": "1–2 Sätze"}], "videohinweis": ""}',
    `Das Array knotenpunkte enthält alle sieben ids in der Reihenfolge: ${KP.map((k) => k.id).join(", ")}.`
  ].filter(Boolean).join("\n");
}

function parseLoose(text) {
  const t = String(text || "").trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

async function callGemini(model, key, payload) {
  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: payload
    });
  } catch (e) {
    return { ok: false, code: "upstream", detail: `Netzwerkfehler zu Google: ${e && e.message}`, retry: true };
  }
  if (!res.ok) {
    let detail = "";
    try { const e = await res.json(); detail = (Array.isArray(e) ? e[0] : e)?.error?.message || ""; } catch {}
    const s = res.status;
    const code = s === 429 ? "rate_limited" : s === 404 ? "model" : (s === 400 || s === 401 || s === 403) ? "key" : "upstream";
    return { ok: false, code, detail: `Gemini ${s} (${model}): ${detail}`.slice(0, 300), retry: s >= 500 || s === 404 || s === 429 };
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", text = "", blocked = null, finishReason = null;
  const eat = (line) => {
    line = line.trim();
    if (!line.startsWith("data:")) return;
    const d = line.slice(5).trim();
    if (!d) return;
    try {
      const j = JSON.parse(d);
      if (j.promptFeedback && j.promptFeedback.blockReason) blocked = j.promptFeedback.blockReason;
      const c = j.candidates && j.candidates[0];
      if (c && c.finishReason) finishReason = c.finishReason;
      for (const p of (c && c.content && c.content.parts) || []) if (p.text && !p.thought) text += p.text;
    } catch {}
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { eat(buf.slice(0, i)); buf = buf.slice(i + 1); }
  }
  if (buf) eat(buf);
  if (blocked) return { ok: false, code: "refused", detail: `Von Google blockiert: ${blocked}`, retry: false };
  const parsed = parseLoose(text);
  if (!parsed || !Array.isArray(parsed.knotenpunkte)) {
    return { ok: false, code: "invalid", detail: `Antwort nicht lesbar (${model}, finishReason ${finishReason}, ${text.length} Zeichen)`, retry: true };
  }
  return { ok: true, result: parsed };
}

export default async (request) => {
  if (request.method !== "POST") return json({ error: "method" }, 405);

  const key = env("GEMINI_API_KEY");
  const kurscode = env("KURSCODE");
  const customModel = env("GEMINI_MODEL");
  const models = customModel ? [customModel] : ["gemini-flash-latest", "gemini-flash-lite-latest"];
  if (!key) return json({ error: "config", detail: "GEMINI_API_KEY ist in Netlify nicht eingetragen." }, 500);

  let body;
  try { body = await request.json(); } catch { return json({ error: "bad_request" }, 400); }

  if (kurscode && String(body.kurscode || "").trim().toLowerCase() !== String(kurscode).trim().toLowerCase()) {
    return json({ error: "code" }, 401);
  }

  const frames = Array.isArray(body.frames) ? body.frames : [];
  if (frames.length < 2 || frames.length > 12) return json({ error: "bad_request" }, 400);
  let total = 0;
  for (const f of frames) {
    if (!f || typeof f.data !== "string" || !/^[A-Za-z0-9+/=]+$/.test(f.data.slice(0, 200))) return json({ error: "bad_request" }, 400);
    total += f.data.length;
  }
  if (total > 6_000_000) return json({ error: "too_large" }, 413);

  const hand = body.hand === "links" ? "links" : "rechts";
  const selfNote = String(body.selfNote || "").replace(/["\n\r]+/g, " ").slice(0, 600);
  const times = frames.map((f) => Number(f.t) || 0);

  const parts = [{ text: buildPrompt({ hand, selfNote, times }) }];
  frames.forEach((f, i) => {
    parts.push({ text: `Bild ${i + 1} (${times[i].toFixed(2)} s):` });
    parts.push({ inline_data: { mime_type: "image/jpeg", data: f.data } });
  });
  const payload = JSON.stringify({
    contents: [{ role: "user", parts }],
    generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 8192 }
  });

  // Die Antwort wird sofort begonnen und mit Leerzeichen am Leben gehalten,
  // damit Netlify die Verbindung nicht kappt, während Gemini nachdenkt.
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const ping = setInterval(() => { try { controller.enqueue(enc.encode(" ")); } catch {} }, 3000);
      const finish = (obj) => {
        clearInterval(ping);
        try { controller.enqueue(enc.encode(JSON.stringify(obj))); controller.close(); } catch {}
      };
      try {
        controller.enqueue(enc.encode(" "));
        let last = null;
        for (const m of models) {
          const r = await callGemini(m, key, payload);
          if (r.ok) { console.log("Analyse ok mit", m); finish(r.result); return; }
          console.log("Gemini-Problem:", r.code, r.detail);
          last = r;
          if (!r.retry) break;
        }
        finish({ error: last ? last.code : "upstream", detail: last ? last.detail : "" });
      } catch (e) {
        console.log("Unerwarteter Fehler:", e && e.message);
        finish({ error: "upstream", detail: String((e && e.message) || e).slice(0, 200) });
      }
    }
  });
  return new Response(stream, { status: 200, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
};

export const config = { path: "/api/analyze" };
