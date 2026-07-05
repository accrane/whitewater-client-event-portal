export type GhlEventSnapshot = {
  eventName?: string;
  eventType?: string;
  eventDate?: string;
  arrivalTime?: string;
  meetingLocation?: string;
  planner?: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string | null;
  };
  links?: {
    proposal?: string;
    contract?: string;
    invoice?: string;
    payment?: string;
  };
  paymentStatus?: string;
};

export type PortalEventStatus = "draft" | "launched" | "expired" | "archived";

export type ChecklistItemStatus =
  | "not_completed"
  | "needs_review"
  | "completed"
  | "not_applicable";
