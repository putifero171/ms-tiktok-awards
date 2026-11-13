# MS TikTok PALOP Awards 2026

Independent awards platform celebrating creators and digital personalities across the PALOP community. This project is not affiliated with, sponsored by, or officially associated with TikTok or ByteDance.

## Website

Responsive static website built with HTML, CSS and vanilla JavaScript, deployed on Vercel.

## Voting

- Standard price: €1 or 1,000 Kz per vote.
- Bulk package: 10 votes for €8 or 8,000 Kz (20% discount).
- Payment methods displayed: PayPal and Multicaixa Express.
- Voters submit their transaction reference and payment proof.
- Submissions remain pending until an administrator manually verifies and approves the payment.
- Only approved votes should be included in public rankings.

## Administration

The restricted admin area is available at `/admin.html`. Administrator access depends on Supabase authentication and an authorised admin role in the `profiles` table.

## Data and deployment

The public site uses Supabase for live categories, nominees, approved vote totals and payment submissions. The Vercel project is connected to this GitHub repository and deploys from `main`.

## Important launch checks

Before opening public voting, verify the live Supabase schema and Row Level Security policies, test a complete payment-proof submission, confirm that an administrator can review and approve it, and confirm that only approved votes appear in rankings. Do not use real payment details for test transactions.

## Nominees

Nominee fallback data is maintained in `nominees.js`. Live category and nominee data is loaded from Supabase when configured.

© 2026 MS TikTok PALOP Awards.
