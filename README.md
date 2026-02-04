# Bridge.it v4.2 - Institutional Opportunity Engine

**Pursuit Staff Portal | Hospitality Vertical**

## 🎯 Mission
Identify technical friction in NYC Hospitality SMBs and generate scoped projects for Pursuit Alumni.

## 🏗️ Architecture

```
bridge-it/
├── client/          Next.js frontend (App Router + Tailwind)
├── server/          Express.js API server
├── _architect_ref/  Mock data and documentation
└── .cursorrules     Project constitution
```

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ installed
- npm or yarn

### Installation & Startup

1. **Install dependencies** (already done):
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

2. **Start the API server** (Terminal 1):
   ```bash
   cd server
   npm run dev
   ```
   Server runs on: `http://localhost:3001`

3. **Start the Next.js client** (Terminal 2):
   ```bash
   cd client
   npm run dev
   ```
   Client runs on: `http://localhost:3000`

4. **Open the dashboard**:
   Navigate to `http://localhost:3000`

## 📊 API Endpoints

- `GET /api/leads` - Fetch all restaurant leads with HFI scoring
- `GET /api/leads/:id` - Fetch single lead by ID
- `GET /health` - Health check

## 🎨 Design System: Industrial Professional

### Color Palette
- **Slate**: `#1e293b` - Primary backgrounds
- **Navy**: `#0f172a` - Base background
- **White**: `#ffffff` - Text and accents

### HFI Badge System
- **High (≥75)**: Red badge - Critical friction
- **Medium (60-74)**: Yellow badge - Moderate friction
- **Low (<60)**: Gray badge - Minor friction

### Recency Indicators
- **0-30 days**: Blue badge (1.0x weight) - Critical recent issues
- **31-90 days**: Gray text (0.5x weight) - Supporting evidence
- **90+ days**: Archived (0.0x weight) - Not used in active scoring

## 🧮 Core Logic

### Hospitality Friction Index (HFI)
Filters **Signal** (tech-solvable) vs **Noise** (operational):

**Signal (Qualified)**:
- "Lost my reservation" → Database/UX Fix
- "Phone always busy" → Intake Automation
- "Wait time was wrong" → Queue Management

**Noise (Rejected)**:
- Food quality complaints
- Staff personality issues
- Music volume, ambiance

### Recency Decay
| Review Age | Weight | Staff Action |
|------------|--------|--------------|
| 0-30 days  | 1.0x   | Critical: Use as pitch "hook" |
| 31-90 days | 0.5x   | Supporting: Proves chronic issue |
| 90+ days   | 0.0x   | Historical: Archived |

## 📋 Pipeline Status Tracker

- **[Scouted]**: AI flagged with HFI >60
- **[Pitched]**: "Voice of Customer" PDF generated
- **[Secured]**: Owner agreed to partnership
- **[In-Build]**: Alumni started development

## 🎁 Demo Artifacts (v4.2)

### For Restaurant Owners
**Voice of Customer Audit** (PDF)
- 20% spike in specific complaint category
- 3 verbatim "power quotes" from customers
- Time-on-Task efficiency metrics

### For Alumni Developers
**Blueprint Handoff** (Markdown)
- PERN/NERN stack requirements
- V1 Feature List
- Definition of Done

## 📦 Mock Data Structure

See `_architect_ref/MOCK_DATA.json` for 5 NYC restaurant scenarios:
1. Taco Libre Brooklyn (Phone Intake issues)
2. Queens Corner Cafe (Wait time management)
3. Nonna's Trattoria (Reservation system)
4. Harlem Soul Kitchen (Order management)
5. Bronx Pizza Palace (Intake & coordination)

## 🎪 Feb 9th Demo Checklist

- [x] Next.js dashboard with Industrial Professional aesthetic
- [x] Express API serving mock data
- [x] HFI scoring display
- [x] Recency indicators (0-30d, 31-90d)
- [x] Lead detail modal with friction clusters
- [x] Customer quote display
- [x] Pipeline status badges
- [ ] "Generate PDF" button functionality (Phase 2)
- [ ] "Create Blueprint" button functionality (Phase 2)

## 🔄 Roadmap

**Phase 1** (Complete): Mock data foundation
**Phase 2** (Next): Yelp API integration
**Phase 3** (Future): OpenAI-powered artifact generation

## 🚫 Constraints

- **No currency**: Use "Time-on-Task" metrics only
- **No web scraping**: Manual paste or API-only
- **No PM tools**: Simple status tracking only
- **Recency bias**: 90+ day data weighted at 0.0x

## 🛠️ Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS, TypeScript
- **Backend**: Node.js, Express.js
- **Data**: Mock JSON → Yelp API (future)
- **Deployment**: TBD

## 📞 Support

Built for Pursuit Leadership by Ashley Vigo  
Demo Date: February 9, 2026
