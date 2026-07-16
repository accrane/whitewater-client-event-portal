export type GhlEventSnapshot = {
  eventName?: string;
  eventType?: string;
  eventDate?: string;
  arrivalTime?: string;
  meetingLocation?: string;
  // GHL opportunity monetaryValue; admin-only in the UI, synced both ways.
  value?: number;
  // GHL opportunity.number_of_guests custom field, synced both ways.
  numberOfGuests?: number;
  planner?: {
    id?: string;
    name?: string;
    email?: string;
    phone?: string | null;
  };
  contact?: {
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
