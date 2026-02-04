"use client";

import { useEffect, useState } from "react";

interface Lead {
  id: string;
  business_name: string;
  category: string;
  location: {
    neighborhood: string;
    borough: string;
    zip: string;
  };
  hfi_score: number;
  friction_type: string;
  status: string;
  review_count: number;
  rating: number;
  friction_clusters: {
    category: string;
    count: number;
    recent_count: number;
    sample_quotes: string[];
  }[];
  recency_data: {
    "0_30_days": number;
    "31_90_days": number;
    "90_plus_days": number;
  };
  time_on_task_estimate: string;
  discovered_at: string;
}

interface LeadsData {
  leads: Lead[];
  metadata: {
    total_leads: number;
    high_priority_count: number;
    avg_hfi_score: number;
  };
}

// Generate strategic analysis summary from friction clusters
// Focuses on business impact and urgency based on recency-weighted data
const generateStrategicAnalysis = (
  frictionClusters: Lead['friction_clusters'],
  recencyData: Lead['recency_data'],
  frictionType: string
): string => {
  // Calculate weighted impact: prioritize recent friction (0-30 days = 1.0x, 31-90 days = 0.5x)
  const recentWeight = recencyData["0_30_days"] * 1.0;
  const supportingWeight = recencyData["31_90_days"] * 0.5;
  const totalWeightedImpact = recentWeight + supportingWeight;
  
  // Identify primary friction categories
  const primaryCluster = frictionClusters.reduce((prev, current) => 
    (current.recent_count > prev.recent_count) ? current : prev
  );
  
  // Determine urgency level
  const isHighUrgency = recentWeight >= 15;
  const urgencyPhrase = isHighUrgency ? "urgent operational pain" : "persistent operational friction";
  
  // Build category description
  const categoryMap: Record<string, string> = {
    'intake': 'customer intake processes',
    'booking': 'reservation and booking systems',
    'logistics': 'order fulfillment and logistics',
  };
  
  const categoryDesc = categoryMap[primaryCluster.category.toLowerCase()] || 'operational processes';
  
  // Generate first sentence: Core pain point
  const firstSentence = `This business faces ${urgencyPhrase} in ${categoryDesc}, with ${recencyData["0_30_days"]} recent friction signals indicating immediate customer dissatisfaction.`;
  
  // Generate second sentence: Business impact
  const impactPhrase = totalWeightedImpact >= 20 
    ? "significant revenue risk" 
    : totalWeightedImpact >= 10 
    ? "notable efficiency drain" 
    : "growing operational burden";
  
  const secondSentence = `The ${Math.round(totalWeightedImpact)} weighted friction points across ${frictionClusters.length} operational area${frictionClusters.length > 1 ? 's' : ''} represent ${impactPhrase} that requires technical intervention.`;
  
  return `${firstSentence} ${secondSentence}`;
};

// Generate mock HFI trend data for last 30 days
const generateHFITrendData = (currentAvg: number): number[] => {
  const days = 30;
  const trend: number[] = [];
  // Start slightly below current average and trend upward with realistic fluctuations
  let value = currentAvg - (Math.random() * 3 + 1);
  
  for (let i = 0; i < days; i++) {
    // Add small random fluctuations with slight upward trend
    const fluctuation = (Math.random() - 0.4) * 2; // Slight bias upward
    value += fluctuation;
    // Keep values in realistic HFI range (50-85)
    value = Math.max(50, Math.min(85, value));
    trend.push(value);
  }
  
  // Ensure last value is close to current average
  trend[days - 1] = currentAvg + (Math.random() * 2 - 1);
  
  return trend;
};

// Sparkline component
const Sparkline = ({ data, width = 120, height = 30 }: { data: number[]; width?: number; height?: number }) => {
  if (!data || data.length === 0) return null;
  
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1; // Avoid division by zero
  
  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  }).join(' ');
  
  return (
    <svg width={width} height={height} className="sparkline-svg">
      <polyline
        points={points}
        fill="none"
        stroke="#00d4ff"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.8"
      />
      <circle
        cx={(data.length - 1) / (data.length - 1) * width}
        cy={height - ((data[data.length - 1] - min) / range) * height}
        r="2"
        fill="#00d4ff"
        opacity="0.9"
      />
    </svg>
  );
};

export default function Dashboard() {
  const [data, setData] = useState<LeadsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "cluster">("list");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready-to-pitch" | "active-projects">("all");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [pdfLoadingStates, setPdfLoadingStates] = useState<Set<string>>(new Set());
  const [hfiTrendData, setHfiTrendData] = useState<number[]>([]);

  useEffect(() => {
    fetch("http://localhost:3001/api/leads")
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        // Generate trend data based on current average HFI
        if (data.metadata?.avg_hfi_score) {
          setHfiTrendData(generateHFITrendData(data.metadata.avg_hfi_score));
        }
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch leads:", err);
        setLoading(false);
      });
  }, []);

  // Filter leads based on status filter
  const filterLeadsByStatus = (leads: Lead[]) => {
    if (statusFilter === "all") return leads;
    if (statusFilter === "ready-to-pitch") {
      return leads.filter(lead => 
        lead.status.toLowerCase() === "qualified" || 
        lead.status.toLowerCase() === "briefed"
      );
    }
    if (statusFilter === "active-projects") {
      return leads.filter(lead => 
        lead.status.toLowerCase() === "matched" || 
        lead.status.toLowerCase() === "in-build"
      );
    }
    return leads;
  };

  // Group leads by friction type for cluster view
  const groupLeadsByFriction = (leads: Lead[]) => {
    const grouped: { [key: string]: Lead[] } = {};
    leads.forEach((lead) => {
      const frictionType = lead.friction_type;
      if (!grouped[frictionType]) {
        grouped[frictionType] = [];
      }
      grouped[frictionType].push(lead);
    });
    return grouped;
  };

  // Calculate neighborhood distribution
  const getNeighborhoodDistribution = (leads: Lead[]) => {
    const distribution: { [key: string]: number } = {};
    leads.forEach((lead) => {
      const neighborhood = lead.location.neighborhood;
      distribution[neighborhood] = (distribution[neighborhood] || 0) + 1;
    });
    // Sort by count descending, then alphabetically
    return Object.entries(distribution)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      })
      .map(([neighborhood, count]) => ({ neighborhood, count }));
  };

  // Calculate average HFI for a cluster
  const calculateClusterAvgHFI = (leads: Lead[]) => {
    const sum = leads.reduce((acc, lead) => acc + lead.hfi_score, 0);
    return (sum / leads.length).toFixed(1);
  };

  const getHFIBadge = (score: number) => {
    const badge = (className: string) => (
      <span className={`${className} inline-flex items-center gap-1.5`}>
        <span>HFI Signal {score}</span>
        <span 
          className="inline-flex items-center justify-center w-4 h-4 text-xs rounded-full bg-slate-200 text-slate-600 cursor-help group relative"
          title="AI-generated estimate of technical friction based on sample review data. Intended for institutional scouting purposes only."
        >
          ⓘ
          <span className="absolute left-full ml-2 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal">
            AI-generated estimate of technical friction based on sample review data. Intended for institutional scouting purposes only.
          </span>
        </span>
      </span>
    );
    
    if (score >= 80) return badge("badge-hfi-high badge-hfi-critical");
    if (score >= 75) return badge("badge-hfi-high");
    if (score >= 60) return badge("badge-hfi-medium");
    return badge("badge-hfi-low");
  };

  const getStatusBadge = (status: string) => {
    const statusMap: { [key: string]: string } = {
      qualified: "badge-status-qualified",
      unqualified: "badge-status-unqualified",
      briefed: "badge-status-briefed",
      engaged: "badge-status-engaged",
      nurture: "badge-status-nurture",
      matched: "badge-status-matched",
      "in-build": "badge-status-in-build",
      live: "badge-status-live",
    };
    return (
      <span className={statusMap[status.toLowerCase()] || "badge-status-unqualified"}>
        {status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}
      </span>
    );
  };

  // Parse hours from time_on_task_estimate string (e.g., "15-20 hours/week" -> 20)
  const parseHoursFromEstimate = (estimate: string): number => {
    // Match patterns like "15-20 hours/week" or "10 hours/week" or "5-8 hours/week"
    const rangeMatch = estimate.match(/(\d+)-(\d+)\s*hours/i);
    if (rangeMatch) {
      // Return the maximum value from the range
      return Math.max(parseInt(rangeMatch[1]), parseInt(rangeMatch[2]));
    }
    // Match single number pattern like "10 hours/week"
    const singleMatch = estimate.match(/(\d+)\s*hours/i);
    if (singleMatch) {
      return parseInt(singleMatch[1]);
    }
    // Default to 0 if no match found
    return 0;
  };

  // Calculate percentage for progress bar (normalize to 30 hours/week = 100%)
  const getProgressPercentage = (hours: number): number => {
    const maxHours = 30;
    return Math.min((hours / maxHours) * 100, 100);
  };

  // Get color gradient based on hours (urgency)
  const getProgressBarColor = (hours: number): string => {
    if (hours >= 20) {
      // High urgency: red gradient
      return "from-red-500 to-red-700";
    } else if (hours >= 15) {
      // Medium-high urgency: orange-red gradient
      return "from-orange-500 to-red-600";
    } else if (hours >= 10) {
      // Medium urgency: amber gradient
      return "from-amber-500 to-orange-500";
    } else {
      // Low urgency: yellow-green gradient
      return "from-yellow-400 to-amber-500";
    }
  };

  // Progress bar component
  const FrictionProgressBar = ({ estimate }: { estimate: string }) => {
    const hours = parseHoursFromEstimate(estimate);
    const percentage = getProgressPercentage(hours);
    const colorClass = getProgressBarColor(hours);

    return (
      <div className="mt-2">
        <div className="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden border border-gray-300 shadow-inner">
          <div
            className={`h-full bg-gradient-to-r ${colorClass} transition-all duration-500 ease-out rounded-full shadow-sm`}
            style={{ width: `${percentage}%` }}
          />
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-textTertiary">Time Burden</span>
          <span className="text-xs font-medium text-textSecondary">
            {hours} hrs/week ({percentage.toFixed(0)}%)
          </span>
        </div>
      </div>
    );
  };

  // Map friction type to tech stack suggestions
  const getTechStackTag = (frictionType: string): string | null => {
    const frictionLower = frictionType.toLowerCase();
    
    // Phone intake issues -> AI Voice Integration
    if (frictionLower.includes("phone intake") || frictionLower.includes("phone")) {
      return "AI Voice Integration";
    }
    
    // Booking/Reservation systems -> PERN Stack
    if (frictionLower.includes("booking") || 
        frictionLower.includes("reservation") || 
        frictionLower.includes("waitlist") ||
        frictionLower.includes("wait time")) {
      return "PERN Stack Opportunity";
    }
    
    // Logistics/Tracking issues -> Automation Pipeline
    if (frictionLower.includes("tracking") || 
        frictionLower.includes("logistics") || 
        frictionLower.includes("order management") ||
        frictionLower.includes("delivery")) {
      return "Automation Pipeline";
    }
    
    // General intake/ordering -> React + Node API
    if (frictionLower.includes("intake") || 
        frictionLower.includes("ordering") || 
        frictionLower.includes("pre-order") ||
        frictionLower.includes("online")) {
      return "React + Node API";
    }
    
    // Default fallback for other cases
    return "React + Node API";
  };

  // Map friction type to proposed technical deliverables for Alumni
  const getProposedSolutions = (frictionType: string): string[] => {
    const frictionLower = frictionType.toLowerCase();
    
    // Phone Intake
    if (frictionLower.includes("phone intake") || frictionLower.includes("phone")) {
      return [
        "Twilio Voice API Integration",
        "PostgreSQL Call Queue System",
        "Automated Call Routing & IVR",
        "Call Analytics Dashboard"
      ];
    }
    
    // Reservation System / Booking
    if (frictionLower.includes("reservation") || 
        frictionLower.includes("booking") ||
        frictionLower.includes("waitlist") ||
        frictionLower.includes("wait time")) {
      return [
        "Real-time SMS Waitlist System",
        "React Booking Dashboard",
        "Calendar API Integration",
        "Automated Confirmation & Reminders"
      ];
    }
    
    // Logistics / Delivery Tracking
    if (frictionLower.includes("logistics") || 
        frictionLower.includes("delivery") ||
        frictionLower.includes("tracking")) {
      return [
        "Route Optimization API",
        "Delivery Tracking Portal",
        "Real-time GPS Integration",
        "Driver Dispatch Management System"
      ];
    }
    
    // Order Management / Online Ordering
    if (frictionLower.includes("order management") || 
        frictionLower.includes("online ordering") ||
        frictionLower.includes("pre-order")) {
      return [
        "React Order Management Dashboard",
        "Stripe Payment Integration",
        "Order Status API & Webhooks",
        "Inventory Management System"
      ];
    }
    
    // Order Tracking (separate from logistics)
    if (frictionLower.includes("order tracking")) {
      return [
        "Order Status Tracking API",
        "Real-time Update System",
        "Customer Notification Service",
        "Order History Dashboard"
      ];
    }
    
    // Default fallback
    return [
      "Custom API Integration",
      "React Admin Dashboard",
      "Database Schema Design",
      "Automated Workflow System"
    ];
  };

  // Generate recommended pitch hook based on friction type and business name
  const generatePitchHook = (lead: Lead): string => {
    const frictionLower = lead.friction_type.toLowerCase();
    const businessName = lead.business_name;
    
    // Phone intake issues
    if (frictionLower.includes("phone intake") || frictionLower.includes("phone")) {
      return `Hi, I'm reaching out from Pursuit about ${businessName}. We've noticed your customers are struggling with phone wait times during peak hours—we can help you automate order intake so your team can focus on what they do best. Would you be open to a quick 15-minute conversation about how we've helped similar businesses in Brooklyn reduce manual phone handling by 60%?`;
    }
    
    // Booking/Reservation systems
    if (frictionLower.includes("booking") || 
        frictionLower.includes("reservation") || 
        frictionLower.includes("waitlist") ||
        frictionLower.includes("wait time")) {
      return `Hi, I'm calling from Pursuit about ${businessName}. We've seen that customers are frustrated with wait time estimates and booking confusion—we can build you a simple reservation system that gives customers real-time updates and reduces no-shows. Can we schedule a brief call this week to discuss how this could save your team 10+ hours per week?`;
    }
    
    // Logistics/Tracking issues
    if (frictionLower.includes("tracking") || 
        frictionLower.includes("logistics") || 
        frictionLower.includes("order management") ||
        frictionLower.includes("delivery")) {
      return `Hi, I'm reaching out from Pursuit about ${businessName}. We've noticed your customers are having trouble tracking orders and getting updates—we can help you set up a simple order management system that keeps customers informed automatically. Would you be interested in a quick conversation about how we've helped similar restaurants eliminate order confusion and reduce customer service calls?`;
    }
    
    // General intake/ordering
    if (frictionLower.includes("intake") || 
        frictionLower.includes("ordering") || 
        frictionLower.includes("pre-order") ||
        frictionLower.includes("online")) {
      return `Hi, I'm calling from Pursuit about ${businessName}. We've seen that customers want to order ahead but your current system makes it difficult—we can build you a streamlined online ordering platform that integrates with your existing workflow. Can we schedule a 15-minute call to show you how this could reduce manual order handling and increase customer satisfaction?`;
    }
    
    // Default fallback
    return `Hi, I'm reaching out from Pursuit about ${businessName}. We've identified some technical friction that's impacting your customer experience—we can help you solve this with a custom solution built by our alumni network. Would you be open to a brief conversation about how we've helped similar businesses in your area streamline their operations?`;
  };

  // Toggle lead selection
  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(leadId)) {
        newSet.delete(leadId);
      } else {
        newSet.add(leadId);
      }
      return newSet;
    });
  };

  // Toggle all leads in a cluster
  const toggleClusterSelection = (clusterLeads: Lead[]) => {
    const clusterIds = new Set(clusterLeads.map((l) => l.id));
    const allSelected = clusterLeads.every((l) => selectedLeadIds.has(l.id));

    setSelectedLeadIds((prev) => {
      const newSet = new Set(prev);
      if (allSelected) {
        clusterIds.forEach((id) => newSet.delete(id));
      } else {
        clusterIds.forEach((id) => newSet.add(id));
      }
      return newSet;
    });
  };

  // Bulk update status
  const handleBulkStatusUpdate = (newStatus: string) => {
    if (!data || selectedLeadIds.size === 0) return;

    setData((prevData) => {
      if (!prevData) return prevData;
      return {
        ...prevData,
        leads: prevData.leads.map((lead) =>
          selectedLeadIds.has(lead.id) ? { ...lead, status: newStatus } : lead
        ),
      };
    });

    setSelectedLeadIds(new Set());
  };

  // Check if a cluster is fully selected
  const isClusterFullySelected = (clusterLeads: Lead[]) => {
    return clusterLeads.length > 0 && clusterLeads.every((l) => selectedLeadIds.has(l.id));
  };

  // Check if a cluster is partially selected
  const isClusterPartiallySelected = (clusterLeads: Lead[]) => {
    return clusterLeads.some((l) => selectedLeadIds.has(l.id)) && !isClusterFullySelected(clusterLeads);
  };

  // Download Markdown brief
  const handleDownloadMarkdown = async (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    
    try {
      const response = await fetch(`http://localhost:3001/generate-handoff/${lead.id}/markdown`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate markdown');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lead.business_name.replace(/\s+/g, '_')}_Brief.md`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading markdown:', error);
      alert('Failed to download markdown brief. Please try again.');
    }
  };

  // Generate and download PDF report
  const handleGeneratePDF = async (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card click
    
    // Set loading state
    setPdfLoadingStates((prev) => new Set(prev).add(lead.id));
    
    try {
      const response = await fetch(`http://localhost:3001/generate-handoff/${lead.id}/pdf`, {
        method: 'GET',
      });
      
      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${lead.business_name.replace(/\s+/g, '_')}_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Failed to generate PDF report. Please try again.');
    } finally {
      // Clear loading state
      setPdfLoadingStates((prev) => {
        const newSet = new Set(prev);
        newSet.delete(lead.id);
        return newSet;
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textPrimary text-xl font-light">Loading Pipeline...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textPrimary text-xl font-light">No data available. Please start the server.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-textPrimary">
      {/* Header */}
      <header className="bg-white border-b border-border shadow-sm">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Bridge.IT Title with B logo */}
              <div className="flex items-center gap-1">
                <img 
                  src="/bridge-b-arch.png" 
                  alt="Bridge B" 
                  className="h-28 w-auto logo-glow"
                  style={{ backgroundColor: '#000000', padding: '8px', borderRadius: '8px' }}
                />
                <h1 className="text-6xl font-bold tracking-tight text-textPrimary">
                  ridge<span className="text-cyber-blue">.IT</span>
                </h1>
              </div>
              <div className="ml-6 border-l-2 border-gray-300 pl-6">
                <p className="text-lg font-semibold text-cyber-blue leading-tight">
                  Where Local Friction & Technical Solutions Meet
                </p>
                <p className="text-base text-textSecondary font-medium mt-1">
                  Pursuit Staff Portal
                </p>
              </div>
            </div>
            <div className="text-right">
              <div className="text-base font-semibold text-textPrimary">Hospitality Vertical</div>
            </div>
          </div>
        </div>
      </header>

      {/* Pipeline Stats */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
            <div className="text-textSecondary text-sm uppercase tracking-wide mb-2 font-medium">
              Total Leads
            </div>
            <div className="text-4xl font-semibold text-textPrimary">{data.metadata.total_leads}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
            <div className="text-textSecondary text-sm uppercase tracking-wide mb-2 font-medium">
              High Priority (HFI Signal ≥75)
            </div>
            <div className="text-4xl font-semibold text-textPrimary">{data.metadata.high_priority_count}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-6 shadow-sm">
            <div className="text-textSecondary text-sm uppercase tracking-wide mb-2 font-medium">
              Avg HFI Signal
            </div>
            <div className="text-4xl font-semibold text-textPrimary">{data.metadata.avg_hfi_score.toFixed(1)}</div>
          </div>
        </div>

        {/* Geographic Distribution */}
        <div className="bg-card border border-border rounded-lg p-6 shadow-sm mb-8">
          <div className="text-textSecondary text-sm uppercase tracking-wide mb-4 font-medium">
            Geographic Distribution
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            {getNeighborhoodDistribution(data.leads).map((item, index) => (
              <div key={item.neighborhood} className="flex items-center gap-2">
                <span className="text-textPrimary font-semibold text-base">{item.neighborhood}</span>
                <span className="text-textSecondary">:</span>
                <span className="text-[#00d4ff] font-bold text-lg">{item.count}</span>
                <span className="text-textSecondary text-sm font-medium">lead{item.count !== 1 ? 's' : ''}</span>
                {index < getNeighborhoodDistribution(data.leads).length - 1 && (
                  <span className="text-slate-300 mx-1 font-light">|</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Status Filter Bar */}
        <div className="mb-6">
          <div className="flex items-center gap-3 bg-card border border-border rounded-lg p-2">
            <span className="text-sm font-medium text-textSecondary px-2">Filter:</span>
            <button
              onClick={() => setStatusFilter("all")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === "all"
                  ? "bg-slate-600 text-white"
                  : "text-textSecondary hover:text-textPrimary hover:bg-gray-100"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter("ready-to-pitch")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === "ready-to-pitch"
                  ? "bg-slate-600 text-white"
                  : "text-textSecondary hover:text-textPrimary hover:bg-gray-100"
              }`}
            >
              Ready to Pitch
            </button>
            <button
              onClick={() => setStatusFilter("active-projects")}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                statusFilter === "active-projects"
                  ? "bg-slate-600 text-white"
                  : "text-textSecondary hover:text-textPrimary hover:bg-gray-100"
              }`}
            >
              Active Projects
            </button>
          </div>
        </div>

          {/* Bulk Update Bar */}
          {selectedLeadIds.size > 0 && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
              <div className="text-sm font-medium text-blue-900">
                {selectedLeadIds.size} lead{selectedLeadIds.size !== 1 ? "s" : ""} selected
              </div>
              <div className="flex items-center gap-3">
                <select
                  onChange={(e) => {
                    if (e.target.value) {
                      handleBulkStatusUpdate(e.target.value);
                      e.target.value = "";
                    }
                  }}
                  className="px-4 py-2 border border-blue-300 rounded-md text-sm font-medium text-blue-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Update Status...
                  </option>
                  <option value="qualified">Qualified</option>
                  <option value="briefed">Briefed</option>
                  <option value="engaged">Engaged</option>
                  <option value="nurture">Nurture</option>
                  <option value="matched">Matched</option>
                  <option value="in-build">In Build</option>
                  <option value="live">Live</option>
                </select>
                <button
                  onClick={() => setSelectedLeadIds(new Set())}
                  className="px-4 py-2 text-sm font-medium text-blue-700 hover:text-blue-900"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          )}

          {/* Market Discovery Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-2xl font-semibold">
                Market Discovery: The Batch Scout
              </h2>
              <p className="text-textSecondary mt-1 font-normal text-sm">
                Brooklyn & Queens Hospitality SMBs with tech-solvable friction.
              </p>
            </div>
            {/* View Toggle */}
            <div className="flex items-center gap-2 bg-card border border-border rounded-lg p-1">
              <button
                onClick={() => setViewMode("list")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === "list"
                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                    : "text-textSecondary hover:text-textPrimary"
                }`}
              >
                List View
              </button>
              <button
                onClick={() => setViewMode("cluster")}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === "cluster"
                    ? "bg-blue-100 text-blue-700 border border-blue-200"
                    : "text-textSecondary hover:text-textPrimary"
                }`}
              >
                Cluster View
              </button>
            </div>
          </div>

          {/* List View */}
          {viewMode === "list" && (
            <div className="grid grid-cols-1 gap-4">
              {filterLeadsByStatus(data.leads)
                .sort((a, b) => b.hfi_score - a.hfi_score)
                .map((lead) => (
                  <div
                    key={lead.id}
                    className={`bg-card border rounded-lg p-6 hover:shadow-md transition-all cursor-pointer ${
                      lead.hfi_score >= 80 
                        ? 'card-critical-border' 
                        : 'border-border hover:border-gray-300'
                    }`}
                    onClick={(e) => {
                      // Don't open modal if clicking checkbox or button
                      const target = e.target as HTMLElement;
                      if (target.tagName !== "INPUT" && target.tagName !== "BUTTON" && !target.closest("button")) {
                        setSelectedLead(lead);
                      }
                    }}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-3 flex-1">
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.has(lead.id)}
                          onChange={() => toggleLeadSelection(lead.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer flex-shrink-0"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2 flex-wrap">
                            <h3 className="text-xl font-medium text-textPrimary">{lead.business_name}</h3>
                            {getHFIBadge(lead.hfi_score)}
                            {getStatusBadge(lead.status)}
                            {(() => {
                              const techTag = getTechStackTag(lead.friction_type);
                              return techTag ? (
                                <span className="badge-tech-stack">{techTag}</span>
                              ) : null;
                            })()}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-textSecondary">
                            <span>{lead.category}</span>
                            <span>•</span>
                            <span>
                              {lead.location.neighborhood}, {lead.location.borough}
                            </span>
                            <span>•</span>
                            <span>{lead.review_count} reviews</span>
                            <span>•</span>
                            <span>{lead.rating} rating</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={(e) => handleDownloadMarkdown(lead, e)}
                          className="px-3 py-1.5 text-xs font-medium text-textSecondary bg-white border border-border rounded-md hover:bg-gray-50 hover:text-textPrimary transition-colors shadow-sm"
                          title="Download Brief (MD)"
                        >
                          Download Brief (MD)
                        </button>
                        <button
                          onClick={(e) => handleGeneratePDF(lead, e)}
                          disabled={pdfLoadingStates.has(lead.id)}
                          className={`px-3 py-1.5 text-xs font-medium text-white rounded-md transition-all shadow-sm ${
                            pdfLoadingStates.has(lead.id)
                              ? 'bg-slate-400 cursor-not-allowed'
                              : 'btn-neon'
                          }`}
                          title="Generate Report (PDF)"
                        >
                          {pdfLoadingStates.has(lead.id) ? 'Generating...' : 'Generate Report (PDF)'}
                        </button>
                      </div>
                    </div>

                    <div className="mb-4">
                      <div className="text-sm font-medium text-textPrimary mb-2">
                        Primary Friction: {lead.friction_type}
                      </div>
                      <div className="text-sm text-textSecondary mb-2">{lead.time_on_task_estimate}</div>
                      <FrictionProgressBar estimate={lead.time_on_task_estimate} />
                    </div>

                    {/* Recency Indicators */}
                    <div className="flex items-center gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="badge-recency">
                          {lead.recency_data["0_30_days"]} Recent (0-30d)
                        </span>
                        <span className="text-textTertiary">
                          {lead.recency_data["31_90_days"]} Supporting (31-90d)
                        </span>
                      </div>
                    </div>

                    {/* Sample Quote Preview */}
                    {lead.friction_clusters[0] && lead.friction_clusters[0].sample_quotes[0] && (
                      <div className="mt-4 pt-4 border-t border-border">
                        <div className="text-xs text-textTertiary uppercase tracking-wide mb-2 font-medium">
                          Top Customer Quote
                        </div>
                        <div className="text-sm text-textSecondary italic">
                          "{lead.friction_clusters[0].sample_quotes[0]}"
                        </div>
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Cluster View */}
          {viewMode === "cluster" && (
            <div className="space-y-8">
              {Object.entries(groupLeadsByFriction(filterLeadsByStatus(data.leads)))
                .sort(([, leadsA], [, leadsB]) => {
                  // Sort clusters by highest HFI in cluster
                  const maxA = Math.max(...leadsA.map(l => l.hfi_score));
                  const maxB = Math.max(...leadsB.map(l => l.hfi_score));
                  return maxB - maxA;
                })
                .map(([frictionType, clusterLeads]) => (
                  <div key={frictionType} className="space-y-4">
                    {/* Cluster Header */}
                    <div className="bg-gradient-to-r from-blue-50 to-white border-l-4 border-blue-500 rounded-lg p-4 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isClusterFullySelected(clusterLeads)}
                            ref={(input) => {
                              if (input) input.indeterminate = isClusterPartiallySelected(clusterLeads);
                            }}
                            onChange={() => toggleClusterSelection(clusterLeads)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
                          />
                          <div>
                            <h3 className="text-lg font-semibold text-textPrimary">
                              {frictionType}
                            </h3>
                            <p className="text-sm text-textSecondary mt-1">
                              Common friction pattern across multiple businesses
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-2xl font-semibold text-blue-700">
                            {clusterLeads.length}
                          </div>
                          <div className="text-xs text-textSecondary uppercase tracking-wide">
                            Businesses
                          </div>
                          <div className="mt-2">
                            <span className="text-sm font-medium text-textSecondary">Avg HFI: </span>
                            <span className="text-lg font-semibold text-textPrimary">
                              {calculateClusterAvgHFI(clusterLeads)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Cluster Leads */}
                    <div className="grid grid-cols-1 gap-4 pl-4">
                      {clusterLeads
                        .sort((a, b) => b.hfi_score - a.hfi_score)
                        .map((lead) => (
                          <div
                            key={lead.id}
                            className={`bg-card border rounded-lg p-6 hover:shadow-md transition-all cursor-pointer ${
                              lead.hfi_score >= 80 
                                ? 'card-critical-border' 
                                : 'border-border hover:border-gray-300'
                            }`}
                            onClick={(e) => {
                              // Don't open modal if clicking checkbox
                              if ((e.target as HTMLElement).tagName !== "INPUT") {
                                setSelectedLead(lead);
                              }
                            }}
                          >
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex items-start gap-3 flex-1">
                                <input
                                  type="checkbox"
                                  checked={selectedLeadIds.has(lead.id)}
                                  onChange={() => toggleLeadSelection(lead.id)}
                                  onClick={(e) => e.stopPropagation()}
                                  className="mt-1 w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer flex-shrink-0"
                                />
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2 flex-wrap">
                                    <h3 className="text-xl font-medium text-textPrimary">
                                      {lead.business_name}
                                    </h3>
                                    {getHFIBadge(lead.hfi_score)}
                                    {getStatusBadge(lead.status)}
                                    {(() => {
                                      const techTag = getTechStackTag(lead.friction_type);
                                      return techTag ? (
                                        <span className="badge-tech-stack">{techTag}</span>
                                      ) : null;
                                    })()}
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-textSecondary">
                                    <span>{lead.category}</span>
                                    <span>•</span>
                                    <span>
                                      {lead.location.neighborhood}, {lead.location.borough}
                                    </span>
                                    <span>•</span>
                                    <span>{lead.review_count} reviews</span>
                                    <span>•</span>
                                    <span>{lead.rating} rating</span>
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={(e) => handleDownloadMarkdown(lead, e)}
                                  className="px-3 py-1.5 text-xs font-medium text-textSecondary bg-white border border-border rounded-md hover:bg-gray-50 hover:text-textPrimary transition-colors shadow-sm"
                                  title="Download Brief (MD)"
                                >
                                  Download Brief (MD)
                                </button>
                                <button
                                  onClick={(e) => handleGeneratePDF(lead, e)}
                                  disabled={pdfLoadingStates.has(lead.id)}
                                  className={`px-3 py-1.5 text-xs font-medium text-white rounded-md transition-all shadow-sm ${
                                    pdfLoadingStates.has(lead.id)
                                      ? 'bg-slate-400 cursor-not-allowed'
                                      : 'btn-neon'
                                  }`}
                                  title="Generate Report (PDF)"
                                >
                                  {pdfLoadingStates.has(lead.id) ? 'Generating...' : 'Generate Report (PDF)'}
                                </button>
                              </div>
                            </div>

                            <div className="mb-4">
                              <div className="text-sm text-textSecondary mb-2">{lead.time_on_task_estimate}</div>
                              <FrictionProgressBar estimate={lead.time_on_task_estimate} />
                            </div>

                            {/* Recency Indicators */}
                            <div className="flex items-center gap-4 text-sm">
                              <div className="flex items-center gap-2">
                                <span className="badge-recency">
                                  {lead.recency_data["0_30_days"]} Recent (0-30d)
                                </span>
                                <span className="text-textTertiary">
                                  {lead.recency_data["31_90_days"]} Supporting (31-90d)
                                </span>
                              </div>
                            </div>

                            {/* Sample Quote Preview */}
                            {lead.friction_clusters[0] && lead.friction_clusters[0].sample_quotes[0] && (
                              <div className="mt-4 pt-4 border-t border-border">
                                <div className="text-xs text-textTertiary uppercase tracking-wide mb-2 font-medium">
                                  Top Customer Quote
                                </div>
                                <div className="text-sm text-textSecondary italic">
                                  "{lead.friction_clusters[0].sample_quotes[0]}"
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Lead Detail Modal */}
      {selectedLead && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6 z-50"
          onClick={() => setSelectedLead(null)}
        >
          <div
            className="bg-card border border-border rounded-lg p-8 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <h2 className="text-3xl font-semibold mb-2 text-textPrimary">{selectedLead.business_name}</h2>
                <div className="flex items-center gap-3 flex-wrap">
                  {getHFIBadge(selectedLead.hfi_score)}
                  {getStatusBadge(selectedLead.status)}
                  {(() => {
                    const techTag = getTechStackTag(selectedLead.friction_type);
                    return techTag ? (
                      <span className="badge-tech-stack">{techTag}</span>
                    ) : null;
                  })()}
                </div>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-textTertiary hover:text-textPrimary text-2xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-6">
              {/* Location & Contact */}
              <div>
                <h3 className="text-lg font-medium mb-3 text-textPrimary">Location & Contact</h3>
                <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm border border-border">
                  <div>
                    <span className="text-textSecondary">Neighborhood:</span>{" "}
                    <span className="text-textPrimary">
                      {selectedLead.location.neighborhood}, {selectedLead.location.borough}
                    </span>
                  </div>
                  <div>
                    <span className="text-textSecondary">ZIP:</span>{" "}
                    <span className="text-textPrimary">{selectedLead.location.zip}</span>
                  </div>
                </div>
              </div>

              {/* Strategic Analysis */}
              <div>
                <h3 className="text-lg font-medium mb-3 text-textPrimary">Strategic Analysis</h3>
                <div className="bg-slate-900 rounded-lg p-6 border-2 border-slate-700 shadow-lg">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 mt-1">
                      <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-white text-base leading-relaxed font-medium">
                        {generateStrategicAnalysis(
                          selectedLead.friction_clusters,
                          selectedLead.recency_data,
                          selectedLead.friction_type
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Time-on-Task */}
              <div>
                <h3 className="text-lg font-medium mb-3 text-textPrimary">Efficiency Impact</h3>
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4 border border-border">
                    <div className="text-sm text-textSecondary mb-2">Estimated Manual Burden</div>
                    <FrictionProgressBar estimate={selectedLead.time_on_task_estimate} />
                  </div>
                  <div className="bg-green-50 rounded-lg p-4 border-2 border-green-300 shadow-sm">
                    <div className="text-sm font-medium text-green-800 mb-2">Potential Impact</div>
                    {(() => {
                      const hours = parseHoursFromEstimate(selectedLead.time_on_task_estimate);
                      // Calculate recoverable hours (70-80% range, use 75% as midpoint)
                      const efficiencyGain = 75; // 75% efficiency gain
                      const recoverableHours = Math.round(hours * (efficiencyGain / 100));
                      return (
                        <div className="flex items-center gap-3">
                          <div className="flex-1">
                            <div className="text-2xl font-bold text-green-700">
                              ~{recoverableHours} hours/week recovered
                            </div>
                            <div className="text-sm text-green-600 mt-1 font-medium">
                              {efficiencyGain}% efficiency gain
                            </div>
                          </div>
                          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-green-500 text-white font-bold text-lg shadow-md">
                            {efficiencyGain}%
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Proposed Solution for Alumni */}
              <div>
                <h3 className="text-lg font-medium mb-3 text-textPrimary">
                  Proposed Solution <span className="text-sm font-normal text-purple-600">(for Alumni)</span>
                </h3>
                <div className="bg-gradient-to-br from-purple-50 to-indigo-50 rounded-lg p-5 border-2 border-purple-200 shadow-sm">
                  <div className="text-sm font-semibold text-purple-900 mb-3 uppercase tracking-wide">
                    Technical Deliverables
                  </div>
                  <ul className="space-y-2.5 mb-4">
                    {getProposedSolutions(selectedLead.friction_type).map((deliverable, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <svg 
                          className="w-5 h-5 text-cyan-500 mt-0.5 flex-shrink-0" 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path 
                            strokeLinecap="round" 
                            strokeLinejoin="round" 
                            strokeWidth={2} 
                            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" 
                          />
                        </svg>
                        <span className="text-sm text-purple-800 font-medium">{deliverable}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-3 mt-3 border-t border-purple-200">
                    <div className="flex items-center gap-2 text-xs text-purple-600 font-medium">
                      <svg 
                        className="w-4 h-4 text-purple-400" 
                        fill="none" 
                        stroke="currentColor" 
                        viewBox="0 0 24 24"
                      >
                        <path 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          strokeWidth={2} 
                          d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" 
                        />
                      </svg>
                      <span>Standard PERN-Stack Deployment | Est. 4-week Build</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Staff Action */}
              <div>
                <h3 className="text-lg font-medium mb-3 text-textPrimary">Staff Action</h3>
                <div className="bg-gradient-to-br from-cyan-50 to-blue-50 rounded-lg p-5 border-2 border-cyan-300 shadow-sm">
                  <div className="flex items-start gap-3 mb-3">
                    <div className="flex-shrink-0 mt-0.5">
                      <svg className="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-cyan-800 uppercase tracking-wide mb-2">
                        Recommended Pitch Hook
                      </div>
                      <div className="text-base text-gray-800 leading-relaxed font-medium">
                        {generatePitchHook(selectedLead)}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 pt-3 border-t border-cyan-200">
                    <div className="flex items-center gap-2 text-xs text-cyan-700">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span className="font-medium">Ready to use verbatim for phone calls or emails</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Institutional Artifacts */}
              <div>
                <h3 className="text-lg font-medium mb-3 text-textPrimary">Institutional Artifacts</h3>
                <div className="flex gap-3">
                  <button
                    onClick={(e) => handleDownloadMarkdown(selectedLead, e)}
                    className="flex-1 px-4 py-3 text-sm font-medium text-textSecondary bg-white border border-border rounded-lg hover:bg-gray-50 hover:text-textPrimary transition-colors shadow-sm"
                    title="Download Brief (MD)"
                  >
                    Download Brief (MD)
                  </button>
                  <button
                    onClick={(e) => handleGeneratePDF(selectedLead, e)}
                    disabled={pdfLoadingStates.has(selectedLead.id)}
                    className={`flex-1 px-4 py-3 text-sm font-medium text-white rounded-lg transition-all shadow-sm ${
                      pdfLoadingStates.has(selectedLead.id)
                        ? 'bg-slate-400 cursor-not-allowed'
                        : 'btn-neon'
                    }`}
                    title="Generate Report (PDF)"
                  >
                    {pdfLoadingStates.has(selectedLead.id) ? 'Generating...' : 'Generate Report (PDF)'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Status Legend - Lower Left Slide-out */}
      <div className="fixed bottom-6 left-6 z-40 flex items-end gap-3">
        {/* Toggle Button - Vertical Slim */}
        <button
          onClick={() => setLegendExpanded(!legendExpanded)}
          className="bg-card border border-border rounded-lg shadow-lg px-3 py-6 hover:bg-gray-50 transition-all hover:shadow-xl"
        >
          <div className="flex flex-col items-center gap-2">
            <svg
              className={`w-4 h-4 text-textSecondary transition-transform duration-300 ${
                legendExpanded ? "rotate-0" : "rotate-180"
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span 
              className="text-xs text-textSecondary uppercase tracking-wide font-medium"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              Legend
            </span>
          </div>
        </button>

        {/* Expanded Content */}
        {legendExpanded && (
          <div className="bg-card border border-border rounded-lg shadow-lg p-4 w-64 animate-in slide-in-from-left duration-300">
            <h3 className="text-sm font-semibold text-textPrimary mb-3 border-b border-border pb-2">Status Legend</h3>

            <div className="space-y-3">
              <div className="flex items-center gap-2 group relative">
                <div className="w-3 h-3 rounded-full bg-blue-500 flex-shrink-0"></div>
                <span className="text-sm text-textPrimary">AI-Verified Lead</span>
                <div className="absolute left-0 top-full mt-2 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Qualified/Briefed: High-probability technical gap identified via HFI signal
                </div>
              </div>
              <div className="flex items-center gap-2 group relative">
                <div className="w-3 h-3 rounded-full bg-yellow-500 flex-shrink-0"></div>
                <span className="text-sm text-textPrimary">Staff Outreach</span>
                <div className="absolute left-0 top-full mt-2 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Engaged/Nurture: Staff is actively reaching out and nurturing the relationship
                </div>
              </div>
              <div className="flex items-center gap-2 group relative">
                <div className="w-3 h-3 rounded-full bg-purple-500 flex-shrink-0"></div>
                <span className="text-sm text-textPrimary">Alumni Project</span>
                <div className="absolute left-0 top-full mt-2 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Matched/In Build: Alumnus has accepted the technical brief and project is in progress
                </div>
              </div>
              <div className="flex items-center gap-2 group relative">
                <div className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0"></div>
                <span className="text-sm text-textPrimary">Success Story</span>
                <div className="absolute left-0 top-full mt-2 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                  Live: Project is live and delivering value to the business
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
