"use client";

import { createContext, useContext, type ReactNode } from "react";

// Distributes cached note/open-task counts (read server-side from
// ghl_contact_badges — see src/lib/ghl/badge-cache.ts) to the contact drawer
// buttons, so a board of 100-250 cards badges instantly with zero GHL calls
// at view time. Buttons read counts via useContactBadges(); pages without a
// provider (like the event page) get null and the buttons fall back to their
// own per-contact prefetch.

export type ContactBadgeCounts = { noteCount: number; openTaskCount: number };

const ContactBadgesContext = createContext<Record<
  string,
  ContactBadgeCounts
> | null>(null);

export function useContactBadges(): Record<string, ContactBadgeCounts> | null {
  return useContext(ContactBadgesContext);
}

export function ContactBadgesProvider({
  badges,
  children,
}: {
  badges: Record<string, ContactBadgeCounts>;
  children: ReactNode;
}) {
  return (
    <ContactBadgesContext.Provider value={badges}>
      {children}
    </ContactBadgesContext.Provider>
  );
}
