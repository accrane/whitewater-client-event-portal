import {
  completeContractSigningFromPortal,
  createContractSigningSession,
} from "@/lib/admin/contracts";
import { getLaunchedPortalEventByToken } from "@/lib/client/portal";

// Client-portal contract endpoints, authorized by the portal token (same
// rule as every other portal action: a valid, launched, unexpired token).
//   POST { action: "session" }  → embedded-signing URL for this contract
//   POST { action: "complete" } → the signer reported completion; pull the
//                                 final status now and run the signed actions

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string; contractId: string }> },
) {
  const { token, contractId } = await params;
  const event = await getLaunchedPortalEventByToken(token);

  if (!event) {
    return Response.json({ error: "This portal link is no longer valid." }, { status: 404 });
  }

  let action = "";
  try {
    const body = (await request.json()) as { action?: string };
    action = body.action ?? "";
  } catch {
    // No body → treated as unknown action below.
  }

  try {
    if (action === "session") {
      const outcome = await createContractSigningSession(event.id, contractId);
      if (!outcome.ok) {
        return Response.json({ error: outcome.error }, { status: 409 });
      }
      return Response.json({
        signingUrl: outcome.signingUrl,
        expiresAt: outcome.expiresAt,
      });
    }

    if (action === "complete") {
      const contract = await completeContractSigningFromPortal(event.id, contractId);
      if (!contract) {
        return Response.json({ error: "Contract not found." }, { status: 404 });
      }
      return Response.json({ contract });
    }

    return Response.json({ error: "Unknown action." }, { status: 400 });
  } catch (error) {
    console.error("Portal contract action failed", error);
    return Response.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}
