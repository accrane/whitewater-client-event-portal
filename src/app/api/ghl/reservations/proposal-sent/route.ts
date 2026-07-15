import { parseGhlProposalSentPayload } from "@/lib/ghl/types";

export async function POST(request: Request) {
  const expectedSecret = process.env.GHL_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-portal-webhook-secret");

  if (!expectedSecret) {
    return Response.json(
      { error: "Webhook secret is not configured" },
      { status: 500 },
    );
  }

  if (!providedSecret || providedSecret !== expectedSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseGhlProposalSentPayload(body);

  if (!parsed.ok) {
    return Response.json(
      { error: "Invalid proposal-sent payload", details: parsed.errors },
      { status: 400 },
    );
  }

  try {
    const { createOrReuseProposalHold, ProposalHoldError } = await import(
      "@/lib/ghl/proposal-holds"
    );

    try {
      const result = await createOrReuseProposalHold(parsed.payload);

      return Response.json(
        {
          created: result.created,
          reservation_id: result.reservation.id,
          status: result.reservation.status,
        },
        { status: result.created ? 201 : 200 },
      );
    } catch (error) {
      if (error instanceof ProposalHoldError) {
        return Response.json({ error: error.message }, { status: error.status });
      }

      throw error;
    }
  } catch (error) {
    console.error("Failed processing GHL proposal-sent webhook", error);

    return Response.json(
      { error: "Failed creating proposal hold" },
      { status: 500 },
    );
  }
}
