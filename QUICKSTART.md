# 🚀 Bridge.it v4.2 - Quick Start Guide

## ✅ Status: READY FOR FEB 9TH DEMO

Both servers are running:
- **API Server**: http://localhost:3001 ✅
- **Dashboard**: http://localhost:3000 ✅

## 🎯 Access the Dashboard

Open your browser and navigate to:
```
http://localhost:3000
```

You should see the **Market Discovery Dashboard** with 5 NYC restaurant leads.

## 🛑 Stop the Servers

To stop both servers, use `Ctrl+C` in their respective terminals.

## 🔄 Restart the Servers

### Option 1: Run both together
```bash
npm run dev
```

### Option 2: Run separately
**Terminal 1 (API Server):**
```bash
npm run dev:server
```

**Terminal 2 (Dashboard):**
```bash
npm run dev:client
```

## 📊 Test the API

Test the API directly:

**Get all leads:**
```bash
curl http://localhost:3001/api/leads
```

**Get single lead:**
```bash
curl http://localhost:3001/api/leads/lead_001
```

**Health check:**
```bash
curl http://localhost:3001/health
```

## 🎨 Dashboard Features

### ✅ Implemented
- [x] **Industrial Professional** aesthetic (Slate #1e293b, Navy #0f172a, White #ffffff)
- [x] **Pipeline Stats** - Total leads, high priority count, avg HFI score
- [x] **Market Discovery Grid** - All 5 mock restaurant leads
- [x] **HFI Badge System** - Color-coded friction scores
- [x] **Recency Indicators** - 0-30 days (blue badge), 31-90 days (gray text)
- [x] **Status Badges** - Scouted, Pitched, Secured, In-Build
- [x] **Lead Detail Modal** - Click any lead for full details
- [x] **Friction Clusters** - Categorized customer complaints
- [x] **Power Quotes** - Verbatim customer feedback
- [x] **Time-on-Task Estimates** - Efficiency impact metrics

### 🔜 Next Phase (Post-Demo)
- [ ] "Generate Voice of Customer PDF" button
- [ ] "Create Blueprint Handoff" button
- [ ] Yelp API integration
- [ ] OpenAI-powered artifact generation

## 🧪 Mock Data

The system uses `_architect_ref/MOCK_DATA.json` with 5 realistic NYC restaurants:

1. **Taco Libre Brooklyn** (HFI: 78) - Phone intake issues
2. **Queens Corner Cafe** (HFI: 65) - Wait time management
3. **Nonna's Trattoria** (HFI: 82) - Reservation system problems
4. **Harlem Soul Kitchen** (HFI: 71) - Order management chaos
5. **Bronx Pizza Palace** (HFI: 58) - Intake & coordination

## 📋 Demo Checklist

### Before Demo
- [ ] Clear browser cache
- [ ] Test on fresh incognito window
- [ ] Verify all 5 leads display correctly
- [ ] Test lead detail modal
- [ ] Verify HFI badge colors
- [ ] Check recency indicators

### During Demo
1. Show **Pipeline Stats** (5 total, 3 high priority)
2. Explain **HFI scoring** (red = critical, yellow = moderate)
3. Click **Nonna's Trattoria** (highest HFI: 82) to show modal
4. Highlight **Power Quotes** from real customers
5. Show **Recency Data** (22 issues in last 30 days)
6. Explain **Time-on-Task** impact (20-25 hours/week saved)

### Key Talking Points
- "This transforms 4 hours of manual research into a 5-minute data-backed pitch."
- "The HFI filters out noise—we only show tech-solvable problems."
- "Recency weighting ensures we pitch fresh problems, not ghost issues."
- "One click gives you everything needed to approach a restaurant owner."

## 🐛 Troubleshooting

**Dashboard shows "No data available"**
- Check that the API server is running on port 3001
- Verify `_architect_ref/MOCK_DATA.json` exists

**Port already in use**
- Kill process on port 3000: `npx kill-port 3000`
- Kill process on port 3001: `npx kill-port 3001`

**Dependencies issues**
```bash
# Reinstall everything
npm run install-all
```

## 📞 Questions?

Built for: Pursuit Leadership  
Demo Date: February 9, 2026  
Version: 4.2.0 - Hospitality Vertical
