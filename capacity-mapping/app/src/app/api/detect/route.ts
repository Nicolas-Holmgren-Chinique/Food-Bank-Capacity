import Anthropic from "@anthropic-ai/sdk";
import { SYSTEM_PROMPT, DETECT_TOOL, type DetectResult } from "@/lib/detect";

/**
 * One call, every photo.
 *
 * The model has to see the whole upload at once, because deduplicating a
 * burst of frames is only possible side by side. The response is forced
 * through a strict tool schema, so the shape is validated before it gets here
 * and there is no JSON to parse defensively.
 */

export const runtime = "nodejs";
export const maxDuration = 120;

type Body = { images?: string[] };

/** "data:image/jpeg;base64,AAAA" -> the two parts the API wants. */
function splitDataUrl(dataUrl: string) {
  const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  return { media_type: m[1], data: m[2] };
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected JSON." }, { status: 400 });
  }

  const images = body.images ?? [];
  if (images.length === 0) {
    return Response.json({ error: "No photos supplied." }, { status: 400 });
  }
  if (images.length > 20) {
    return Response.json(
      { error: "Twenty photos at a time is the limit." },
      { status: 400 }
    );
  }

  const parts = images.map(splitDataUrl);
  if (parts.some((p) => p === null)) {
    return Response.json(
      { error: "One of those is not a jpeg, png, webp, or gif." },
      { status: 400 }
    );
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      {
        error:
          "No ANTHROPIC_API_KEY. Put one in app/.env.local and restart the dev server.",
      },
      { status: 500 }
    );
  }

  const client = new Anthropic();

  // Numbered, so appears_in refers to something the person can point at.
  const content: Anthropic.ContentBlockParam[] = [];
  parts.forEach((p, i) => {
    content.push({ type: "text", text: `Photo ${i + 1}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: p!.media_type as "image/jpeg", data: p!.data },
    });
  });
  content.push({
    type: "text",
    text: `That is ${images.length} photo${
      images.length === 1 ? "" : "s"
    } from one walk through one site, in the order they were taken. Report every distinct storage unit, deduplicated across the whole set.`,
  });

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 16000,
      system: [
        { type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
      ],
      tools: [DETECT_TOOL],
      tool_choice: { type: "tool", name: "report_storage" },
      messages: [{ role: "user", content }],
    });

    const call = response.content.find((b) => b.type === "tool_use");
    if (!call || call.type !== "tool_use") {
      return Response.json(
        { error: "The model did not return a detection." },
        { status: 502 }
      );
    }

    const result = call.input as DetectResult;
    return Response.json({
      ...result,
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    });
  } catch (err) {
    const message =
      err instanceof Anthropic.APIError
        ? `${err.status ?? ""} ${err.message}`.trim()
        : err instanceof Error
        ? err.message
        : "Unknown error";
    return Response.json({ error: message }, { status: 502 });
  }
}
