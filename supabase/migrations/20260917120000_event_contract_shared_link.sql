-- The customer's own PandaDoc link for a contract (recipient shared_link
-- from the document details API): public, no login, issued once the
-- document is sent. Backs the "Customer View" link on the admin Event
-- summary. Refreshed by syncContractFromPandaDoc; a re-send can change it.
alter table event_contracts add column pandadoc_shared_link text;
