// Body shapes for PUT /opportunities/{id} (GHL API v2, Version 2021-07-28).
// Kept free of runtime imports so tests can exercise them directly.
export type OpportunityUpdateBody = {
  pipelineId?: string;
  pipelineStageId?: string;
  customFields?: { id: string; field_value: string }[];
};

export function buildEventFieldWriteBackBody(
  fieldId: string,
  portalEventId: string,
): OpportunityUpdateBody {
  return {
    customFields: [{ id: fieldId, field_value: portalEventId }],
  };
}

export function buildPlanningStageBody(
  pipelineId: string,
  planningStageId: string,
): OpportunityUpdateBody {
  return { pipelineId, pipelineStageId: planningStageId };
}
