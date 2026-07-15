# GHL custom fields the portal depends on

_Last updated: 2026-07-15. Living log — add a row whenever the app starts
reading or writing a GHL field, and create the field in GHL before shipping
the feature that needs it._

Location: `RVMKYLK9bHGpCQQPX4TM` · Pipeline: **Event Sales**
(`LAMLAzgpZbZgTwBtUR1A`) · Planning stage:
`2200d2ab-ac2e-4ef4-a20e-d8bb982edd7f`

## Opportunity fields in use (already created)

| Field | Field ID | Key | How the portal uses it |
| --- | --- | --- | --- |
| Event Planning App ID | `IDk5IeH17B5bpEqcHvkK` | `opportunity.event_planning_app_id` | App **writes** the portal event id here after the inquiry webhook creates the event (`GHL_OPPORTUNITY_EVENT_FIELD_ID`). |
| Date of Interest | `EMDW0kB1fSuaq8Lixzpq` | `opportunity.date_of_interest` | App **reads** this live from GHL (`GHL_DATE_OF_INTEREST_FIELD_ID`) when loading the calendar's event list; the reservation modal auto-fills the booking date from it. Mapping it into the webhook as `event.date` remains a useful fallback. |
| Group/Event Name | `Yz2CcYRaCRvjHK3FlekO` | `opportunity.groupevent_name` | Map into the webhook as `event.name`; becomes the portal event name and the calendar block title. |
| Inquiry Type | `STQPdRrIfVqX3Sbqleew` | `opportunity.inquiry_type` | Map into the webhook as `event.type`. |

## Native GHL properties in use (no custom field needed)

| Property | How the portal uses it |
| --- | --- |
| Opportunity `assignedTo` | App **writes** it when a planner picks an Event Coordinator on a reservation — the coordinator dropdown lists the location's GHL users, and the selected user is assigned to the opportunity. |
| Location users | **Read** to populate the Event Coordinator dropdown (replaces the app's manual coordinator list). |

## Candidate fields (not created yet)

Create these in GHL when the corresponding push-back feature is built:

| Field (suggested) | Type | Would be used for |
| --- | --- | --- |
| Reserved Rooms | TEXT | App writes the room name(s) after a planner books calendar blocks, so sales sees the venue from GHL. |
| Client Portal Link | TEXT | App writes the client portal URL when the portal is launched, for GHL email templates. |

## Looking up field ids

```sh
TOKEN=$(grep '^GHL_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
curl -s "https://services.leadconnectorhq.com/locations/RVMKYLK9bHGpCQQPX4TM/customFields?model=opportunity" \
  -H "Authorization: Bearer $TOKEN" -H "Version: 2021-07-28"
```
