// GHL opportunity custom fields that hold the website inquiry form (and the
// same fields the New inquiry page writes for phone intake). Ids are listed
// in docs/ghl-custom-fields.md. Import-free so both the opportunity reader
// and the phone-inquiry writer can use it without a cycle.
export const INQUIRY_FIELD_IDS = {
  inquiryType: "STQPdRrIfVqX3Sbqleew",
  groupEventName: "Yz2CcYRaCRvjHK3FlekO",
  companyName: "BurRW64PbpWhzSd8M3To",
  numberOfGuests: "WxC5gg3NuLHGBrdMx9YX",
  location: "r8hIpkhPXXCqxW2jRWRY",
  activityInterest: "PPoj8o6YqJepvZ0tWb7K",
  message: "qkRcSQCMM154RyxMY7qk",
  catering: "40ZnHRqKXvMWJdKfwRgo",
  venueRental: "gEXbzg2PVYwZz8atUvOa",
  visitedPrior: "0IJUpiCD9Kc9VM79SVBk",
  dateFlexibility: "5pycOyTRrNdm9WtZX6G1",
  accommodationInterest: "pZkLs15V95Zm4KDgXM5T",
} as const;

// What the website form (or a phone intake) recorded on the opportunity,
// as shown in the Opportunities card's inquiry pop-up. Every value is the
// field's current text in GHL, so an edit made there shows here.
export type OpportunityInquiry = {
  companyName: string | null;
  groupEventName: string | null;
  inquiryType: string | null;
  location: string | null;
  dateOfInterest: string | null;
  numberOfGuests: number | null;
  activityInterest: string | null;
  message: string | null;
  catering: string | null;
  venueRental: string | null;
  visitedPrior: string | null;
  dateFlexibility: string | null;
  accommodationInterest: string | null;
};
