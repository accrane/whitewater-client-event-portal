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
  // GHL opportunity.activity_pass_count custom field, synced both ways.
  activityPassCount?: number;
  // GHL opportunity.number_of_parking_passes custom field, synced both ways.
  numberOfParkingPasses?: number;
  // GHL opportunity.number_of_storage_bins custom field, synced both ways.
  numberOfStorageBins?: number;
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
  // On-site event facilitator (large corporate events may have one besides
  // the inquiry contact). App-authoritative: edits here mirror to the GHL
  // opportunity facilitator_* fields and a tagged GHL contact, never back.
  facilitator?: {
    name?: string;
    email?: string;
    phone?: string | null;
    // "needs_review" after a client portal submission; "confirmed" once a
    // planner saves or reviews it.
    status?: string;
    ghlContactId?: string | null;
    // True when the facilitator is the event's primary contact — contact
    // details were copied from the live GHL contact on save.
    sameAsContact?: boolean;
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
