type EnvKey =
  | "NEXT_PUBLIC_SUPABASE_URL"
  | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
  | "SUPABASE_SERVICE_ROLE_KEY"
  | "SUPABASE_STORAGE_BUCKET"
  | "GHL_LOCATION_ID"
  | "GHL_API_BASE_URL"
  | "GHL_ACCESS_TOKEN"
  | "GHL_WEBHOOK_SECRET"
  | "GHL_EVENT_OBJECT_ID_OR_KEY"
  | "GHL_OPPORTUNITY_EVENT_FIELD_ID"
  | "GHL_DATE_OF_INTEREST_FIELD_ID"
  | "GHL_PIPELINE_ID"
  | "GHL_PLANNING_STAGE_ID"
  | "PORTAL_BASE_URL";

export function getEnv(key: EnvKey): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export function getOptionalEnv(key: EnvKey): string | undefined {
  return process.env[key] || undefined;
}

export const appConfig = {
  portalBaseUrl: process.env.PORTAL_BASE_URL || "http://localhost:3000",
  supabase: {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    storageBucket:
      process.env.SUPABASE_STORAGE_BUCKET || "event-uploads",
  },
  ghl: {
    locationId: process.env.GHL_LOCATION_ID,
    apiBaseUrl:
      process.env.GHL_API_BASE_URL || "https://services.leadconnectorhq.com",
    accessToken: process.env.GHL_ACCESS_TOKEN,
    webhookSecret: process.env.GHL_WEBHOOK_SECRET,
    eventObjectIdOrKey: process.env.GHL_EVENT_OBJECT_ID_OR_KEY,
    // Opportunity custom field that stores the portal event id.
    opportunityEventFieldId: process.env.GHL_OPPORTUNITY_EVENT_FIELD_ID,
    // Opportunity custom field holding the client's Date of Interest.
    dateOfInterestFieldId: process.env.GHL_DATE_OF_INTEREST_FIELD_ID,
    pipelineId: process.env.GHL_PIPELINE_ID,
    planningStageId: process.env.GHL_PLANNING_STAGE_ID,
  },
} as const;
