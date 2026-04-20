# Future Pricing & Monetization Strategy

## Planned Tier Structure

**Tier 1: Starter (Free Trial)**
*   **Ideal for:** Teachers testing the app or small intervention groups.
*   **Limits:** 1 Active Class, Maximum of 12 students graded per assignment.
*   **Features:** Basic AI grading, Google Classroom sync.

**Tier 2: Pro Educator ($9.99/month or $99/year)**
*   **Ideal for:** A single teacher managing a standard workload.
*   **Limits:** Unlimited Classes, Unlimited Students.
*   **Features:** Full AI grading, custom rubrics, strictness control, EdPuzzle imports, and PowerSchool Export.

**Tier 3: Department / School License (Custom Pricing)**
*   **Ideal for:** Schools buying bulk seats.
*   **Limits:** Unlimited usage across the organization.
*   **Features:** Centralized billing, shared rubrics.

---

## Technical Implementation Plan

When we are ready to implement the paywall, this is the architecture we will use:

1. **User Database (Firestore/MongoDB):** Create a database to store user profiles keyed by their Google Email.
2. **Payment Gateway (Stripe):** Integrate Stripe Checkout for handling subscriptions securely. Let Stripe manage the recurring billing logic.
3. **Webhook Syncing:** When a user pays on Stripe, a webhook pings our server to upgrade their account status in our User Database to `PRO`.
4. **API Limits:** In the Next.js API routes (e.g., `/api/courses` and `/api/grade`), we will check the database. If they are on the free tier, we limit the array of returned courses to 1, and the array of fetched submissions to 12.

---

## How to Handle Free & Admin Licenses

To give out free licenses to yourself, close colleagues, or early adopters without them needing to enter credit card information, we have a few standard approaches:

### Approach A: The Hardcoded Email Whitelist (Easiest)
In our code (or environment variables), we maintain a simple array of emails. If the user logging in matches an email on this list, the API automatically bypasses all limits.
```javascript
const VIP_EMAILS = ['phill@example.com', 'colleague@example.com'];
if (VIP_EMAILS.includes(session.user.email)) {
  // Grant PRO access automatically
}
```

### Approach B: Database Override Toggle (Scalable)
In the User Database we will build, we add a simple boolean field to their profile called `isLifetimePro`. 
As the admin, you can manually go into the database console (like Firebase Console) and toggle your colleague's `isLifetimePro` status to `true`. Our API code will check this flag before checking Stripe.

### Approach C: 100% Discount Promo Codes (Standard)
Through the Stripe Dashboard, you can generate special "Promo Codes" (like `FRIENDOFPHILL100`) that offer a 100% discount on a subscription. Your friends would go through the normal checkout flow but pay $0.00. This is great if you want them to 'subscribe' but just not pay, ensuring all users go through the exact same onboarding flow.
