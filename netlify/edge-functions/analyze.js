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

export default async (request) => {
  if (request.method !== "POST") return json({ error: "method" }, 405);

  const key = env("GEMINI_API_KEY");
  const kurscode = env("KURSCODE");
  const model = env("GEMINI_MODEL") || "gemini-flash-latest";
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

  let res;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ role: "user", parts }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.4, maxOutputTokens: 8192 }
      })
    });
  } catch {
    return json({ error: "upstream" }, 502);
  }

  if (res.status === 429) return json({ error: "rate_limited" }, 429);
  if (!res.ok) {
    let detail = "";
    try { const e = await res.json(); detail = e?.error?.message || ""; } catch {}
    console.log("Gemini-Fehler", res.status, detail);
    const code = res.status === 404 ? "model" : (res.status === 400 || res.status === 403) ? "key" : "upstream";
    return json({ error: code, detail: String(detail).slice(0, 300) }, 502);
  }

  const data = await res.json();
  if (data?.promptFeedback?.blockReason) return json({ error: "refused" }, 422);
  const text = (data?.candidates?.[0]?.content?.parts || []).map((p) => p.text || "").join("");
  const parsed = parseLoose(text);
  if (!parsed || !Array.isArray(parsed.knotenpunkte)) return json({ error: "invalid" }, 502);
  return json(parsed, 200);
};

export const config = { path: "/api/analyze" };
