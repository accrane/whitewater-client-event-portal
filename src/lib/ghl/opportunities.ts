import { appConfig } from "@/lib/env";
import { getGhlApiHeaders } from "@/lib/ghl/client";
import { findDateOfInterest } from "@/lib/ghl/field-values";

// Read-only lookups for the admin Opportunities views. Same degrade rules as
// location-data: any GHL problem returns an empty result so pages keep
// rendering.

export type GhlPipelineStage = {
  id: string;
  name: string;
  position: number;
};

export type GhlPipeline = {
  id: string;
  name: string;
  stages: GhlPipelineStage[];
};

// Why the pipeline couldn't be loaded, in words a deployer can act on. Used
// by the Opportunities page only when fetchConfiguredPipeline returned null,
// so the extra request happens on the failure path alone.
export async function describePipelineProblem(): Promise<string> {
  const { accessToken, apiBaseUrl, locationId, pipelineId } = appConfig.ghl;
  const missing = [
    !accessToken ? "GHL_ACCESS_TOKEN" : null,
    !locationId ? "GHL_LOCATION_ID" : null,
  ].filter(Boolean);
  if (missing.length > 0) {
    return `${missing.join(" and ")} ${missing.length === 1 ? "is" : "are"} not set in this environment.`;
  }

  try {
    const response = await fetch(
      `${apiBaseUrl}/opportunities/pipelines?locationId=${encodeURIComponent(locationId as string)}`,
      { headers: getGhlApiHeaders(accessToken as string) },
    );
    if (!response.ok) {
      const text = (await response.text().catch(() => "")).slice(0, 200);
      return response.status === 401 || response.status === 403
        ? `GoHighLevel rejected the access token (${response.status}). The token in this environment may be expired or missing the opportunities/pipelines scope. ${text}`
        : `GoHighLevel responded ${response.status} listing pipelines. ${text}`;
    }
    const data = (await response.json()) as {
      pipelines?: { id?: string; name?: string }[];
    };
    const pipelines = (data.pipelines ?? []).filter((pipeline) => pipeline.id);
    if (pipelines.length === 0) {
      return `Location ${locationId} has no pipelines.`;
    }
    if (
      pipelineId &&
      !pipelines.some((pipeline) => pipeline.id === pipelineId)
    ) {
      const names = pipelines.map(
        (pipeline) => `${pipeline.name ?? "Unnamed"} (${pipeline.id})`,
      );
      return `GHL_PIPELINE_ID "${pipelineId}" is not a pipeline in this location. Available: ${names.join(", ")}.`;
    }
    return "Pipelines loaded but the request that renders the board failed; check the server log.";
  } catch (error) {
    return `Could not reach GoHighLevel: ${error instanceof Error ? error.message : String(error)}`;
  }
}

// The pipeline the portal works from (GHL_PIPELINE_ID), with its stages in
// board order. Falls back to the location's first pipeline when the id is
// unset so the view still renders something useful.
export async function fetchConfiguredPipeline(): Promise<GhlPipeline | null> {
  const { accessToken, apiBaseUrl, locationId, pipelineId } = appConfig.ghl;
  if (!accessToken || !locationId) return null;

  try {
    const response = await fetch(
      `${apiBaseUrl}/opportunities/pipelines?locationId=${encodeURIComponent(locationId)}`,
      { headers: getGhlApiHeaders(accessToken) },
    );
    if (!response.ok) {
      console.error("GHL pipelines lookup failed", response.status);
      return null;
    }

    const data = (await response.json()) as {
      pipelines?: {
        id?: string;
        name?: string;
        stages?: { id?: string; name?: string; position?: number }[];
      }[];
    };

    const pipelines = (data.pipelines ?? []).filter((pipeline) => pipeline.id);
    const pipeline = pipelineId
      ? pipelines.find((candidate) => candidate.id === pipelineId)
      : pipelines[0];
    if (!pipeline?.id) return null;

    return {
      id: pipeline.id,
      name: pipeline.name || "Pipeline",
      stages: (pipeline.stages ?? [])
        .filter((stage) => stage.id)
        .map((stage, index) => ({
          id: stage.id as string,
          name: stage.name || `Stage ${index + 1}`,
          position: typeof stage.position === "number" ? stage.position : index,
        }))
        .sort((a, b) => a.position - b.position),
    };
  } catch (error) {
    console.error("GHL pipelines lookup failed", error);
    return null;
  }
}

export type GhlOpportunityContact = {
  id: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
};

export type GhlPipelineOpportunity = {
  id: string;
  name: string | null;
  status: string | null;
  pipelineStageId: string | null;
  monetaryValue: number | null;
  assignedTo: string | null;
  createdAt: string | null;
  // Date of Interest custom field (yyyy-MM-dd) — the event date.
  eventDate: string | null;
  contact: GhlOpportunityContact | null;
};

export type GhlOpportunityStatus = "open" | "won" | "lost" | "abandoned";

// Every opportunity in the configured pipeline with the given status,
// following pagination. The search endpoint embeds the contact snapshot and
// custom fields, so one sweep covers cards and the Won contact list.
export async function searchPipelineOpportunities(
  status: GhlOpportunityStatus,
): Promise<GhlPipelineOpportunity[]> {
  const {
    accessToken,
    apiBaseUrl,
    locationId,
    pipelineId,
    dateOfInterestFieldId,
  } = appConfig.ghl;
  if (!accessToken || !locationId) return [];

  const params = new URLSearchParams({
    location_id: locationId,
    limit: "100",
    status,
  });
  if (pipelineId) params.set("pipeline_id", pipelineId);

  let url: string | null =
    `${apiBaseUrl}/opportunities/search?${params.toString()}`;
  const results: GhlPipelineOpportunity[] = [];

  try {
    for (let page = 0; url && page < 10; page++) {
      const response: Response = await fetch(url, {
        headers: getGhlApiHeaders(accessToken),
      });
      if (!response.ok) {
        console.error("GHL opportunity search failed", response.status);
        break;
      }

      const data = (await response.json()) as {
        opportunities?: {
          id?: string;
          name?: string;
          status?: string;
          pipelineStageId?: string;
          monetaryValue?: number;
          assignedTo?: string;
          createdAt?: string;
          customFields?: unknown;
          contact?: {
            id?: string;
            name?: string;
            email?: string;
            phone?: string;
          };
        }[];
        meta?: { nextPageUrl?: string | null };
      };

      for (const opportunity of data.opportunities ?? []) {
        if (!opportunity.id) continue;

        results.push({
          id: opportunity.id,
          name: opportunity.name?.trim() || null,
          status: opportunity.status ?? null,
          pipelineStageId: opportunity.pipelineStageId ?? null,
          monetaryValue:
            typeof opportunity.monetaryValue === "number" &&
            Number.isFinite(opportunity.monetaryValue)
              ? opportunity.monetaryValue
              : null,
          assignedTo: opportunity.assignedTo ?? null,
          createdAt: opportunity.createdAt ?? null,
          eventDate: dateOfInterestFieldId
            ? findDateOfInterest(
                opportunity.customFields,
                dateOfInterestFieldId,
              )
            : null,
          contact: opportunity.contact?.id
            ? {
                id: opportunity.contact.id,
                name: opportunity.contact.name?.trim() || null,
                email: opportunity.contact.email?.trim() || null,
                phone: opportunity.contact.phone?.trim() || null,
              }
            : null,
        });
      }

      url = data.meta?.nextPageUrl ?? null;
    }
  } catch (error) {
    console.error("GHL opportunity search failed", error);
  }

  return results;
}
