"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";

interface ActiveBuilder {
  userId: string;
  name: string;
  joinedAt: string;
  checkpointsCompleted: number;
  proofLinks: string[];
  last_nudged_at?: string | null;
  last_checkpoint_update?: string | null;
  checkpointStatuses?: {
    [key: string]: {
      status: 'pending' | 'submitted' | 'verified';
      proofLink?: string;
      submittedAt?: string;
      verifiedAt?: string;
      notes?: string;
    };
  };
  scoutReview?: {
    qualityScore: number;
    scoutReviewScore?: number;
    reviewNotes?: string;
    reviewedAt?: string;
  };
}

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
  activeBuilders?: ActiveBuilder[];
  submissionWindowOpen?: boolean;
  firstCompletionAt?: string | null;
  winnerUserId?: string | null;
  contact?: {
    phone: string;
    owner_name: string;
  };
  sprintActive?: boolean;
  maxSlots?: number;
  sprintDuration?: number; // in weeks
  sprintStartedAt?: string;
  sprintDeadline?: string;
  isPaused?: boolean;
  auditLog?: {
    action: string;
    performedBy: string;
    timestamp: string;
    details: string;
    reason?: string;
  }[];
  milestones?: {
    id: number;
    name: string;
    description: string;
    completionWeight: number;
  }[];
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

// Launch Sprint Configuration Component
interface LaunchSprintConfigProps {
  lead: Lead;
  onLaunch: (lead: Lead, maxSlots: number, duration: number, e: React.MouseEvent) => void;
  isLoading: boolean;
}

const LaunchSprintConfig: React.FC<LaunchSprintConfigProps> = ({ lead, onLaunch, isLoading }) => {
  const [showConfig, setShowConfig] = useState(false);
  const [maxSlots, setMaxSlots] = useState(2);
  const [duration, setDuration] = useState(3);
  const configRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (configRef.current && !configRef.current.contains(event.target as Node)) {
        setShowConfig(false);
      }
    };

    if (showConfig) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showConfig]);

  const handleStartSprint = (e: React.MouseEvent) => {
    e.stopPropagation();
    onLaunch(lead, maxSlots, duration, e);
    setShowConfig(false);
  };

  return (
    <div className="relative" ref={configRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowConfig(!showConfig);
        }}
        disabled={isLoading}
        className={`px-3 py-1.5 text-xs font-medium text-white rounded-md transition-all shadow-sm ${
          isLoading
            ? 'bg-slate-400 cursor-not-allowed'
            : 'bg-cyan-600 hover:bg-cyan-700'
        }`}
        title="Launch Sprint"
      >
        {isLoading ? 'Launching...' : 'Launch Sprint'}
      </button>

      {showConfig && (
        <div
          className="absolute top-full left-0 mt-2 bg-white border border-border rounded-lg shadow-lg p-4 z-50 min-w-[280px]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-3">
            <div className="text-sm font-semibold text-textPrimary mb-2">
              Sprint Configuration
            </div>
            
            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1">
                Max Slots
              </label>
              <select
                value={maxSlots}
                onChange={(e) => setMaxSlots(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-white text-textPrimary focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {[1, 2, 3, 4].map((num) => (
                  <option key={num} value={num}>
                    {num} {num === 1 ? 'slot' : 'slots'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-textSecondary mb-1">
                Duration
              </label>
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full px-3 py-1.5 text-sm border border-border rounded-md bg-white text-textPrimary focus:outline-none focus:ring-2 focus:ring-cyan-500"
              >
                {[2, 3, 4].map((weeks) => (
                  <option key={weeks} value={weeks}>
                    {weeks} {weeks === 1 ? 'week' : 'weeks'}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleStartSprint}
              disabled={isLoading}
              className={`w-full px-4 py-2 text-sm font-medium text-white rounded-md transition-all ${
                isLoading
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-cyan-600 hover:bg-cyan-700 shadow-sm'
              }`}
            >
              {isLoading ? 'Starting...' : 'Start Sprint'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// Active Sprint Display Component
interface ActiveSprintDisplayProps {
  lead: Lead;
  filledSlots: number;
  maxSlots: number;
  daysRemaining: number | null;
  onManage: () => void;
}

const ActiveSprintDisplay: React.FC<ActiveSprintDisplayProps> = ({
  lead,
  filledSlots,
  maxSlots,
  daysRemaining,
  onManage,
}) => {
  return (
    <div className="flex items-center gap-3">
      <span className="px-3 py-1.5 text-xs font-medium text-white bg-cyan-600 rounded-md shadow-sm">
        Sprint Active
      </span>
      <div className="text-xs text-textSecondary">
        {filledSlots}/{maxSlots} slots filled
        {daysRemaining !== null && ` • ${daysRemaining} days remaining`}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onManage();
        }}
        className="px-3 py-1.5 text-xs font-medium text-white bg-purple-600 hover:bg-purple-700 rounded-md transition-colors shadow-sm"
      >
        Manage
      </button>
    </div>
  );
};

export default function ScoutDashboard() {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<LeadsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "cluster">("list");
  const [statusFilter, setStatusFilter] = useState<"all" | "ready-to-pitch" | "active-projects">("all");
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [legendExpanded, setLegendExpanded] = useState(false);
  const [reviewLead, setReviewLead] = useState<Lead | null>(null);
  const [reviewScores, setReviewScores] = useState<{ [userId: string]: { qualityScore: number; reviewNotes: string } }>({});
  const [reviewLoading, setReviewLoading] = useState(false);
  const [viewTab, setViewTab] = useState<"discovery" | "live-sprints">("discovery");
  const [sprintLoadingStates, setSprintLoadingStates] = useState<Set<string>>(new Set());
  const [finalistComparisonLead, setFinalistComparisonLead] = useState<Lead | null>(null);
  const [finalistScores, setFinalistScores] = useState<{ [userId: string]: { qualityScore: number; scoutReviewScore: number } }>({});
  const [showWinnerConfirm, setShowWinnerConfirm] = useState(false);
  const [winnerConfirmLoading, setWinnerConfirmLoading] = useState(false);
  const [sprintFilter, setSprintFilter] = useState<"all" | "urgent" | "finalist" | "needs-review">("all");
  const [sortByHFI, setSortByHFI] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'pause' | 'extend' | 'evict';
    data?: any;
    callback?: () => void;
  } | null>(null);

  // Route protection: Check if user is authenticated and has scout role
  useEffect(() => {
    if (!isAuthenticated || !user || user.role !== 'scout') {
      router.push('/');
    }
  }, [isAuthenticated, user, router]);

  const fetchLeads = () => {
    fetch("http://localhost:3001/api/leads")
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
        // Update selectedLead if it's still open
        if (selectedLead) {
          const updatedLead = data.leads.find((l: Lead) => l.id === selectedLead.id);
          if (updatedLead) {
            setSelectedLead(updatedLead);
          }
        }
      })
      .catch((err) => {
        console.error("Failed to fetch leads:", err);
        setLoading(false);
      });
  };

  // Handler for pause/resume sprint
  const handlePauseSprint = (leadId: string, isPaused: boolean) => {
    setConfirmAction({
      type: 'pause',
      data: { isPaused },
      callback: async () => {
        try {
          const response = await fetch(`http://localhost:3001/api/leads/${leadId}/pause-sprint`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              isPaused,
              scoutName: user?.name || 'Scout Maria'
            })
          });
          
          if (response.ok) {
            fetchLeads();
          } else {
            console.error('Failed to pause sprint');
          }
        } catch (error) {
          console.error('Failed to pause sprint:', error);
        }
      }
    });
    setShowConfirmModal(true);
  };

  // Handler for extend deadline
  const handleExtendDeadline = (leadId: string, days: number) => {
    setConfirmAction({
      type: 'extend',
      data: { days },
      callback: async () => {
        try {
          const response = await fetch(`http://localhost:3001/api/leads/${leadId}/extend-deadline`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
              days,
              scoutName: user?.name || 'Scout Maria'
            })
          });
          
          if (response.ok) {
            fetchLeads();
          } else {
            console.error('Failed to extend deadline');
          }
        } catch (error) {
          console.error('Failed to extend deadline:', error);
        }
      }
    });
    setShowConfirmModal(true);
  };

  // Handler for evict builder
  const handleEvictBuilder = async (leadId: string, builderId: string) => {
    try {
      const response = await fetch(`http://localhost:3001/api/leads/${leadId}/evict-builder/${builderId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          scoutName: user?.name || 'Scout Maria',
          reason: 'Inactivity'
        })
      });
      
      if (response.ok) {
        fetchLeads();
      } else {
        console.error('Failed to evict builder');
      }
    } catch (error) {
      console.error('Failed to evict builder:', error);
    }
  };

  useEffect(() => {
    fetchLeads();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh every 10 seconds for Live Sprints view
  useEffect(() => {
    if (viewTab === "live-sprints") {
      const interval = setInterval(() => {
        fetchLeads();
      }, 10000); // 10 seconds
      return () => clearInterval(interval);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewTab]);

  // Auto-open Finalist Comparison modal when conditions are met
  useEffect(() => {
    if (!data || !data.leads || finalistComparisonLead) return;
    
    // Find leads that meet the criteria for finalist comparison
    const eligibleLeads = data.leads.filter(lead => {
      if (!lead.firstCompletionAt) return false;
      if (lead.submissionWindowOpen !== false) return false;
      if (lead.winnerUserId) return false; // Already has a winner
      
      const finalists = lead.activeBuilders?.filter(b => b.checkpointsCompleted >= 4) || [];
      if (finalists.length < 2) return false; // Need at least 2 finalists
      
      // Check if 48 hours have passed since first completion
      const firstCompletionTime = new Date(lead.firstCompletionAt).getTime();
      const now = new Date().getTime();
      const hoursSinceFirstCompletion = (now - firstCompletionTime) / (1000 * 60 * 60);
      
      return hoursSinceFirstCompletion >= 48;
    });
    
    // Auto-open modal for the first eligible lead
    if (eligibleLeads.length > 0) {
      const leadToOpen = eligibleLeads[0];
      setFinalistComparisonLead(leadToOpen);
      // Initialize scores from existing scout reviews
      const initialScores: { [userId: string]: { qualityScore: number; scoutReviewScore: number } } = {};
      if (leadToOpen.activeBuilders) {
        leadToOpen.activeBuilders.forEach(builder => {
          if (builder.checkpointsCompleted >= 4) {
            initialScores[builder.userId] = {
              qualityScore: builder.scoutReview?.qualityScore ?? 0,
              scoutReviewScore: builder.scoutReview?.scoutReviewScore ?? builder.scoutReview?.qualityScore ?? 0
            };
          }
        });
      }
      setFinalistScores(initialScores);
    }
  }, [data, finalistComparisonLead]);

  // Show loading/redirect if not authorized
  if (!isAuthenticated || !user || user.role !== 'scout') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textPrimary text-xl font-light">Redirecting...</div>
      </div>
    );
  }

  // Check if a builder is already active on another project
  const isBuilderActiveElsewhere = (builderId: string, currentLeadId: string, allLeads: Lead[]): boolean => {
    return allLeads.some(lead => 
      lead.id !== currentLeadId &&
      lead.activeBuilders &&
      lead.activeBuilders.some(b => b.userId === builderId)
    );
  };

  // Get the project a builder is currently working on
  const getBuilderActiveProject = (builderId: string, allLeads: Lead[]): Lead | null => {
    return allLeads.find(lead => 
      lead.activeBuilders &&
      lead.activeBuilders.some(b => b.userId === builderId)
    ) || null;
  };

  // Check if user is currently building this project (for display purposes)
  const isUserCurrentlyBuilding = (lead: Lead, userId: string): boolean => {
    return lead.activeBuilders?.some(b => b.userId === userId) || false;
  };

  // Filter leads based on status filter
  const filterLeadsByStatus = (leads: Lead[]) => {
    if (statusFilter === "all") return leads;
    
    if (statusFilter === "ready-to-pitch") {
      return leads.filter(lead => {
        // AI-approved statuses
        const isApproved = lead.status.toLowerCase() === "qualified" || 
                          lead.status.toLowerCase() === "ready" ||
                          lead.status.toLowerCase() === "briefed"; // Support legacy status
        
        // No active sprint (no builders assigned yet)
        const noActiveSprint = !lead.activeBuilders || lead.activeBuilders.length === 0;
        
        // Show only approved leads without active sprints (ready to launch)
        return isApproved && noActiveSprint;
      });
    }
    
    if (statusFilter === "active-projects") {
      // Only show projects with active builders (sprint is running)
      return leads.filter(lead => 
        lead.activeBuilders && lead.activeBuilders.length > 0
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

  const getHFIBadge = (score: number, showInfoIcon: boolean = false) => {
    const badge = (className: string) => (
      <span className={`${className} inline-flex items-center gap-1.5`}>
        <span>{score}</span>
        {showInfoIcon && (
          <span 
            className="inline-flex items-center justify-center w-4 h-4 text-xs rounded-full bg-slate-200 text-slate-600 cursor-help group relative"
            title="HFI Signal: AI-generated estimate of technical friction based on sample review data. Intended for institutional scouting purposes only."
          >
            ⓘ
            <span className="absolute left-full ml-2 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal">
              HFI Signal: AI-generated estimate of technical friction based on sample review data. Intended for institutional scouting purposes only.
            </span>
          </span>
        )}
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
      briefed: "badge-status-ready", // Legacy support
      ready: "badge-status-ready",
      engaged: "badge-status-engaged",
      nurture: "badge-status-nurture",
      matched: "badge-status-evaluating", // Legacy support
      evaluating: "badge-status-evaluating",
      "in-build": "badge-status-sprinting", // Legacy support
      sprinting: "badge-status-sprinting",
      live: "badge-status-live",
    };
    
    // Map status to display text
    const statusDisplayMap: { [key: string]: string } = {
      briefed: "Ready",
      ready: "Ready",
      "in-build": "Sprinting",
      sprinting: "Sprinting",
      matched: "Evaluating",
      evaluating: "Evaluating",
    };
    
    const displayText = statusDisplayMap[status.toLowerCase()] || 
      (status.charAt(0).toUpperCase() + status.slice(1).toLowerCase());
    
    return (
      <span className={statusMap[status.toLowerCase()] || "badge-status-unqualified"}>
        {displayText}
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

  // Get progress color based on completion percentage (for Live Sprints)
  const getProgressColor = (completed: number, total: number): string => {
    const percentage = total > 0 ? (completed / total) * 100 : 0;
    if (percentage <= 25) {
      // Early stage: orange gradient
      return 'bg-gradient-to-r from-orange-500 to-orange-600';
    } else if (percentage <= 50) {
      // Mid-progress: yellow/amber gradient
      return 'bg-gradient-to-r from-yellow-500 to-amber-500';
    } else if (percentage <= 75) {
      // Good progress: cyan/blue gradient
      return 'bg-gradient-to-r from-cyan-500 to-blue-500';
    } else {
      // Near completion: green gradient
      return 'bg-gradient-to-r from-green-500 to-green-600';
    }
  };

  // Nudge indicator functions
  const hasRecentNudge = (builder: any): boolean => {
    if (!builder.last_nudged_at) return false;
    
    const lastNudge = new Date(builder.last_nudged_at);
    const now = new Date();
    const hoursSinceNudge = (now.getTime() - lastNudge.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceNudge <= 72;
  };

  const isStalled = (builder: any): boolean => {
    if (!builder.last_checkpoint_update) return false;
    
    const lastUpdate = new Date(builder.last_checkpoint_update);
    const now = new Date();
    const hoursSinceUpdate = (now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceUpdate >= 72 && builder.checkpointsCompleted < 4;
  };

  const getTimeSince = (timestamp: string | null): string => {
    if (!timestamp) return 'unknown';
    
    const date = new Date(timestamp);
    const now = new Date();
    const hours = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60));
    
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
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

  // Deterministically select a badge variant based on lead ID or business name
  const selectBadgeVariant = (variants: string[], seed: string): string => {
    // Simple hash function to convert seed string to number
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Use absolute value and modulo to select variant
    const index = Math.abs(hash) % variants.length;
    return variants[index];
  };

  // Map friction type to tech stack suggestions with varied badges
  const getTechStackTag = (frictionType: string, leadId?: string, businessName?: string): string | null => {
    const frictionLower = frictionType.toLowerCase();
    // Use lead ID if available, otherwise fall back to business name, then friction type
    const seed = leadId || businessName || frictionType;
    
    // Phone intake issues
    if (frictionLower.includes("phone intake") || frictionLower.includes("phone")) {
      const variants = [
        "AI Voice Integration",
        "Twilio Automation Stack",
        "Call Queue System"
      ];
      return selectBadgeVariant(variants, seed);
    }
    
    // Booking/Reservation systems
    if (frictionLower.includes("booking") || 
        frictionLower.includes("reservation") || 
        frictionLower.includes("waitlist") ||
        frictionLower.includes("wait time")) {
      const variants = [
        "PERN Stack Opportunity",
        "PostgreSQL Heavy",
        "Real-time Booking System"
      ];
      return selectBadgeVariant(variants, seed);
    }
    
    // Inventory/Supply Chain
    if (frictionLower.includes("inventory management") || 
        frictionLower.includes("supply chain") ||
        frictionLower.includes("inventory")) {
      const variants = [
        "Supply Chain Optimizer",
        "PostgreSQL Analytics Stack",
        "Inventory Intelligence System"
      ];
      return selectBadgeVariant(variants, seed);
    }
    
    // Delivery Logistics
    if (frictionLower.includes("delivery logistics") ||
        (frictionLower.includes("delivery") && !frictionLower.includes("order tracking"))) {
      const variants = [
        "3PL Aggregator",
        "Express Middleware Hub",
        "Multi-API Integration"
      ];
      return selectBadgeVariant(variants, seed);
    }
    
    // Loyalty CRM System
    if (frictionLower.includes("loyalty program") || 
        frictionLower.includes("loyalty") ||
        frictionLower.includes("crm")) {
      const variants = [
        "Loyalty CRM System",
        "Customer Database Platform",
        "Auth + Rewards Engine"
      ];
      return selectBadgeVariant(variants, seed);
    }
    
    // Logistics/Tracking issues -> Automation Pipeline
    if (frictionLower.includes("tracking") || 
        frictionLower.includes("logistics") || 
        frictionLower.includes("order management")) {
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
    
    // Supply Chain Optimizer (Back of House)
    if (frictionLower.includes("inventory management") || 
        frictionLower.includes("supply chain") ||
        frictionLower.includes("inventory")) {
      return [
        "PostgreSQL Inventory DB",
        "Charts.js Analytics Dashboard",
        "Node-Cron Automated Alerts",
        "Low-Stock Notification API"
      ];
    }
    
    // 3PL Aggregator / Delivery Hub (Back of House)
    if (frictionLower.includes("delivery logistics")) {
      return [
        "Express API Middleware",
        "Multi-3PL Webhooks Integration",
        "Real-time Delivery Tracking",
        "Route Optimization API"
      ];
    }
    
    // Loyalty CRM System (Back of House)
    if (frictionLower.includes("loyalty program") || 
        frictionLower.includes("loyalty") ||
        frictionLower.includes("crm")) {
      return [
        "Auth System (JWT)",
        "PostgreSQL Customer DB",
        "Points/Rewards Engine",
        "SMS Notification Service"
      ];
    }
    
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

  // Handle opening review modal
  const handleOpenReview = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    setReviewLead(lead);
    // Initialize review scores from existing scout reviews
    const initialScores: { [userId: string]: { qualityScore: number; reviewNotes: string } } = {};
    if (lead.activeBuilders) {
      lead.activeBuilders.forEach(builder => {
        if (builder.scoutReview) {
          initialScores[builder.userId] = {
            qualityScore: builder.scoutReview.qualityScore,
            reviewNotes: builder.scoutReview.reviewNotes || ''
          };
        } else {
          initialScores[builder.userId] = {
            qualityScore: 0,
            reviewNotes: ''
          };
        }
      });
    }
    setReviewScores(initialScores);
  };

  // Update quality score for a builder
  const updateQualityScore = (userId: string, score: number) => {
    setReviewScores({
      ...reviewScores,
      [userId]: {
        ...reviewScores[userId],
        qualityScore: score,
        reviewNotes: reviewScores[userId]?.reviewNotes || ''
      }
    });
  };

  // Handle submitting scout review (single builder)
  const handleSubmitReview = async (userId: string) => {
    if (!reviewLead) return;
    
    const review = reviewScores[userId];
    if (!review || review.qualityScore === 0) {
      alert('Please assign a quality score (1-100)');
      return;
    }

    setReviewLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/leads/${reviewLead.id}/scout-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          qualityScore: review.qualityScore,
          reviewNotes: review.reviewNotes || ''
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit review');
      }

      const result = await response.json();
      
      // Refresh data
      const leadsResponse = await fetch("http://localhost:3001/api/leads");
      const leadsData = await leadsResponse.json();
      setData(leadsData);
      
      // Update review lead if still open
      if (result.lead) {
        setReviewLead(result.lead);
      }
      
      alert('Review submitted successfully!');
    } catch (error: any) {
      console.error('Error submitting review:', error);
      alert(error.message || 'Failed to submit review. Please try again.');
    } finally {
      setReviewLoading(false);
    }
  };

  // Save all reviews at once
  const saveAllReviews = async () => {
    if (!reviewLead || !reviewLead.activeBuilders) return;

    const buildersToReview = reviewLead.activeBuilders.filter(builder => {
      const review = reviewScores[builder.userId];
      return review && review.qualityScore > 0;
    });

    if (buildersToReview.length === 0) {
      alert('Please assign quality scores to at least one builder.');
      return;
    }

    setReviewLoading(true);
    try {
      // Submit all reviews sequentially
      for (const builder of buildersToReview) {
        const review = reviewScores[builder.userId];
        if (review && review.qualityScore > 0) {
          // Check if already reviewed and score hasn't changed
          if (builder.scoutReview && builder.scoutReview.qualityScore === review.qualityScore) {
            continue; // Skip if unchanged
          }

          const response = await fetch(`http://localhost:3001/api/leads/${reviewLead.id}/scout-review`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              userId: builder.userId,
              qualityScore: review.qualityScore,
              reviewNotes: review.reviewNotes || ''
            }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || `Failed to submit review for ${builder.name}`);
          }
        }
      }

      // Refresh data
      const leadsResponse = await fetch("http://localhost:3001/api/leads");
      const leadsData = await leadsResponse.json();
      setData(leadsData);
      
      // Update review lead
      const updatedLead = leadsData.leads?.find((l: Lead) => l.id === reviewLead.id);
      if (updatedLead) {
        setReviewLead(updatedLead);
      }
      
      alert(`Successfully saved ${buildersToReview.length} review(s)!`);
    } catch (error: any) {
      console.error('Error saving reviews:', error);
      alert(error.message || 'Failed to save reviews. Please try again.');
    } finally {
      setReviewLoading(false);
    }
  };

  // Close the audit console
  const closeConsole = () => {
    setReviewLead(null);
    setReviewScores({});
  };

  // Handle finalizing winner
  const handleFinalizeWinner = async () => {
    if (!reviewLead) return;

    // Check if all builders have reviews
    const finalists = reviewLead.activeBuilders?.filter(b => b.checkpointsCompleted >= 4) || [];
    const allReviewed = finalists.every(b => {
      const review = reviewScores[b.userId];
      return review && review.qualityScore > 0;
    });

    if (!allReviewed) {
      alert('Please review all builders before finalizing winner.');
      return;
    }

    // Submit all remaining reviews first
    for (const builder of finalists) {
      const review = reviewScores[builder.userId];
      if (review && review.qualityScore > 0) {
        // Check if already reviewed
        if (!builder.scoutReview || builder.scoutReview.qualityScore !== review.qualityScore) {
          await handleSubmitReview(builder.userId);
        }
      }
    }

    setReviewLoading(true);
    try {
      const response = await fetch(`http://localhost:3001/api/leads/${reviewLead.id}/calculate-winner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to calculate winner');
      }

      const result = await response.json();
      
      // Refresh data
      const leadsResponse = await fetch("http://localhost:3001/api/leads");
      const leadsData = await leadsResponse.json();
      setData(leadsData);
      
      alert(`Winner determined: ${result.winner.name}`);
      setReviewLead(null);
      setReviewScores({});
    } catch (error: any) {
      console.error('Error finalizing winner:', error);
      alert(error.message || 'Failed to finalize winner. Please try again.');
    } finally {
      setReviewLoading(false);
    }
  };

  // Check if lead has active sprint
  const hasActiveSprint = (lead: Lead): boolean => {
    return lead.sprintActive === true || !!(lead.activeBuilders && lead.activeBuilders.length > 0);
  };

  // Handle launching a sprint
  const handleLaunchSprint = async (lead: Lead, maxSlots: number, sprintDuration: number, e: React.MouseEvent) => {
    e.stopPropagation();
    
    setSprintLoadingStates((prev) => new Set(prev).add(lead.id));
    
    try {
      const response = await fetch(`http://localhost:3001/api/leads/${lead.id}/launch-sprint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxSlots,
          sprintDuration,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to launch sprint');
      }

      const updatedLead = await response.json();
      
      // Refresh data
      const leadsResponse = await fetch("http://localhost:3001/api/leads");
      const leadsData = await leadsResponse.json();
      setData(leadsData);
      
      alert('Sprint launched successfully!');
    } catch (error: any) {
      console.error('Error launching sprint:', error);
      alert(error.message || 'Failed to launch sprint. Please try again.');
    } finally {
      setSprintLoadingStates((prev) => {
        const newSet = new Set(prev);
        newSet.delete(lead.id);
        return newSet;
      });
    }
  };

  // Calculate days remaining in sprint
  const getDaysRemaining = (lead: Lead): number | null => {
    if (!lead.sprintStartedAt || !lead.sprintDuration) return null;
    const startDate = new Date(lead.sprintStartedAt);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + (lead.sprintDuration * 7));
    const now = new Date();
    const diffTime = endDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays);
  };

  // Check if submission window is closed
  const isSubmissionWindowClosed = (lead: Lead): boolean => {
    if (!lead.firstCompletionAt) return false;
    const firstCompletionTime = new Date(lead.firstCompletionAt).getTime();
    const now = new Date().getTime();
    const hoursSinceFirstCompletion = (now - firstCompletionTime) / (1000 * 60 * 60);
    return hoursSinceFirstCompletion > 48 || lead.submissionWindowOpen === false;
  };

  // Check if Review Sprint button should show (all finalists completed + window closed)
  const canReviewSprint = (lead: Lead): boolean => {
    if (!lead.activeBuilders || lead.activeBuilders.length === 0) return false;
    const finalists = lead.activeBuilders.filter(b => b.checkpointsCompleted >= 4);
    if (finalists.length === 0) return false;
    // Check if all finalists have completed all checkpoints
    const allCompleted = finalists.every(b => b.checkpointsCompleted >= 4);
    return allCompleted && isSubmissionWindowClosed(lead) && !lead.winnerUserId;
  };

  // Calculate pace score for a builder
  const calculatePaceScore = (builder: ActiveBuilder, firstCompletionAt: string | null | undefined): number => {
    if (!firstCompletionAt) return 100; // If no first completion, assume perfect pace
    const joinedTime = new Date(builder.joinedAt).getTime();
    const firstCompletionTime = new Date(firstCompletionAt).getTime();
    const completionTime = joinedTime + (builder.checkpointsCompleted * 24 * 60 * 60 * 1000);
    const timeDifference = completionTime - firstCompletionTime;
    const hoursDifference = timeDifference / (1000 * 60 * 60);
    // Pace score: 100 if completed at same time, decreases by 2 points per hour after first
    return Math.max(4, 100 - (Math.abs(hoursDifference) * 2));
  };

  // Calculate total score for a builder
  const calculateTotalScore = (
    paceScore: number,
    qualityScore: number,
    scoutReviewScore: number
  ): number => {
    return (paceScore * 0.3) + (qualityScore * 0.5) + (scoutReviewScore * 0.2);
  };

  // Get finalists with calculated scores
  const getFinalistsWithScores = (lead: Lead) => {
    if (!lead.activeBuilders) return [];
    const finalists = lead.activeBuilders.filter(b => b.checkpointsCompleted >= 4);
    
    return finalists.map(builder => {
      const paceScore = calculatePaceScore(builder, lead.firstCompletionAt);
      const qualityScore = finalistScores[builder.userId]?.qualityScore ?? builder.scoutReview?.qualityScore ?? 0;
      const scoutReviewScore = finalistScores[builder.userId]?.scoutReviewScore ?? builder.scoutReview?.scoutReviewScore ?? builder.scoutReview?.qualityScore ?? 0;
      const totalScore = calculateTotalScore(paceScore, qualityScore, scoutReviewScore);
      
      return {
        ...builder,
        scores: {
          pace: Math.round(paceScore * 100) / 100,
          quality: Math.round(qualityScore * 100) / 100,
          scoutReview: Math.round(scoutReviewScore * 100) / 100,
          total: Math.round(totalScore * 100) / 100
        }
      };
    }).sort((a, b) => b.scores.total - a.scores.total);
  };

  // Handle opening finalist comparison modal
  const handleOpenFinalistComparison = (lead: Lead, e: React.MouseEvent) => {
    e.stopPropagation();
    setFinalistComparisonLead(lead);
    // Initialize scores from existing scout reviews
    const initialScores: { [userId: string]: { qualityScore: number; scoutReviewScore: number } } = {};
    if (lead.activeBuilders) {
      lead.activeBuilders.forEach(builder => {
        if (builder.checkpointsCompleted >= 4) {
          initialScores[builder.userId] = {
            qualityScore: builder.scoutReview?.qualityScore ?? 0,
            scoutReviewScore: builder.scoutReview?.scoutReviewScore ?? builder.scoutReview?.qualityScore ?? 0
          };
        }
      });
    }
    setFinalistScores(initialScores);
  };

  // Handle confirming winner
  const handleConfirmWinner = async () => {
    if (!finalistComparisonLead) return;

    // First, submit all score updates
    setWinnerConfirmLoading(true);
    try {
          // Submit quality and scout review scores for each finalist
      for (const builder of finalistComparisonLead.activeBuilders || []) {
        if (builder.checkpointsCompleted >= 4) {
          const scores = finalistScores[builder.userId];
          if (scores && (scores.qualityScore !== builder.scoutReview?.qualityScore || scores.scoutReviewScore !== (builder.scoutReview?.scoutReviewScore ?? builder.scoutReview?.qualityScore))) {
            // Update via scout-review endpoint with both scores
            await fetch(`http://localhost:3001/api/leads/${finalistComparisonLead.id}/scout-review`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                userId: builder.userId,
                qualityScore: scores.qualityScore,
                scoutReviewScore: scores.scoutReviewScore,
                reviewNotes: builder.scoutReview?.reviewNotes || ''
              }),
            });
          }
        }
      }

      // Calculate and set winner
      const response = await fetch(`http://localhost:3001/api/leads/${finalistComparisonLead.id}/calculate-winner`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to calculate winner');
      }

      const result = await response.json();
      
      // Refresh data
      fetchLeads();
      
      alert(`Winner confirmed: ${result.winner.name}. They now have Right to Outreach.`);
      setFinalistComparisonLead(null);
      setFinalistScores({});
      setShowWinnerConfirm(false);
    } catch (error: any) {
      console.error('Error confirming winner:', error);
      alert(error.message || 'Failed to confirm winner. Please try again.');
    } finally {
      setWinnerConfirmLoading(false);
    }
  };

  // Calculate sprint days remaining
  const getSprintDaysRemaining = (lead: Lead): number | null => {
    if (!lead.activeBuilders || lead.activeBuilders.length === 0) return null;
    
    // If firstCompletionAt exists, calculate time remaining from submission window
    if (lead.firstCompletionAt) {
      const submissionWindowDays = 7; // 7 days after first completion
      const firstCompletion = new Date(lead.firstCompletionAt).getTime();
      const submissionEndDate = firstCompletion + (submissionWindowDays * 24 * 60 * 60 * 1000);
      const now = new Date().getTime();
      const daysRemaining = Math.ceil((submissionEndDate - now) / (1000 * 60 * 60 * 24));
      return Math.max(0, daysRemaining);
    }
    
    // Otherwise, use sprint duration (typically 28 days from earliest join)
    const sprintDurationDays = 28;
    const earliestJoin = Math.min(
      ...lead.activeBuilders.map(b => new Date(b.joinedAt).getTime())
    );
    const sprintEndDate = earliestJoin + (sprintDurationDays * 24 * 60 * 60 * 1000);
    const now = new Date().getTime();
    const daysRemaining = Math.ceil((sprintEndDate - now) / (1000 * 60 * 60 * 24));
    
    return Math.max(0, daysRemaining);
  };

  // Get latest proof link timestamp for a builder
  const getLatestProofTimestamp = (builder: ActiveBuilder): string | null => {
    if (!builder.proofLinks || builder.proofLinks.length === 0) return null;
    // In a real implementation, this would come from the API
    // For now, we'll use a relative time based on checkpoints
    const now = new Date();
    const hoursAgo = 4 - builder.checkpointsCompleted; // More recent for higher checkpoints
    const timestamp = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000);
    return timestamp.toISOString();
  };

  // Format relative time
  const formatRelativeTime = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return "Just now";
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
  };

  // Get checkpoint progress bar color based on completion (cyan/blue palette)
  const getCheckpointProgressColor = (checkpointsCompleted: number, builderIndex: number): string => {
    const percentage = (checkpointsCompleted / 4) * 100;
    if (percentage === 0) return "bg-gray-300";
    
    // Different cyan/blue colors per builder
    const colors = [
      "bg-cyan-500",
      "bg-blue-500", 
      "bg-cyan-600",
      "bg-blue-600",
      "bg-sky-500",
      "bg-teal-500"
    ];
    const colorIndex = builderIndex % colors.length;
    
    return colors[colorIndex];
  };

  // Check if lead has pending checkpoints for review
  const hasPendingCheckpoints = (lead: Lead): boolean => {
    if (!lead.activeBuilders) return false;
    
    return lead.activeBuilders.some(builder => {
      if (!builder.checkpointStatuses) return false;
      return Object.values(builder.checkpointStatuses).some(
        (status: any) => status.status === "submitted"
      );
    });
  };

  // Get the latest submission timestamp from a lead's checkpoint statuses
  const getLatestSubmissionTimestamp = (lead: Lead): number | null => {
    if (!lead.activeBuilders) return null;
    
    let latestTimestamp: number | null = null;
    
    lead.activeBuilders.forEach(builder => {
      if (!builder.checkpointStatuses) return;
      
      Object.values(builder.checkpointStatuses).forEach((status: any) => {
        if (status.status === "submitted" && status.submittedAt) {
          const timestamp = new Date(status.submittedAt).getTime();
          if (latestTimestamp === null || timestamp > latestTimestamp) {
            latestTimestamp = timestamp;
          }
        }
      });
    });
    
    return latestTimestamp;
  };

  // Get leader (builder with most checkpoints completed)
  const getLeader = (builders: ActiveBuilder[]): ActiveBuilder | null => {
    if (builders.length === 0) return null;
    return builders.reduce((prev, current) => 
      current.checkpointsCompleted > prev.checkpointsCompleted ? current : prev
    );
  };

  // Get builder initials for avatar
  const getBuilderInitials = (name: string): string => {
    if (!name || typeof name !== 'string') {
      return '??';
    }
    
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Get compact tech tag (e.g., "#PERN", "#API", "#Supply-Chain")
  const getCompactTechTag = (frictionType: string, leadId?: string, businessName?: string): string | null => {
    const techTag = getTechStackTag(frictionType, leadId, businessName);
    if (!techTag) return null;
    
    // Map full tech tags to compact versions
    const compactMap: { [key: string]: string } = {
      "PERN Stack Opportunity": "#PERN",
      "PostgreSQL Heavy": "#PERN",
      "Real-time Booking System": "#API",
      "Supply Chain Optimizer": "#Supply-Chain",
      "PostgreSQL Analytics Stack": "#PERN",
      "Inventory Intelligence System": "#Supply-Chain",
      "3PL Aggregator": "#API",
      "Express Middleware Hub": "#API",
      "Multi-API Integration": "#API",
      "Loyalty CRM System": "#PERN",
      "Customer Database Platform": "#PERN",
      "Auth + Rewards Engine": "#PERN",
      "Automation Pipeline": "#API",
      "React + Node API": "#PERN",
      "AI Voice Integration": "#API",
      "Twilio Automation Stack": "#API",
      "Call Queue System": "#API"
    };
    
    return compactMap[techTag] || "#PERN";
  };

  // Get capacity indicator badge
  const getCapacityBadge = (filledSlots: number, maxSlots: number): JSX.Element => {
    const isFull = filledSlots >= maxSlots;
    const bgColor = isFull ? "bg-red-600" : filledSlots >= maxSlots * 0.75 ? "bg-orange-500" : "bg-slate-600";
    const text = isFull ? `FULL ${filledSlots}/${maxSlots}` : `${filledSlots}/${maxSlots} Active`;
    
    return (
      <span className={`${bgColor} text-white text-xs font-semibold px-2 py-1 rounded-md`}>
        {text}
      </span>
    );
  };

  // Filter for urgent sprints (< 5 days remaining)
  const isUrgent = (lead: Lead): boolean => {
    const daysRemaining = getSprintDaysRemaining(lead);
    return daysRemaining !== null && daysRemaining < 5;
  };

  // Filter for finalist phase (at least one builder at 100%)
  const isFinalistPhase = (lead: Lead): boolean => {
    const totalCheckpoints = lead.milestones?.length || 4;
    return lead.activeBuilders?.some(b => b.checkpointsCompleted >= totalCheckpoints) || false;
  };

  // Filter for needs review (has pending checkpoint submissions)
  const needsReview = (lead: Lead): boolean => {
    return hasPendingCheckpoints(lead);
  };

  // Apply filters and sorting
  const filterSprints = (leads: Lead[]): Lead[] => {
    let filtered = leads.filter(lead => lead.activeBuilders && lead.activeBuilders.length > 0);
    
    if (sprintFilter === "urgent") {
      filtered = filtered.filter(isUrgent);
    } else if (sprintFilter === "finalist") {
      filtered = filtered.filter(isFinalistPhase);
    } else if (sprintFilter === "needs-review") {
      filtered = filtered.filter(needsReview);
    }
    
    // Sort by HFI if toggled
    if (sortByHFI) {
      filtered = filtered.sort((a, b) => b.hfi_score - a.hfi_score);
    }
    
    return filtered;
  };

  // Filter and sort active sprints
  const getActiveSprints = (): Lead[] => {
    if (!data) return [];
    
    // Get base filtered list
    let filtered = filterSprints(data.leads);
    
    // Apply default sorting if HFI sort is not enabled
    if (!sortByHFI) {
      filtered = filtered.sort((a, b) => {
        // Priority 1: Leads with pending submissions appear first
        const aPending = hasPendingCheckpoints(a);
        const bPending = hasPendingCheckpoints(b);
        
        if (aPending && !bPending) return -1;
        if (!aPending && bPending) return 1;
        
        // Priority 2: If both have pending submissions, sort by most recent submission time
        if (aPending && bPending) {
          const aTimestamp = getLatestSubmissionTimestamp(a);
          const bTimestamp = getLatestSubmissionTimestamp(b);
          
          // Handle null cases (shouldn't happen if hasPendingCheckpoints is true, but safe check)
          if (aTimestamp === null && bTimestamp === null) {
            // Fall through to next sorting criteria
          } else if (aTimestamp === null) return 1; // Put nulls after
          else if (bTimestamp === null) return -1;
          else {
            // Most recent first (higher timestamp = more recent)
            const timestampDiff = bTimestamp - aTimestamp;
            if (timestampDiff !== 0) return timestampDiff;
          }
        }
        
        // Priority 3: Sort by most active first (most builders)
        const builderDiff = (b.activeBuilders?.length || 0) - (a.activeBuilders?.length || 0);
        if (builderDiff !== 0) return builderDiff;
        
        // Priority 4: Then by urgency (closest deadline first)
        const daysA = getSprintDaysRemaining(a);
        const daysB = getSprintDaysRemaining(b);
        
        // Handle null cases (no deadline)
        if (daysA === null && daysB === null) return 0;
        if (daysA === null) return 1; // Put nulls at end
        if (daysB === null) return -1;
        
        return daysA - daysB; // Closest deadline first
      });
    }
    
    return filtered;
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
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="text-base font-semibold text-textPrimary">Hospitality Vertical</div>
                <div className="text-sm text-textSecondary">{user?.name}</div>
              </div>
              <button
                onClick={() => {
                  logout();
                  router.push('/');
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-slate-600 hover:bg-slate-700 rounded-md transition-colors"
              >
                Logout
              </button>
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
                <span className={`text-textPrimary text-base ${item.count >= 5 ? 'font-bold' : 'font-semibold'}`} style={item.count >= 5 ? { fontWeight: 700 } : {}}>{item.neighborhood}</span>
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

        {/* Tab Navigation */}
        <div className="mb-6">
          <div className="flex items-center gap-3 bg-card border border-border rounded-lg p-1">
            <button
              onClick={() => setViewTab("discovery")}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                viewTab === "discovery"
                  ? "bg-slate-600 text-white"
                  : "text-textSecondary hover:text-textPrimary hover:bg-gray-100"
              }`}
            >
              Market Discovery
            </button>
            <button
              onClick={() => setViewTab("live-sprints")}
              className={`px-6 py-2 rounded-md text-sm font-medium transition-colors ${
                viewTab === "live-sprints"
                  ? "bg-slate-600 text-white"
                  : "text-textSecondary hover:text-textPrimary hover:bg-gray-100"
              }`}
            >
              Live Sprints
            </button>
          </div>
        </div>

        {/* Status Filter Bar - Only show in Discovery view */}
        {viewTab === "discovery" && (
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
        )}

          {/* Live Sprints View */}
          {viewTab === "live-sprints" && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-semibold">
                    Live Sprints: Active Race Monitoring
                  </h2>
                  <p className="text-textSecondary mt-1 font-normal text-sm">
                    Real-time progress tracking for active sprint races. Auto-refreshes every 10 seconds.
                  </p>
                </div>
              </div>

              {/* Filter Bar */}
              <div className="mb-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between">
                  {/* Filter buttons */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-600 mr-2">Filter:</span>
                    <button
                      onClick={() => setSprintFilter("all")}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                        sprintFilter === "all" ? "bg-cyan-600 text-white" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      All
                    </button>
                    <button
                      onClick={() => setSprintFilter("urgent")}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                        sprintFilter === "urgent" ? "bg-orange-500 text-white" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      Urgent (&lt; 5 days)
                    </button>
                    <button
                      onClick={() => setSprintFilter("finalist")}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                        sprintFilter === "finalist" ? "bg-green-600 text-white" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      Finalist Phase
                    </button>
                    <button
                      onClick={() => setSprintFilter("needs-review")}
                      className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                        sprintFilter === "needs-review" ? "bg-purple-600 text-white" : "bg-white text-slate-600 border border-slate-300 hover:bg-slate-100"
                      }`}
                    >
                      Needs My Review
                    </button>
                  </div>
                  
                  {/* HFI sort toggle */}
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sortByHFI}
                        onChange={(e) => setSortByHFI(e.target.checked)}
                        className="rounded"
                      />
                      <span className="text-sm text-slate-600">Sort by HFI (Highest First)</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Filter Count Display */}
              {(() => {
                const activeSprints = data?.leads.filter(lead => lead.activeBuilders && lead.activeBuilders.length > 0) || [];
                const filteredSprints = getActiveSprints();
                
                return (
                  <div className="text-sm text-slate-600 mb-3">
                    Showing <span className="font-semibold text-cyan-600">{filteredSprints.length}</span> of <span className="font-semibold">{activeSprints.length}</span> Sprints
                  </div>
                );
              })()}

              {getActiveSprints().length === 0 ? (
                <div className="bg-card border border-border rounded-lg p-12 text-center">
                  {(() => {
                    const activeSprints = data?.leads.filter(lead => lead.activeBuilders && lead.activeBuilders.length > 0) || [];
                    if (activeSprints.length === 0) {
                      return (
                        <>
                          <div className="text-textSecondary text-lg mb-2">No active sprints</div>
                          <div className="text-textTertiary text-sm">Sprints will appear here when builders join leads.</div>
                        </>
                      );
                    } else {
                      return (
                        <>
                          <div className="text-textSecondary text-lg mb-2">No sprints match the current filter</div>
                          <div className="text-textTertiary text-sm">
                            {sprintFilter !== "all" && (
                              <button
                                onClick={() => setSprintFilter("all")}
                                className="text-cyan-600 hover:text-cyan-700 underline"
                              >
                                Clear filter
                              </button>
                            )}
                            {sprintFilter === "all" && "Try adjusting your filter settings."}
                          </div>
                        </>
                      );
                    }
                  })()}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {getActiveSprints().map((lead) => {
                    const leader = getLeader(lead.activeBuilders || []);
                    const daysRemaining = getSprintDaysRemaining(lead);
                    const maxSlots = lead.maxSlots || 4;
                    const activeCount = lead.activeBuilders?.length || 0;
                    const hasPending = hasPendingCheckpoints(lead);

                    return (
                      <div
                        key={lead.id}
                        className={`bg-white border border-border rounded-lg p-4 shadow-sm hover:shadow-md transition-all ${lead.isPaused ? 'sprint-paused' : ''}`}
                      >
                        {/* Sprint Header - Compact */}
                        <div className="mb-3">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex-1 min-w-0">
                              <h3 className="text-lg font-semibold text-textPrimary truncate">{lead.business_name}</h3>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                {getHFIBadge(lead.hfi_score)}
                                <span className="text-xs text-textSecondary">
                                  {activeCount}/{maxSlots} Slots Filled
                                </span>
                              </div>
                            </div>
                          </div>
                          
                          {/* Time Remaining */}
                          {daysRemaining !== null && (
                            <div className="text-xs mb-2">
                              {daysRemaining === 0 ? (
                                <span className="text-red-600 font-medium">Deadline today</span>
                              ) : daysRemaining === 1 ? (
                                <span className="text-orange-600 font-medium">1 day remaining</span>
                              ) : (
                                <span className={daysRemaining <= 5 ? 'text-orange-500' : 'text-textSecondary'}>{daysRemaining} days remaining</span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Builder Progress Bars - Compact */}
                        <div className="space-y-2.5">
                          {lead.activeBuilders?.map((builder, builderIndex) => {
                            const isLeading = leader?.userId === builder.userId && builder.checkpointsCompleted > 0;
                            const totalCheckpoints = lead.milestones?.length || 4;
                            const progressPercentage = totalCheckpoints > 0 
                              ? (builder.checkpointsCompleted / totalCheckpoints) * 100 
                              : 0;
                            const progressColorClass = getProgressColor(builder.checkpointsCompleted, totalCheckpoints);
                            const recentNudge = hasRecentNudge(builder);
                            const stalled = isStalled(builder);

                            return (
                              <div key={builder.userId} className="space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <div className="relative flex-shrink-0">
                                      {stalled && (
                                        <div className="absolute -top-1 -right-1 w-3 h-3 bg-orange-500 rounded-full border-2 border-white" 
                                             title="Stalled - No updates in 72+ hours">
                                        </div>
                                      )}
                                    </div>
                                    <span className="text-xs font-medium text-textPrimary truncate flex-1">
                                      {builder.name}: {builder.checkpointsCompleted}/{totalCheckpoints} checkpoints
                                    </span>
                                  </div>
                                  {recentNudge && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full flex-shrink-0"
                                          title={`Nudge sent ${getTimeSince(builder.last_nudged_at)}`}>
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z"/>
                                      </svg>
                                      <span className="hidden sm:inline">Nudge</span>
                                    </span>
                                  )}
                                </div>
                                
                                {/* Progress Bar - Smooth with color-coded fill */}
                                <div className={`relative w-full h-4 bg-gray-200 rounded-full overflow-hidden border border-gray-300 ${lead.isPaused ? 'sprint-paused' : ''}`}>
                                  <div
                                    className={`h-full progress-bar ${progressColorClass} transition-all duration-500 ease-out rounded-full shadow-sm ${lead.isPaused ? 'sprint-paused' : ''}`}
                                    style={{ width: `${progressPercentage}%` }}
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Review Submissions Button - Always visible for active sprints */}
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <button
                            onClick={(e) => handleOpenReview(lead, e)}
                            className="w-full px-3 py-1.5 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-md transition-colors shadow-sm"
                          >
                            Review Submissions
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Market Discovery Section - Only show in Discovery view */}
          {viewTab === "discovery" && (
          <div className="mb-8">
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
                  <option value="ready">Ready</option>
                  <option value="engaged">Engaged</option>
                  <option value="nurture">Nurture</option>
                  <option value="evaluating">Evaluating</option>
                  <option value="sprinting">Sprinting</option>
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
            <div className="grid grid-cols-1 gap-3">
              {filterLeadsByStatus(data.leads)
                .sort((a, b) => b.hfi_score - a.hfi_score)
                .map((lead) => {
                  const leader = getLeader(lead.activeBuilders || []);
                  const filledSlots = lead.activeBuilders?.length || 0;
                  const maxSlots = lead.maxSlots || 4;
                  const isActive = hasActiveSprint(lead);
                  const totalCheckpoints = 4;
                  
                  return (
                    <div
                      key={lead.id}
                      className={`bg-card border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer ${
                        lead.hfi_score >= 80 
                          ? 'border-l-4 border-l-[#00d4ff] border-border hover:border-gray-300' 
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
                      {/* Header Row */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start gap-2.5 flex-1 min-w-0">
                          <input
                            type="checkbox"
                            checked={selectedLeadIds.has(lead.id)}
                            onChange={() => toggleLeadSelection(lead.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                              <h3 className="text-lg font-semibold text-textPrimary truncate">{lead.business_name}</h3>
                              {getHFIBadge(lead.hfi_score)}
                              {getStatusBadge(lead.status)}
                              {(() => {
                                const compactTag = getCompactTechTag(lead.friction_type, lead.id, lead.business_name);
                                return compactTag ? (
                                  <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{compactTag}</span>
                                ) : null;
                              })()}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                          {isActive && canReviewSprint(lead) && (
                            <button
                              onClick={(e) => handleOpenFinalistComparison(lead, e)}
                              className="px-2 py-1 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded transition-colors"
                              title="Review Sprint"
                            >
                              Review
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Sprint Activity Section */}
                      {isActive && leader ? (
                        <div className="mb-3 pb-3 border-b border-border">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                                {getBuilderInitials(leader.name)}
                              </div>
                              <div>
                                <div className="text-sm font-medium text-textPrimary">{leader.name}</div>
                                <div className="text-xs text-textSecondary">
                                  {Math.round((leader.checkpointsCompleted / totalCheckpoints) * 100)}% • {leader.checkpointsCompleted}/{totalCheckpoints} Checkpoints
                                </div>
                              </div>
                            </div>
                            {getCapacityBadge(filledSlots, maxSlots)}
                          </div>
                          {/* Progress Bar */}
                          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden relative">
                            <div
                              className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all relative"
                              style={{ width: `${(leader.checkpointsCompleted / totalCheckpoints) * 100}%` }}
                            >
                              {/* Tooltip segments */}
                              {Array.from({ length: totalCheckpoints }).map((_, checkpoint) => {
                                const milestoneNames = [
                                  'Milestone 1: Architecture',
                                  'Milestone 2: Core Logic',
                                  'Milestone 3: API Integration',
                                  'Milestone 4: Demo Ready'
                                ];
                                const milestoneName = milestoneNames[checkpoint] || `Milestone ${checkpoint + 1}`;
                                const isCompleted = leader.checkpointsCompleted > checkpoint;
                                return (
                                  <div
                                    key={checkpoint}
                                    className={`absolute top-0 bottom-0 ${isCompleted ? 'bg-gradient-to-r from-cyan-500 to-blue-600' : ''}`}
                                    style={{
                                      left: `${(checkpoint / totalCheckpoints) * 100}%`,
                                      width: `${(1 / totalCheckpoints) * 100}%`
                                    }}
                                    title={milestoneName}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mb-3 pb-3 border-b border-border">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-textSecondary">No active sprint</span>
                            {getCapacityBadge(0, maxSlots)}
                          </div>
                        </div>
                      )}

                      {/* Action Buttons Row */}
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        {!isActive ? (
                          <LaunchSprintConfig 
                            lead={lead}
                            onLaunch={handleLaunchSprint}
                            isLoading={sprintLoadingStates.has(lead.id)}
                          />
                        ) : (
                          <button
                            onClick={(e) => handleOpenReview(lead, e)}
                            className="px-3 py-1.5 text-xs font-medium text-textSecondary bg-gray-100 hover:bg-gray-200 border border-gray-300 rounded transition-colors"
                          >
                            Manage Sprint
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                    <div className="grid grid-cols-1 gap-3 pl-4">
                      {clusterLeads
                        .sort((a, b) => b.hfi_score - a.hfi_score)
                        .map((lead) => {
                          const leader = getLeader(lead.activeBuilders || []);
                          const filledSlots = lead.activeBuilders?.length || 0;
                          const maxSlots = lead.maxSlots || 4;
                          const isActive = hasActiveSprint(lead);
                          const totalCheckpoints = 4;
                          
                          return (
                            <div
                              key={lead.id}
                              className={`bg-card border rounded-lg p-4 hover:shadow-md transition-all cursor-pointer ${
                                lead.hfi_score >= 80 
                                  ? 'border-l-4 border-l-[#00d4ff] border-border hover:border-gray-300' 
                                  : 'border-border hover:border-gray-300'
                              }`}
                              onClick={(e) => {
                                // Don't open modal if clicking checkbox
                                if ((e.target as HTMLElement).tagName !== "INPUT") {
                                  setSelectedLead(lead);
                                }
                              }}
                            >
                              {/* Header Row */}
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                  <input
                                    type="checkbox"
                                    checked={selectedLeadIds.has(lead.id)}
                                    onChange={() => toggleLeadSelection(lead.id)}
                                    onClick={(e) => e.stopPropagation()}
                                    className="mt-0.5 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500 cursor-pointer flex-shrink-0"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                      <h3 className="text-lg font-semibold text-textPrimary truncate">
                                        {lead.business_name}
                                      </h3>
                                      {getHFIBadge(lead.hfi_score)}
                                      {getStatusBadge(lead.status)}
                                      {(() => {
                                        const compactTag = getCompactTechTag(lead.friction_type, lead.id, lead.business_name);
                                        return compactTag ? (
                                          <span className="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">{compactTag}</span>
                                        ) : null;
                                      })()}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                                  {isActive && canReviewSprint(lead) && (
                                    <button
                                      onClick={(e) => handleOpenFinalistComparison(lead, e)}
                                      className="px-2 py-1 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded transition-colors"
                                      title="Review Sprint"
                                    >
                                      Review
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Sprint Activity Section */}
                              {isActive && leader ? (
                                <div className="mb-3 pb-3 border-b border-border">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center text-white text-xs font-semibold">
                                        {getBuilderInitials(leader.name)}
                                      </div>
                                      <div>
                                        <div className="text-sm font-medium text-textPrimary">{leader.name}</div>
                                        <div className="text-xs text-textSecondary">
                                          {Math.round((leader.checkpointsCompleted / totalCheckpoints) * 100)}% • {leader.checkpointsCompleted}/{totalCheckpoints} Checkpoints
                                        </div>
                                      </div>
                                    </div>
                                    {getCapacityBadge(filledSlots, maxSlots)}
                                  </div>
                                  {/* Progress Bar */}
                                  <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden relative">
                                    <div
                                      className="h-full bg-gradient-to-r from-cyan-500 to-blue-600 transition-all relative"
                                      style={{ width: `${(leader.checkpointsCompleted / totalCheckpoints) * 100}%` }}
                                    >
                                      {/* Tooltip segments */}
                                      {Array.from({ length: totalCheckpoints }).map((_, checkpoint) => {
                                        const milestoneNames = [
                                          'Milestone 1: Architecture',
                                          'Milestone 2: Core Logic',
                                          'Milestone 3: API Integration',
                                          'Milestone 4: Demo Ready'
                                        ];
                                        const milestoneName = milestoneNames[checkpoint] || `Milestone ${checkpoint + 1}`;
                                        const isCompleted = leader.checkpointsCompleted > checkpoint;
                                        return (
                                          <div
                                            key={checkpoint}
                                            className={`absolute top-0 bottom-0 ${isCompleted ? 'bg-gradient-to-r from-cyan-500 to-blue-600' : ''}`}
                                            style={{
                                              left: `${(checkpoint / totalCheckpoints) * 100}%`,
                                              width: `${(1 / totalCheckpoints) * 100}%`
                                            }}
                                            title={milestoneName}
                                          />
                                        );
                                      })}
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <div className="mb-3 pb-3 border-b border-border">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-textSecondary">No active sprint</span>
                                    {getCapacityBadge(0, maxSlots)}
                                  </div>
                                </div>
                              )}

                              {/* Action Buttons Row */}
                              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                {!isActive ? (
                                  <LaunchSprintConfig 
                                    lead={lead}
                                    onLaunch={handleLaunchSprint}
                                    isLoading={sprintLoadingStates.has(lead.id)}
                                  />
                                ) : (
                                  <button
                                    onClick={(e) => handleOpenReview(lead, e)}
                                    className="px-3 py-1.5 text-xs font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded transition-colors"
                                  >
                                    Manage Sprint
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                ))}
            </div>
          )}
          </div>
          )}
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
                  {getHFIBadge(selectedLead.hfi_score, true)}
                  {getStatusBadge(selectedLead.status)}
                  {(() => {
                    const techTag = getTechStackTag(selectedLead.friction_type, selectedLead.id, selectedLead.business_name);
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
              {/* Header Info */}
              <div className="flex items-center gap-4 text-sm text-textSecondary pb-4 border-b border-border">
                <div>
                  <span className="font-medium">Location:</span> {selectedLead.location.neighborhood}, {selectedLead.location.borough}
                </div>
                <div>
                  <span className="font-medium">HFI:</span> {selectedLead.hfi_score}
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

              {/* Project Controls */}
              {selectedLead.sprintActive && (
                <div className="bg-slate-50 p-6 rounded-lg border border-slate-200">
                  <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                    </svg>
                    Project Controls
                  </h3>
                  
                  <div className="space-y-4">
                    {/* Pause Sprint Toggle */}
                    <div className="flex items-center justify-between p-3 bg-white rounded border border-slate-200">
                      <div>
                        <div className="font-medium text-slate-800">Pause Sprint</div>
                        <div className="text-sm text-slate-500">Temporarily halt all builder progress</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedLead?.isPaused || false}
                          onChange={(e) => handlePauseSprint(selectedLead.id, e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-cyan-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                      </label>
                    </div>
                    
                    {/* Extend Deadline */}
                    <div className="flex items-center justify-between p-3 bg-white rounded border border-slate-200">
                      <div>
                        <div className="font-medium text-slate-800">Extend Deadline</div>
                        <div className="text-sm text-slate-500">
                          Current: {selectedLead?.sprintDeadline 
                            ? new Date(selectedLead.sprintDeadline).toLocaleDateString()
                            : 'Not set'
                          }
                        </div>
                      </div>
                      <button
                        onClick={() => handleExtendDeadline(selectedLead.id, 7)}
                        className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors text-sm font-medium"
                      >
                        +7 Days
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Proposed Solution */}
              <div>
                <h3 className="text-lg font-medium mb-3 text-textPrimary">Proposed Solution</h3>
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

              {/* Sprint Roster */}
              <div>
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                  <h3 className="text-lg font-semibold mb-3 text-slate-700">Sprint Roster</h3>
                  
                  {selectedLead.activeBuilders && selectedLead.activeBuilders.length > 0 ? (
                    <div className="space-y-2">
                      {/* Show filled slots */}
                      {selectedLead.activeBuilders.map((builder, index) => {
                        const milestones = selectedLead.milestones || [
                          { id: 1, name: 'Architecture' },
                          { id: 2, name: 'Core Logic' },
                          { id: 3, name: 'API Integration' },
                          { id: 4, name: 'Demo Ready' }
                        ];
                        const totalMilestones = milestones.length;
                        
                        return (
                          <div key={builder.userId} className="flex items-center justify-between p-3 bg-slate-50 rounded border border-slate-200">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-full bg-cyan-600 flex items-center justify-center text-white font-semibold">
                                {getBuilderInitials(builder.name || builder.userId)}
                              </div>
                              
                              <div>
                                <div className="font-medium text-slate-800">{builder.name || builder.userId}</div>
                                <div className="text-sm text-slate-500">
                                  {builder.checkpointsCompleted} / {totalMilestones} milestones
                                </div>
                              </div>
                            </div>
                            
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <div className="text-2xl font-bold text-cyan-600">
                                  {Math.round((builder.checkpointsCompleted / totalMilestones) * 100)}%
                                </div>
                              </div>
                              
                              {/* Admin Evict Button */}
                              {selectedLead.sprintActive && (
                                <button
                                  onClick={() => {
                                    setConfirmAction({
                                      type: 'evict',
                                      data: { leadId: selectedLead.id, builderId: builder.userId, builderName: builder.name },
                                      callback: () => handleEvictBuilder(selectedLead.id, builder.userId)
                                    });
                                    setShowConfirmModal(true);
                                  }}
                                  className="px-3 py-1.5 bg-red-100 text-red-700 rounded hover:bg-red-200 transition-colors text-sm font-medium"
                                  title="Evict Builder"
                                >
                                  Evict
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                      
                      {/* Show empty slots */}
                      {Array.from({ length: (selectedLead.maxSlots || 4) - (selectedLead.activeBuilders?.length || 0) }).map((_, index) => (
                        <div key={`empty-${index}`} className="flex items-center p-2 bg-gray-50 rounded border border-dashed border-gray-300">
                          <span className="text-sm text-gray-400">Slot {(selectedLead.activeBuilders?.length || 0) + index + 1}: Open</span>
                        </div>
                      ))}
                      
                      {/* Manage link */}
                      <button
                        onClick={() => {
                          setViewTab('live-sprints');
                          setSelectedLead(null);
                        }}
                        className="w-full mt-3 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white text-sm font-medium rounded transition-colors"
                      >
                        Manage Sprint →
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 text-center py-3">
                      No active builders yet
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal */}
      {showConfirmModal && confirmAction && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60]">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-slate-800">Confirm Action</h3>
                  <p className="text-sm text-slate-500">This action cannot be undone</p>
                </div>
              </div>
              
              <div className="mb-6">
                {confirmAction.type === 'pause' && (
                  <p className="text-slate-700">
                    Are you sure you want to {confirmAction.data?.isPaused ? 'pause' : 'resume'} this sprint? 
                    {confirmAction.data?.isPaused && ' All builder progress will be temporarily halted.'}
                  </p>
                )}
                
                {confirmAction.type === 'extend' && (
                  <p className="text-slate-700">
                    Extend the deadline by {confirmAction.data?.days} days? This will give builders additional time to complete their work.
                  </p>
                )}
                
                {confirmAction.type === 'evict' && (
                  <p className="text-slate-700">
                    Evict <strong>{confirmAction.data?.builderName}</strong> from this sprint? 
                    This will reopen their slot for other builders.
                  </p>
                )}
              </div>
              
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowConfirmModal(false);
                    setConfirmAction(null);
                  }}
                  className="flex-1 px-4 py-2 bg-slate-200 text-slate-700 rounded hover:bg-slate-300 transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (confirmAction.callback) {
                      confirmAction.callback();
                    }
                    setShowConfirmModal(false);
                    setConfirmAction(null);
                  }}
                  className="flex-1 px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition-colors font-medium"
                >
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Unified Audit Console */}
      {reviewLead && (
        <div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"
          onClick={closeConsole}
        >
          <div
            className="bg-white rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-semibold">Unified Audit Console</h2>
                  <p className="text-sm text-gray-600">{reviewLead.business_name} - All Builders</p>
                </div>
                <button
                  onClick={closeConsole}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
            </div>
            
            {/* Scrollable content */}
            <div className="flex-1 overflow-y-auto p-6">
              {reviewLead.activeBuilders && reviewLead.activeBuilders.length > 0 ? (
                reviewLead.activeBuilders.map((builder, builderIndex) => {
                  const milestones = reviewLead.milestones || [
                    { id: 1, name: 'Architecture', description: '', completionWeight: 1 },
                    { id: 2, name: 'Core Logic', description: '', completionWeight: 1 },
                    { id: 3, name: 'API Integration', description: '', completionWeight: 1 },
                    { id: 4, name: 'Integration & Testing', description: '', completionWeight: 1 }
                  ];
                  const totalCheckpoints = milestones.length;
                  
                  return (
                    <div key={builder.userId} className="mb-8 pb-8 border-b border-gray-200 last:border-0">
                      {/* Builder header */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-cyan-500 flex items-center justify-center text-white font-semibold">
                            {getBuilderInitials(builder.name)}
                          </div>
                          <div>
                            <div className="font-semibold text-lg">{builder.name}</div>
                            <div className="text-sm text-gray-600">{builder.specialty || 'Full Stack Developer'}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm text-gray-600">Progress</div>
                          <div className="text-lg font-semibold text-green-600">{builder.checkpointsCompleted}/{totalCheckpoints}</div>
                        </div>
                      </div>
                      
                      {/* Milestone links */}
                      <div className="grid grid-cols-2 gap-3 mb-4">
                        {milestones.map((milestone, idx) => {
                          const checkpointKey = String(idx + 1);
                          const checkpointStatus = builder.checkpointStatuses?.[checkpointKey];
                          const hasProofLink = checkpointStatus?.proofLink || 
                                             (builder.proofLinks && builder.proofLinks[idx]);
                          const proofLink = checkpointStatus?.proofLink || 
                                           (builder.proofLinks && builder.proofLinks[idx]) || 
                                           '';
                          
                          return (
                            <div key={milestone.id} className="p-3 bg-gray-50 rounded border">
                              <div className="text-sm font-medium mb-1">{milestone.name}</div>
                              {hasProofLink ? (
                                <a 
                                  href={proofLink} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="text-xs text-cyan-600 hover:underline block truncate"
                                  title={proofLink}
                                >
                                  {proofLink}
                                </a>
                              ) : (
                                <span className="text-xs text-gray-400">Not submitted</span>
                              )}
                              <div className="mt-1">
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                  checkpointStatus?.status === 'approved' || checkpointStatus?.status === 'verified' ? 'bg-green-100 text-green-700' :
                                  checkpointStatus?.status === 'submitted' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-gray-100 text-gray-500'
                                }`}>
                                  {checkpointStatus?.status || 'pending'}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      
                      {/* Quality Score Input */}
                      <div className="bg-white border border-gray-200 rounded p-3">
                        <label className="text-sm font-medium text-gray-700">Quality Score (0-100)</label>
                        <input 
                          type="number" 
                          min="0" 
                          max="100"
                          value={reviewScores[builder.userId]?.qualityScore || 0}
                          onChange={(e) => updateQualityScore(builder.userId, parseInt(e.target.value) || 0)}
                          className="w-full mt-1 px-3 py-2 border border-gray-300 rounded"
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-gray-500">
                  No active builders for this project.
                </div>
              )}
            </div>
            
            {/* Footer with action buttons */}
            <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
              <button 
                onClick={closeConsole} 
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={saveAllReviews}
                disabled={reviewLoading}
                className={`px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors ${
                  reviewLoading ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {reviewLoading ? 'Saving...' : 'Save All Reviews'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finalist Comparison Modal */}
      {finalistComparisonLead && (() => {
        // Get finalists and recalculate scores with current slider values
        const baseFinalists = getFinalistsWithScores(finalistComparisonLead);
        const milestoneNames = ['Architecture', 'Core Logic', 'API Integration', 'Integration & Testing'];
        
        // Recalculate and sort finalists based on current scores
        const finalistsWithCurrentScores = baseFinalists.map(builder => {
          const currentScores = finalistScores[builder.userId] || {
            qualityScore: builder.scoutReview?.qualityScore ?? 0,
            scoutReviewScore: builder.scoutReview?.scoutReviewScore ?? builder.scoutReview?.qualityScore ?? 0
          };
          const paceScore = builder.scores.pace;
          const qualityScore = currentScores.qualityScore;
          const scoutReviewScore = currentScores.scoutReviewScore;
          const totalScore = calculateTotalScore(paceScore, qualityScore, scoutReviewScore);
          
          return {
            ...builder,
            currentTotalScore: totalScore
          };
        }).sort((a, b) => b.currentTotalScore - a.currentTotalScore);
        
        return (
          <div
            className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50"
            onClick={() => {
              setFinalistComparisonLead(null);
              setFinalistScores({});
            }}
          >
            <div
              className="bg-card border border-border rounded-lg p-8 w-full max-w-[95vw] max-h-[95vh] overflow-y-auto shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-3xl font-semibold mb-2 text-textPrimary">
                    Finalist Comparison: {finalistComparisonLead.business_name}
                  </h2>
                  <p className="text-textSecondary">
                    Compare finalists and determine the winner. Adjust scores to see real-time total calculations.
                  </p>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setFinalistComparisonLead(null);
                    setFinalistScores({});
                  }}
                  className="text-textTertiary hover:text-textPrimary text-3xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Comparison Table */}
              <div className="overflow-x-auto mb-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 min-w-[1200px]">
                  {finalistsWithCurrentScores.map((builder) => {
                    const isWinner = finalistsWithCurrentScores.length > 0 && finalistsWithCurrentScores[0].userId === builder.userId;
                    const currentScores = finalistScores[builder.userId] || {
                      qualityScore: builder.scoutReview?.qualityScore ?? 0,
                      scoutReviewScore: builder.scoutReview?.scoutReviewScore ?? builder.scoutReview?.qualityScore ?? 0
                    };
                    const paceScore = builder.scores.pace;
                    const qualityScore = currentScores.qualityScore;
                    const scoutReviewScore = currentScores.scoutReviewScore;
                    const totalScore = builder.currentTotalScore;
                    
                    // Calculate completion time - estimate based on joinedAt + checkpoints
                    const joinedTime = new Date(builder.joinedAt).getTime();
                    const estimatedCompletionTime = new Date(joinedTime + (builder.checkpointsCompleted * 24 * 60 * 60 * 1000));
                    const completionTime = estimatedCompletionTime.toLocaleString();
                    
                    // Calculate time relative to firstCompletionAt
                    let relativeTime = '';
                    if (finalistComparisonLead.firstCompletionAt) {
                      const firstCompletionTime = new Date(finalistComparisonLead.firstCompletionAt).getTime();
                      const hoursDiff = (estimatedCompletionTime.getTime() - firstCompletionTime) / (1000 * 60 * 60);
                      if (hoursDiff > 0) {
                        relativeTime = ` (+${Math.round(hoursDiff)}h)`;
                      } else if (hoursDiff < 0) {
                        relativeTime = ` (${Math.round(hoursDiff)}h)`;
                      } else {
                        relativeTime = ' (same time)';
                      }
                    }
                    
                    return (
                      <div
                        key={builder.userId}
                        className={`bg-gray-50 rounded-lg p-6 border-2 transition-all ${
                          isWinner 
                            ? 'border-green-500 shadow-lg bg-green-50' 
                            : 'border-border'
                        }`}
                      >
                        {/* Builder Header */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="w-12 h-12 rounded-full bg-slate-600 flex items-center justify-center text-white font-semibold text-lg flex-shrink-0">
                            {builder.name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold text-textPrimary truncate">
                              {builder.name}
                            </h3>
                            {isWinner && (
                              <span className="inline-block px-2 py-0.5 bg-green-500 text-white text-xs font-semibold rounded mt-1">
                                🏆 Winner
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Completion Time */}
                        <div className="mb-4 pb-4 border-b border-border">
                          <div className="text-xs text-textSecondary mb-1">Completion Time</div>
                          <div className="text-sm font-medium text-textPrimary">
                            {completionTime}
                            {relativeTime && <span className="text-xs text-textSecondary ml-1">{relativeTime}</span>}
                          </div>
                        </div>

                        {/* Pace Score */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-textPrimary">Pace Score</span>
                            <span className="text-sm font-semibold text-textPrimary">{Math.round(paceScore)}</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                              className="bg-blue-500 h-3 rounded-full transition-all"
                              style={{ width: `${Math.min(100, Math.max(0, paceScore))}%` }}
                            />
                          </div>
                        </div>

                        {/* Quality Score with Slider */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-textPrimary">Quality Score</span>
                            <span className="text-sm font-semibold text-cyan-600">{qualityScore}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={qualityScore}
                            onChange={(e) => {
                              const newScore = parseInt(e.target.value);
                              setFinalistScores({
                                ...finalistScores,
                                [builder.userId]: {
                                  ...currentScores,
                                  qualityScore: newScore
                                }
                              });
                            }}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                          />
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div
                              className="bg-cyan-500 h-2 rounded-full transition-all"
                              style={{ width: `${qualityScore}%` }}
                            />
                          </div>
                        </div>

                        {/* Scout Review Score with Slider */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-medium text-textPrimary">Scout Review</span>
                            <span className="text-sm font-semibold text-cyan-600">{scoutReviewScore}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="100"
                            value={scoutReviewScore}
                            onChange={(e) => {
                              const newScore = parseInt(e.target.value);
                              setFinalistScores({
                                ...finalistScores,
                                [builder.userId]: {
                                  ...currentScores,
                                  scoutReviewScore: newScore
                                }
                              });
                            }}
                            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                          />
                          <div className="w-full bg-gray-200 rounded-full h-2 mt-1">
                            <div
                              className="bg-cyan-500 h-2 rounded-full transition-all"
                              style={{ width: `${scoutReviewScore}%` }}
                            />
                          </div>
                        </div>

                        {/* Total Score */}
                        <div className="mb-4 pb-4 border-b border-border">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-textPrimary">Total Score</span>
                            <span className={`text-lg font-bold ${
                              isWinner ? 'text-green-600' : 'text-textPrimary'
                            }`}>
                              {Math.round(totalScore)}
                            </span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-3">
                            <div
                              className={`h-3 rounded-full transition-all ${
                                isWinner ? 'bg-green-500' : 'bg-slate-600'
                              }`}
                              style={{ width: `${Math.min(100, Math.max(0, totalScore))}%` }}
                            />
                          </div>
                          <div className="text-xs text-textSecondary mt-1">
                            (Pace × 0.3) + (Quality × 0.5) + (Review × 0.2)
                          </div>
                        </div>

                        {/* Proof Links */}
                        <div>
                          <div className="text-xs font-medium text-textPrimary mb-2">Proof Links</div>
                          <div className="space-y-2">
                            {builder.proofLinks && builder.proofLinks.length > 0 ? (
                              builder.proofLinks.map((link, idx) => (
                                <a
                                  key={idx}
                                  href={link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block text-xs text-cyan-600 hover:text-cyan-800 hover:underline break-all bg-white p-2 rounded border border-border"
                                >
                                  <div className="font-medium mb-0.5">
                                    {milestoneNames[idx] || `Milestone ${idx + 1}`}
                                  </div>
                                  <div className="text-xs text-textSecondary truncate">{link}</div>
                                </a>
                              ))
                            ) : (
                              <div className="text-xs text-textSecondary italic">No proof links submitted</div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Confirm Winner Button */}
              <div className="mt-6 pt-6 border-t-2 border-border">
                <button
                  onClick={handleConfirmWinner}
                  disabled={winnerConfirmLoading}
                  className={`w-full px-8 py-4 text-lg font-bold text-white rounded-lg transition-all shadow-lg ${
                    winnerConfirmLoading
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 hover:shadow-xl'
                  }`}
                >
                  {winnerConfirmLoading ? 'Confirming Winner...' : 'Confirm Winner'}
                </button>
                <p className="text-sm text-textSecondary mt-3 text-center">
                  Winner confirmed. They now have Right to Outreach.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

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
                  Qualified/Ready: High-probability technical gap identified via HFI signal
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
                  Evaluating/Sprinting: Alumnus has accepted the technical brief and project is in progress
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
