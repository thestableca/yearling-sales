# TheStable.ca — Draft privacy & consent documents

**Status: DRAFT — not legally reviewed.** Written by a non-lawyer as a starting point for TheStable's own legal review before this goes live with real owner data. Do not publish or rely on this as final without a Canadian privacy/securities lawyer signing off, given the investment-adjacent nature of the data being collected (see the open item on this in `database_schema_design.md`).

These documents assume the tool has moved from the current localStorage-only demo to the planned Supabase backend (see `database_schema_design.md`) — the wording below describes that future state, not the current prototype. Update the "how we store it" language if the actual implementation changes.

---

## 1. Privacy Notice (to link from the intake form)

*Suggested placement: a link on the "Welcome" screen and/or above the Continue button on Step 1, plus a permanent link in the site footer.*

> **Privacy Notice — 2026 Yearling Sale Planning**
>
> TheStable.ca ("we," "us") collects the information in this form to understand owner interest and budget preferences ahead of the 2026 yearling sales, and to help us structure sale "buckets" (shared purchasing groups) that match what owners want.
>
> **What we collect:** your name, email address, which sales you're interested in, your budget range or bucket-share preferences, and related preferences (gait, colt/filly, jurisdiction, etc.).
>
> **How we use it:** to plan which buckets to offer, to contact you if a bucket matching your stated interest becomes available, and to let you review or update your own submission later using your email address.
>
> **What we don't do:** we don't sell or share your information with anyone outside TheStable.ca, and we don't use it for unrelated marketing without asking you separately first.
>
> **How long we keep it:** for the duration of the current sale planning cycle and a reasonable period afterward for record-keeping; you can ask us to delete it sooner (see below).
>
> **Your rights:** you can ask us what we have on file for you, correct it, or have it deleted, at any time, by emailing [CONTACT EMAIL]. This is your right under Canadian privacy law (PIPEDA).
>
> **Security:** your submission is stored securely and access is restricted to authorized TheStable.ca staff.
>
> **Questions or concerns:** contact [CONTACT EMAIL].

---

## 2. Non-binding interest disclaimer

*Suggested placement: directly above the "Confirm & Submit" button on the review screen, and/or as a short line under the bucket-percentage questions themselves.*

> The amounts and percentages you enter here are a non-binding expression of interest only. They help us gauge demand and plan potential bucket offerings — they are not a purchase commitment, a reservation of funds, and no money changes hands by submitting this form. Actual participation, terms, and amounts will be confirmed separately if a bucket you're interested in becomes available.

**Note on existing UI copy:** the current bucket-percentage screen uses the word "reserve" ("Choose the percentage you would like to reserve in a bucket") and the admin dashboard shows a metric labeled "Potential coverage." Both read closer to committed-capital language than a soft interest survey. Recommend TheStable's legal reviewer decide whether to reword these alongside adding this disclaimer — the disclaimer alone may not be enough if the surrounding copy keeps implying a reservation of funds.

---

## 3. Consent checkbox (required before submitting)

*Suggested placement: on the identify step (Step 1, where name/email are entered), as a required checkbox before "Continue" is enabled.*

> ☐ I agree that TheStable.ca may use the information I provide to plan yearling sale buckets and to contact me about opportunities matching my stated interest, as described in the [Privacy Notice].

---

## What's still missing / needs a decision, not just wording

- **[CONTACT EMAIL]** — needs a real inbox TheStable actually monitors, not a placeholder.
- **Retention period** — "a reasonable period afterward" is deliberately vague; TheStable should pick an actual number (e.g. "12 months after the sale") once decided.
- **The "reserve"/"coverage" wording question above** is a legal call, not something resolved by this document alone.
- **This has not been reviewed by a lawyer.** Given real names, emails, and investment-adjacent language are involved, get a short paid review before this goes live with real owners — this draft is meant to make that review fast and cheap (something to react to and edit, rather than starting from a blank page), not to replace it.
