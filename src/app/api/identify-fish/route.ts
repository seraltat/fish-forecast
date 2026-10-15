import { NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

// POST /api/identify-fish
// Body: { image: string } — base64 data URL of the fish photo (max 400x400 JPEG).
// Returns: { species: string } — the species name in Russian, or an error
// message if the photo couldn't be processed or no internet is available.
//
// The VLM is asked to identify the fish species from the photo and reply
// with just the Russian name. If the photo isn't a fish, it replies
// "Не рыба". The frontend matches the returned string against ALL_SPECIES
// and RAZNORYBICA_TYPES to pick the right species for the form. Unknown
// responses are still surfaced to the user via a toast.
export async function POST(req: Request) {
  let body: { image?: string };
  try {
    body = (await req.json()) as { image?: string };
  } catch {
    return NextResponse.json({ error: "Некорректный JSON" }, { status: 400 });
  }

  const image = body.image;
  if (!image || typeof image !== "string" || !image.startsWith("data:image/")) {
    return NextResponse.json({ error: "Нет фото" }, { status: 400 });
  }

  let zai;
  try {
    zai = await ZAI.create();
  } catch (e) {
    console.error("ZAI.create failed:", (e as Error).message);
    return NextResponse.json(
      { error: "Сервис распознавания недоступен" },
      { status: 503 }
    );
  }

  try {
    const response = await zai.chat.completions.createVision({
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Определи вид рыбы на фото. Ответь только названием рыбы на русском языке. Если это не рыба, ответь 'Не рыба'. Возможные варианты: карась, сазан, сом, щука, краснопёрка, Монгольский краснопёр, Остробрюшка, Касатка, Конёк, или другое название.",
            },
            { type: "image_url", image_url: { url: image } },
          ],
        },
      ],
      thinking: { type: "disabled" },
    });

    const result =
      response.choices?.[0]?.message?.content?.trim() ||
      "Не удалось определить";
    return NextResponse.json({ species: result });
  } catch (e) {
    console.error("VLM identify-fish failed:", (e as Error).message);
    return NextResponse.json(
      { error: "Не удалось определить (нет интернета)" },
      { status: 502 }
    );
  }
}
