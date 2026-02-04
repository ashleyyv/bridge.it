Bridge.it: The Institutional Opportunity Engine — PRD (v4.2)
Project: Bridge.it
Owner: Ashley Vigo
Date: February 2, 2026
Status: Pre-Build | v4.2 Institutional Pipeline Model (Hospitality Vertical)

v4.2 Update Summary
The move to v4.2 represents the finalization of the "Institutional Pipeline" model. The primary user is Pursuit Leadership (Staff). By focusing on the Hospitality vertical, we enable Pursuit to act as a centralized technical consultancy. The system automates the discovery of "High-Friction Clusters"—groups of businesses with the same repeatable digital failures—allowing staff to secure partnerships and hand off pre-vetted, 6-week projects to alumni.

1. Company and Business Context
Entity: Bridge.it
Primary Users: Pursuit Staff (Partnerships Managers / Employer Relations).
Secondary Users: Pursuit Alumni (The specialized workforce).
Vertical Focus: NYC-based Restaurants, Cafes, and Hospitality SMBs.
Aesthetic: "Industrial Professional"—Clean, data-heavy, authoritative (High-contrast Slate and White).

2. Problem Definition & "Staff Value" Matrix
The tool solves the "Discovery Gap" by transforming raw public sentiment into actionable business leads for the organization.
The Feature
The Manual Process (The "Before")
The Bridge.it Value (The "After")
Market Discovery
Hours of manual Yelp scrolling.
The Batch Scout: Instantly flags the top 5 "broken" shops in a zip code.
Lead Vetting
Blindly guessing if a lead is "good."
Hospitality Friction Index (HFI): Quantifies tech-solvable pain.
Outreach Quality
Vague "student-help" pitches.
Evidence-Based Pitching: "15% of your customers report [specific quote]."
Reporting
Anecdotal tracking of success.
The Pipeline Ledger: Real-time metrics on Scouted vs. Secured projects.


3. Core Logic: The Hospitality Friction Index (HFI)
To ensure alumni are handed buildable projects, the system filters Signal (Tech-Solvable) vs. Noise (Operational/Human).
Signal (Qualified / HFI Trigger)
Noise (Rejected / Ignored)
Staff Outcome
"Lost my reservation."
"Food was cold."
Database/UX Fix (Alumnus Build)
"Phone always busy."
"Music was too loud."
Intake Automation (Alumnus Build)
"Wait time was wrong."
"Waitress was rude."
Queue Management (Alumnus Build)

3.1 The "Recency Decay" Logic
The system applies a weight to reviews based on their age to prevent pitching "Ghost Problems."
Review Age
Weight
Staff Action
0–30 Days
1.0x
Critical: Use as the "Hook" in the pitch.
31–90 Days
0.5x
Supporting: Proves the issue is chronic.
90+ Days
0.0x
Historical: Archived; not used for active scoring.


4. The "Success Tracker" (The Pipeline Ledger)
Pursuit Staff uses this ledger to track the lifecycle of an institutional lead.
[Scouted]: AI has flagged a business with an HFI $>60$.
[Pitched]: The "Voice of the Customer" PDF has been generated and shared.
[Secured]: The owner has agreed to the partnership.
[In-Build]: An Alumnus has accepted the Markdown Technical Brief and started the repo.

5. Sample Artifacts (The Deliverables)
A. The "Voice of the Customer" Audit (PDF for Owner)
Goal: Secure the partnership with data.
Content: A summary showing a 20% spike in "Phone Intake" complaints in the last 60 days.
Key Asset: 3 Verbatim "Power Quotes" from real customers as proof of the friction.
B. The "Blueprint Handoff" (Markdown for Alumnus)
Goal: Zero-friction project start.
Content:
The Tech Guardrail: Strict PERN/NERN stack enforcement.
V1 Feature List: (e.g., Simple Order Intake + Admin View).
The Definition of Done: "Owner can see new orders in real-time."

6. Goals & Non-Goals
Goals:
[P0] Reduce time to generate a data-backed pitch from 4 hours to <5 mins.
[P0] Identify neighborhood "Clusters" (e.g., 5 pizza shops with the same booking gap).
[P1] Provide "Time-on-Task" metrics (Manual vs. Digital) instead of currency ($).
Non-Goals:
[Constraint] No automated web scraping (Manual Paste / Mock JSON for Feb 9th demo).
[Constraint] No project management tools (Trello/Jira).

7. Rollout Plan
Phase 1 (Mock Logic): Populate JSON Seed Files with 3 "Real-World" NYC restaurant scenarios (e.g., a Brooklyn Taco Spot, a Queens Cafe).
Phase 2 (The Presentation - Feb 9): Demonstrate the HFI and Decay logic in a "Live Environment" using the Seed Files.
Phase 3 (API Switch): Swap Mock JSON for the Yelp/Google Places API endpoints.

