const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

// Best-effort per-instance throttle. For production traffic, also enable Vercel Firewall
// rate limiting because serverless instances do not share this in-memory map.
const recentRequests = new Map();
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;

function send(res, status, body) {
  res.status(status).json(body);
}

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  return (typeof forwarded === "string" ? forwarded.split(",")[0].trim() : "unknown").slice(0, 80);
}

export const config = {
  api: { bodyParser: { sizeLimit: "5mb" } },
};

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, { error: "Metode tidak diizinkan." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return send(res, 503, { error: "Layanan AI belum dikonfigurasi oleh pengelola." });

  const now = Date.now();
  const ip = getClientIp(req);
  const prior = recentRequests.get(ip) || [];
  const active = prior.filter((time) => now - time < WINDOW_MS);
  if (active.length >= MAX_REQUESTS_PER_WINDOW) {
    res.setHeader("Retry-After", "60");
    return send(res, 429, { error: "Terlalu banyak scan dalam waktu singkat. Coba lagi sebentar." });
  }
  active.push(now);
  recentRequests.set(ip, active);

  try {
    const image = req.body && req.body.image;
    if (typeof image !== "string") return send(res, 400, { error: "Foto tidak ditemukan." });

    const match = image.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/);
    if (!match) return send(res, 400, { error: "Format foto harus JPG, PNG, atau WebP." });
    const mimeType = match[1];
    if (!ALLOWED_MIME_TYPES.has(mimeType)) return send(res, 400, { error: "Format foto tidak didukung." });
    const base64 = match[2];
    const estimatedBytes = Math.floor((base64.length * 3) / 4);
    if (estimatedBytes > MAX_IMAGE_BYTES) return send(res, 413, { error: "Ukuran foto terlalu besar. Pilih foto yang lebih kecil." });

    const prompt = `Kamu asisten pemilahan sampah untuk anak kos di Indonesia. Identifikasi satu benda sampah utama pada foto. Pilih category tepat satu dari: organik, anorganik, residu, b3, tidak_jelas. Organik: sisa makanan/daun. Anorganik: plastik, kertas, kaca, logam yang dapat didaur ulang jika bersih. Residu: sachet, styrofoam, tisu, plastik kotor. B3: baterai, lampu, elektronik, obat, bahan kimia. Jika foto bukan sampah, objek tidak terlihat jelas, atau tidak cukup bukti, gunakan tidak_jelas dan confidence rendah. Jangan mengarang identitas benda. Beri tip singkat 1-2 kalimat dalam bahasa Indonesia santai. Kembalikan JSON saja dengan bentuk: {"item":"nama benda","category":"organik|anorganik|residu|b3|tidak_jelas","tip":"cara menyiapkan dan membuang","confidence":"tinggi|sedang|rendah"}.`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(MODEL)}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64 } }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                item: { type: "STRING" },
                category: { type: "STRING", enum: ["organik", "anorganik", "residu", "b3", "tidak_jelas"] },
                tip: { type: "STRING" },
                confidence: { type: "STRING", enum: ["tinggi", "sedang", "rendah"] }
              },
              required: ["item", "category", "tip", "confidence"]
            }
          }
        }),
        signal: AbortSignal.timeout(25_000)
      }
    );

    const data = await geminiResponse.json().catch(() => ({}));
    if (!geminiResponse.ok) {
      console.error("Gemini API error", geminiResponse.status, data.error?.status || "unknown");
      if (geminiResponse.status === 429) return send(res, 429, { error: "Kuota scan sedang penuh. Coba lagi nanti." });
      if (geminiResponse.status === 400) return send(res, 502, { error: "Foto atau permintaan tidak dapat diproses. Coba foto lain." });
      return send(res, 502, { error: "Gemini belum dapat memproses foto. Coba lagi nanti." });
    }

    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("");
    if (!text) return send(res, 502, { error: "AI tidak memberikan hasil. Coba foto lain." });
    let result;
    try { result = JSON.parse(text); } catch { return send(res, 502, { error: "Format hasil AI tidak terbaca. Coba lagi." }); }

    const categories = new Set(["organik", "anorganik", "residu", "b3", "tidak_jelas"]);
    const confidence = new Set(["tinggi", "sedang", "rendah"]);
    if (!categories.has(result.category) || !confidence.has(result.confidence)) {
      return send(res, 502, { error: "Hasil AI tidak sesuai format." });
    }
    return send(res, 200, { result: {
      item: String(result.item || "Objek tidak dikenali").slice(0, 100),
      category: result.category,
      tip: String(result.tip || "Periksa kembali sebelum membuang sampah.").slice(0, 500),
      confidence: result.confidence
    } });
  } catch (error) {
    console.error("Scan handler error", error.name || "Error");
    if (error.name === "TimeoutError" || error.name === "AbortError") {
      return send(res, 504, { error: "Analisis foto terlalu lama. Coba lagi." });
    }
    return send(res, 500, { error: "Terjadi kesalahan pada server scan." });
  }
}
