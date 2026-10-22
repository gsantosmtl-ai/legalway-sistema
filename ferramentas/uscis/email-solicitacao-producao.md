# Solicitação de acesso de produção — USCIS Torch API

**Para:** developersupport@uscis.dhs.gov
**Assunto:** Production Access Request — Case Status API — Legal Way Group LLC

---

Dear USCIS Developer Support team,

Legal Way Group LLC would like to begin the production access process for the
**Case Status API** on the USCIS Torch Platform.

**About our organization**

Legal Way Group LLC is a U.S.-incorporated immigration services company based in
Florida. We assist individuals and families with the preparation, filing and
follow-up of immigration petitions.

- Legal name: Legal Way Group LLC
- Address: 9100 Conroy Windermere Rd., Suite 200 #286, Windermere, FL 34786
- Website: https://legalway.group
- Privacy Policy and Terms of Service: https://legalway.group/termos-e-privacidade
- Contact: contato@legalway.group

**Intended use**

We have built an internal case management system used by our staff to track each
client's petition. Today our team checks case status manually, one receipt at a
time, on the public USCIS website.

With the Case Status API we would query the receipt number of each active case
once per day and record the status in the client's file. When a status changes,
the system notifies the assigned staff member and, for statuses that require a
response (such as an RFE or NOID), automatically creates the internal deadline.
Clients are informed by our team; the API is not exposed to them directly.

**Expected volume**

We currently have approximately 40 filed cases with receipt numbers, growing with
roughly 20 new client contracts per month. We expect to reach 200 to 250 active
receipts within twelve months. Our integration performs **one scheduled query per
receipt per day**, plus occasional on-demand lookups by staff.

**Technical status**

- Registered on the Developer Portal: yes
- Developer app created: yes
- Sandbox development and testing completed: yes
- OAuth2 client credentials flow with token caching: implemented
- `demo_id` request header: already supported in our integration and ready to be
  configured for the demo appointment
- HTTPS success and error response handling: implemented

Our data handling practices for USCIS-sourced information are described in our
Privacy Policy, sections 1.2, 2 and 3.

We are ready to receive the Developer Portal Affidavit form and to schedule the
demo appointment at your convenience.

Thank you for your time.

[seu nome]
[seu cargo] — Legal Way Group LLC
contato@legalway.group · (689) 312-0885
