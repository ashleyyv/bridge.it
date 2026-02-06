"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import SprintSidebar from "./SprintSidebar";
import SprintCountdown from "./SprintCountdown";
import RulesOfEngagementModal from "./RulesOfEngagementModal";
import WinnersCircle from "./WinnersCircle";

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
  complexity_score?: number;
  estimated_build_time?: string;
  discovered_at: string;
  winnerUserId?: string | null;
  activeBuilders?: Builder[];
  maxSlots?: number;
  contact?: {
    phone: string;
    owner_name: string;
  };
  firstCompletionAt?: string | null;
  submissionWindowOpen?: boolean;
  milestones?: Array<{
    id: number;
    name: string;
  }>;
}

interface LeadsData {
  leads: Lead[];
  metadata: {
    total_leads: number;
    high_priority_count: number;
    avg_hfi_score: number;
  };
}

interface Builder {
  userId: string;
  name: string;
  checkpointsCompleted: number;
  qualityScore?: number;
  checkpointStatuses?: Record<number, CheckpointStatus>;
}

interface CheckpointStatus {
  status: 'pending' | 'verified' | 'submitted';
  proofLink?: string;
  submittedAt?: string;
}

type ActiveBuilder = Builder;

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

// Reuse getTechStackTag from scout dashboard with varied badges
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
  
  if (frictionLower.includes("tracking") || 
      frictionLower.includes("logistics") || 
      frictionLower.includes("order management")) {
    return "Automation Pipeline";
  }
  
  if (frictionLower.includes("intake") || 
      frictionLower.includes("ordering") || 
      frictionLower.includes("pre-order") ||
      frictionLower.includes("online")) {
    return "React + Node API";
  }
  
  return "React + Node API";
};

// Get badge class based on friction type
const getBadgeClass = (frictionType: string): string => {
  const frictionLower = frictionType.toLowerCase();
  
  // Inventory/Supply Chain = Orange
  if (frictionLower.includes("inventory") || 
      frictionLower.includes("supply chain") ||
      frictionLower.includes("supply") ||
      frictionLower.includes("stock") ||
      frictionLower.includes("ordering") ||
      frictionLower.includes("pre-order")) {
    return "badge-tech-inventory";
  }
  
  // Delivery/Logistics = Teal
  if (frictionLower.includes("delivery") || 
      frictionLower.includes("logistics") ||
      frictionLower.includes("tracking") ||
      frictionLower.includes("shipping") ||
      frictionLower.includes("dispatch")) {
    return "badge-tech-logistics";
  }
  
  // Loyalty/CRM = Gold/Amber
  if (frictionLower.includes("loyalty") || 
      frictionLower.includes("crm") ||
      frictionLower.includes("customer relationship") ||
      frictionLower.includes("customer management") ||
      frictionLower.includes("rewards")) {
    return "badge-tech-crm";
  }
  
  // Default to purple tech stack badge
  return "badge-tech-stack";
};

// Seeded shuffle function for deterministic randomization based on lead ID
const seededShuffle = <T,>(array: T[], seed: string): T[] => {
  // Simple hash function to convert string seed to number
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Seeded random number generator
  const seededRandom = () => {
    hash = (hash * 9301 + 49297) % 233280;
    return hash / 233280;
  };
  
  // Fisher-Yates shuffle with seeded random
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(seededRandom() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled;
};

// Deliverable interface
interface Deliverable {
  id: string;
  title: string;
  description: string;
  complexity: number; // 1-5 scale
}

// Helper function to convert proposed solutions to deliverable objects
const getDeliverables = (frictionType: string, leadId: string): Deliverable[] => {
  const frictionLower = frictionType.toLowerCase();
  const solutions = getProposedSolutions(frictionType);
  
  // Map solutions to deliverables with complexity scores
  // Complexity: 1=Beginner, 2=Easy, 3=Intermediate, 4=Advanced, 5=Expert
  const complexityMap: Record<string, number> = {
    "PostgreSQL": 3,
    "Database": 3,
    "DB": 3,
    "Charts.js": 2,
    "Analytics Dashboard": 3,
    "Node-Cron": 2,
    "Automated Alerts": 2,
    "Notification API": 3,
    "Express API": 3,
    "Middleware": 4,
    "Webhooks": 4,
    "Real-time": 4,
    "Tracking": 3,
    "Route Optimization": 5,
    "Auth System": 3,
    "JWT": 3,
    "Points/Rewards": 4,
    "SMS": 2,
    "Twilio": 4,
    "Voice API": 4,
    "Call Queue": 3,
    "IVR": 5,
    "Calendar API": 3,
    "Stripe": 4,
    "Payment": 4,
    "GPS": 4,
    "Dispatch": 4,
    "Custom API": 4
  };
  
  return solutions.map((solution, index) => {
    // Calculate complexity based on keywords
    let complexity = 3; // Default intermediate
    for (const [keyword, score] of Object.entries(complexityMap)) {
      if (solution.toLowerCase().includes(keyword.toLowerCase())) {
        complexity = Math.max(complexity, score);
      }
    }
    
    // Generate descriptions based on solution type
    let description = `Implement ${solution} to address ${frictionType.toLowerCase()} challenges.`;
    if (solution.includes("Dashboard")) {
      description = `Build a ${solution} for monitoring and management.`;
    } else if (solution.includes("API")) {
      description = `Create ${solution} endpoints for integration.`;
    } else if (solution.includes("System")) {
      description = `Develop ${solution} to automate workflows.`;
    } else if (solution.includes("Integration")) {
      description = `Integrate ${solution} with existing infrastructure.`;
    }
    
    return {
      id: `${leadId}_deliverable_${index + 1}`,
      title: solution,
      description,
      complexity
    };
  });
};

// Reuse getProposedSolutions from scout dashboard
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
  
  if (frictionLower.includes("phone intake") || frictionLower.includes("phone")) {
    return [
      "Twilio Voice API Integration",
      "PostgreSQL Call Queue System",
      "Automated Call Routing & IVR",
      "Call Analytics Dashboard"
    ];
  }
  
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
  
  if (frictionLower.includes("order tracking")) {
    return [
      "Order Status Tracking API",
      "Real-time Update System",
      "Customer Notification Service",
      "Order History Dashboard"
    ];
  }
  
  return [
    "Custom API Integration",
    "React Admin Dashboard",
    "Database Schema Design",
    "Automated Workflow System"
  ];
};

// Calculate potential impact (recoverable hours)
const parseHoursFromEstimate = (estimate: string): number => {
  const rangeMatch = estimate.match(/(\d+)-(\d+)\s*hours/i);
  if (rangeMatch) {
    return Math.max(parseInt(rangeMatch[1]), parseInt(rangeMatch[2]));
  }
  const singleMatch = estimate.match(/(\d+)\s*hours/i);
  if (singleMatch) {
    return parseInt(singleMatch[1]);
  }
  return 0;
};

const getHFIBadge = (score: number) => {
  const badge = (className: string) => (
    <span className={`${className} inline-flex items-center gap-1.5`}>
      <span>{score}</span>
      <span 
        className="inline-flex items-center justify-center w-4 h-4 text-xs rounded-full bg-slate-200 text-slate-600 cursor-help group relative"
        title="HFI Signal: AI-generated estimate of technical friction based on sample review data. Intended for institutional scouting purposes only."
      >
        ⓘ
        <span className="absolute left-full ml-2 w-64 p-2 bg-slate-800 text-white text-xs rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 whitespace-normal">
          HFI Signal: AI-generated estimate of technical friction based on sample review data. Intended for institutional scouting purposes only.
        </span>
      </span>
    </span>
  );
  
  if (score >= 80) return badge("badge-hfi-high badge-hfi-critical");
  if (score >= 75) return badge("badge-hfi-high");
  if (score >= 60) return badge("badge-hfi-medium");
  return badge("badge-hfi-low");
};

// Complexity Score Display Component
const ComplexityScore = ({ score }: { score: number }) => {
  const maxScore = 5;
  const normalizedScore = Math.max(1, Math.min(5, score || 3)); // Default to 3 if missing
  
  // Determine color based on score
  const getFilledDotColor = () => {
    if (normalizedScore <= 2) return 'bg-green-500'; // Beginner (1-2 dots)
    if (normalizedScore === 3) return 'bg-blue-500'; // Intermediate (3 dots)
    return 'bg-orange-500'; // Advanced (4-5 dots)
  };
  
  const filledColor = getFilledDotColor();
  
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: maxScore }, (_, i) => (
        <div
          key={i}
          className={`w-1.5 h-1.5 rounded-full ${
            i < normalizedScore ? filledColor : 'bg-gray-200'
          }`}
        />
      ))}
      <span className="text-xs text-gray-500 ml-1">Complexity</span>
    </div>
  );
};

// Estimated Build Time Badge Component
const BuildTimeBadge = ({ time }: { time: string }) => {
  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-cyan-50 border border-cyan-200 rounded-md text-xs font-medium text-cyan-700">
      <svg
        className="w-3.5 h-3.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span>{time}</span>
    </div>
  );
};

// Slots Filled Badge Component
const SlotsBadge = ({ lead }: { lead: Lead }) => {
  const filledSlots = lead.activeBuilders?.length || 0;
  const maxSlots = lead.maxSlots || 4;
  
  return (
    <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs font-medium">
      <span className="text-green-600">{filledSlots}</span>
      <span className="text-gray-400">/</span>
      <span className="text-gray-600">{maxSlots}</span>
      <span className="text-gray-500">Active</span>
    </div>
  );
};

// Project Status Determination Logic
const getProjectStatus = (lead: Lead) => {
  const filledSlots = lead.activeBuilders?.length || 0;
  const maxSlots = lead.maxSlots || 4;
  
  // Full and evaluating (submission window closed, waiting for winner)
  if (filledSlots >= maxSlots && lead.submissionWindowOpen === false && !lead.winnerUserId) {
    return { status: 'evaluating', label: 'Full - Evaluating', color: 'orange', showCountdown: true };
  }
  
  // Full and building (sprint active)
  if (filledSlots >= maxSlots) {
    return { status: 'full', label: 'Sprint Full', color: 'gray', showCountdown: false };
  }
  
  // Has slots available
  return { status: 'open', label: `${maxSlots - filledSlots} slot${maxSlots - filledSlots > 1 ? 's' : ''} left`, color: 'green', showCountdown: false };
};

// Countdown Timer Component for Evaluating Projects
const CountdownBadge = ({ lead }: { lead: Lead }) => {
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  useEffect(() => {
    const calculateTimeUntilWinner = () => {
      if (!lead.firstCompletionAt) return 0;
      
      // Submission window closes 48 hours after first completion
      const completionTime = new Date(lead.firstCompletionAt).getTime();
      const submissionWindowEnd = completionTime + (48 * 60 * 60 * 1000);
      
      // Scout review period: 24 hours after submission window closes
      const evaluationPeriod = 24 * 60 * 60 * 1000;
      const winnerRevealTime = submissionWindowEnd + evaluationPeriod;
      const now = Date.now();
      
      return winnerRevealTime - now;
    };

    const updateTimer = () => {
      const remaining = calculateTimeUntilWinner();
      setTimeRemaining(remaining);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [lead.firstCompletionAt]);

  const formatCountdown = (ms: number): string => {
    if (ms <= 0) return "Announcing soon...";
    
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);

    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    } else {
      return `${minutes}m`;
    }
  };

  return (
    <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-700">
      Winner reveal in: {formatCountdown(timeRemaining)}
    </span>
  );
};

// Get squad composition with empty slots
const getSquadSlots = (lead: Lead): Array<{ filled: boolean; builder?: any }> => {
  const maxSlots = 3; // Tier 2 allows 3-person teams
  const slots = [];
  
  // Fill with active builders
  if (lead.activeBuilders && lead.activeBuilders.length > 0) {
    lead.activeBuilders.slice(0, maxSlots).forEach(builder => {
      slots.push({ filled: true, builder });
    });
  }
  
  // Add empty slots
  while (slots.length < maxSlots) {
    slots.push({ filled: false });
  }
  
  return slots;
};

// Helper function to get initials from name
const getInitials = (name: string): string => {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
};

// Helper function to get builder initials (handles undefined name)
const getBuilderInitials = (builder: { userId: string; name?: string }): string => {
  if (builder.name) {
    return getInitials(builder.name);
  }
  // Fallback to userId initials
  if (builder.userId.length >= 2) {
    return builder.userId.substring(0, 2).toUpperCase();
  }
  return '?';
};

// Helper function to find the leading builder
const getLeadingBuilder = (builders: Builder[] = []): Builder | null => {
  if (builders.length === 0) return null;
  return builders.reduce((lead, builder) => 
    builder.checkpointsCompleted > lead.checkpointsCompleted ? builder : lead
  );
};

// Check if similar project exists in library
const hasSimilarBlueprintProject = (lead: Lead): { exists: boolean; projectId?: string; projectName?: string } => {
  // Simplified check - in reality would query the library API
  const similarProjects: Record<string, { id: string; name: string }> = {
    'Phone Intake': { id: 'lead_002', name: 'Sunset Park BBQ' },
    'Booking Management': { id: 'lead_007', name: 'Astoria Mediterranean Grill' },
    'Inventory': { id: 'lead_012', name: 'DUMBO Pasta Lab' },
    'Delivery': { id: 'lead_005', name: 'Jackson Heights Deli' }
  };
  
  const frictionType = lead.friction_type || '';
  
  for (const [key, project] of Object.entries(similarProjects)) {
    if (frictionType.includes(key) || lead.friction_clusters?.some(c => c.category.includes(key))) {
      return {
        exists: true,
        projectId: project.id,
        projectName: project.name
      };
    }
  }
  
  return { exists: false };
};

// Generate "SEEKING" label based on unclaimed deliverables
const getSeekingLabel = (lead: Lead): string | null => {
  if (!(lead as any).bespoke_deliverable || !Array.isArray((lead as any).bespoke_deliverable)) {
    return null;
  }
  
  // Map deliverables to specialist roles
  const roleMapping: Record<string, string> = {
    'api': 'API SPECIALIST',
    'integration': 'API SPECIALIST',
    'calendar': 'API SPECIALIST',
    'database': 'DATABASE ARCHITECT',
    'postgresql': 'DATABASE ARCHITECT',
    'schema': 'DATABASE ARCHITECT',
    'ui': 'FRONTEND SPECIALIST',
    'react': 'FRONTEND SPECIALIST',
    'design': 'FRONTEND SPECIALIST',
    'auth': 'SECURITY ENGINEER',
    'authentication': 'SECURITY ENGINEER',
    'payment': 'FINTECH SPECIALIST',
    'stripe': 'FINTECH SPECIALIST',
    'analytics': 'DATA SPECIALIST',
    'reporting': 'DATA SPECIALIST'
  };
  
  // Check which deliverables are mentioned
  const delivText = JSON.stringify((lead as any).bespoke_deliverable).toLowerCase();
  
  for (const [keyword, role] of Object.entries(roleMapping)) {
    if (delivText.includes(keyword)) {
      return role;
    }
  }
  
  return 'FULL-STACK DEVELOPER';
};

// Enhanced match score for Ashley Vigo's PERN stack specialization
const calculateStrategicMatchScore = (lead: Lead): { score: number; isPERN: boolean; matchedTechs: string[] } => {
  const ashleyStack = ['React', 'Node.js', 'PostgreSQL', 'Express', 'PERN'];
  const deliverableText = (lead as any).bespoke_deliverable 
    ? JSON.stringify((lead as any).bespoke_deliverable).toLowerCase()
    : '';
  
  const matchedTechs: string[] = [];
  let matches = 0;
  
  // Check for PERN stack mentions
  const isPERN = deliverableText.includes('pern') || 
                 deliverableText.includes('postgresql') ||
                 (deliverableText.includes('react') && 
                  deliverableText.includes('node') && 
                  deliverableText.includes('postgres'));
  
  ashleyStack.forEach(tech => {
    if (deliverableText.includes(tech.toLowerCase())) {
      matches++;
      matchedTechs.push(tech);
    }
  });
  
  // Bonus for PERN match based on Ashley's 3 past PERN builds
  let score = Math.min(100, (matches / ashleyStack.length) * 100);
  if (isPERN) {
    score = Math.min(100, score + 20); // 20% bonus for PERN stack
  }
  
  return {
    score: Math.round(score),
    isPERN,
    matchedTechs
  };
};

// Calculate match score based on user's tech stack preferences (kept for backward compatibility)
const calculateMatchScore = (lead: Lead, userStack: string[]): number => {
  // Check if bespoke_deliverable exists, otherwise use proposed solutions
  let deliverableText = '';
  
  if ((lead as any).bespoke_deliverable) {
    deliverableText = JSON.stringify((lead as any).bespoke_deliverable).toLowerCase();
  } else {
    // Fallback to proposed solutions if bespoke_deliverable doesn't exist
    const solutions = getProposedSolutions(lead.friction_type);
    deliverableText = solutions.join(' ').toLowerCase();
  }
  
  if (!deliverableText || userStack.length === 0) return 0;
  
  let matches = 0;
  
  userStack.forEach(tech => {
    if (deliverableText.includes(tech.toLowerCase())) {
      matches++;
    }
  });
  
  // Score out of 100
  const score = Math.min(100, (matches / userStack.length) * 100);
  return Math.round(score);
};

// Check if project matches user's preferred stack
const isStackMatch = (lead: Lead, userStack: string[]): boolean => {
  const score = calculateMatchScore(lead, userStack);
  return score >= 75; // 75% match threshold
};

// Helper function to check if builder has highest quality score
const hasHighestQuality = (builder: Builder, allBuilders: Builder[] = []): boolean => {
  if (!builder.qualityScore) return false;
  const maxQuality = Math.max(...allBuilders.map(b => b.qualityScore || 0));
  return builder.qualityScore === maxQuality && builder.qualityScore > 0;
};

// Builder Avatar Component
const BuilderAvatar = ({ builder, allBuilders, isLeading }: { builder: Builder; allBuilders: Builder[]; isLeading: boolean }) => {
  const hasFireGlow = isLeading && hasHighestQuality(builder, allBuilders);
  
  return (
    <div className="relative group">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold text-white bg-gradient-to-br from-green-500 to-emerald-600 border-2 border-white shadow-md ${
          hasFireGlow ? 'fire-glow' : ''
        }`}
        title={builder.name}
      >
        {getInitials(builder.name)}
      </div>
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
        {builder.name}
        {isLeading && <span className="ml-1">🏃</span>}
      </div>
    </div>
  );
};

// Sprint Progress Bar Component
const SprintProgressBar = ({ lead }: { lead: Lead }) => {
  const leadingBuilder = getLeadingBuilder(lead.activeBuilders);
  const totalCheckpoints = lead.milestones?.length || 4;
  
  if (!leadingBuilder || !lead.activeBuilders || lead.activeBuilders.length === 0) {
    return null;
  }

  const completed = leadingBuilder.checkpointsCompleted;
  const progressPercent = (completed / totalCheckpoints) * 100;

  return (
    <div className="mt-4 pt-4 border-t border-gray-200">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-textSecondary">
          <span>🏃</span>
          <span className="font-medium">Leading: {leadingBuilder.name}</span>
          <span className="text-textTertiary">• {completed}/{totalCheckpoints} Checkpoints</span>
        </div>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
        <div className="h-full flex">
          {Array.from({ length: totalCheckpoints }, (_, i) => (
            <div
              key={i}
              className={`flex-1 ${
                i < completed
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600'
                  : 'bg-gray-200'
              } ${i < completed && i === completed - 1 ? 'animate-pulse' : ''}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default function AlumniDashboard() {
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<LeadsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [claimedProjectId, setClaimedProjectId] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [proofLinks, setProofLinks] = useState<Record<number, string>>({});
  const [submittingCheckpoint, setSubmittingCheckpoint] = useState<number | null>(null);
  const [urlErrors, setUrlErrors] = useState<Record<number, string>>({});
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [showDeliverableModal, setShowDeliverableModal] = useState(false);
  const [pendingLeadId, setPendingLeadId] = useState<string | null>(null);
  const [selectedDeliverables, setSelectedDeliverables] = useState<string[]>([]);
  const [joiningSprint, setJoiningSprint] = useState<string | false>(false);
  const [showTeamToggle, setShowTeamToggle] = useState(false);
  const [isTeamSprint, setIsTeamSprint] = useState(false);
  const [teamSize, setTeamSize] = useState(1);
  // Per-card team sprint state
  const [cardTeamSprint, setCardTeamSprint] = useState<Record<string, { isTeam: boolean; teamSize: number }>>({});

  // Route protection - redirect if not authenticated or not alumni
  useEffect(() => {
    if (!isAuthenticated || user?.role !== 'alumni') {
      router.push('/');
    }
  }, [isAuthenticated, user, router]);

  useEffect(() => {
    fetch("http://localhost:3001/api/leads")
      .then((res) => res.json())
      .then((data) => {
        setData(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Failed to fetch leads:", err);
        setLoading(false);
      });
  }, []);

  // Refresh data periodically to show live updates
  useEffect(() => {
    const interval = setInterval(() => {
      fetch("http://localhost:3001/api/leads")
        .then((res) => res.json())
        .then((data) => {
          setData(data);
        })
        .catch((err) => {
          console.error("Failed to refresh leads:", err);
        });
    }, 5000); // Refresh every 5 seconds

    return () => clearInterval(interval);
  }, []);

  // Filter leads for qualified or briefed status
  const availableProjects = data?.leads.filter(lead => 
    lead.status.toLowerCase() === 'qualified' || 
    lead.status.toLowerCase() === 'briefed'
  ) || [];

  const handleCardClick = (lead: Lead) => {
    setSelectedLead(lead);
  };

  const handleClaimProject = (leadId: string) => {
    // Show deliverable selection modal instead of directly claiming
    const lead = data?.leads.find(l => l.id === leadId);
    if (lead) {
      setPendingLeadId(leadId);
      const deliverables = getDeliverables(lead.friction_type, leadId);
      // Initialize with empty selection - user must select at least one
      setSelectedDeliverables([]);
      setShowDeliverableModal(true);
    }
  };

  const handleJoinSprint = (leadId: string, isTeam: boolean, teamSizeValue: number) => {
    // Check if user is already active on another project
    const userId = getCurrentUserId();
    const activeProject = getBuilderActiveProject(userId, data?.leads || []);
    
    if (activeProject && activeProject.id !== leadId) {
      alert(`You are already actively building ${activeProject.business_name}. Complete or leave that project before joining another.`);
      return;
    }
    
    // Show deliverable selection modal
    const lead = data?.leads.find(l => l.id === leadId);
    if (lead) {
      setPendingLeadId(leadId);
      setIsTeamSprint(isTeam);
      setTeamSize(teamSizeValue);
      const deliverables = getDeliverables(lead.friction_type, leadId);
      setSelectedDeliverables([]);
      setJoiningSprint(leadId); // Set joining state for this lead
      setShowDeliverableModal(true);
    }
  };

  const handleConfirmJoin = async () => {
    if (!pendingLeadId || selectedDeliverables.length === 0) return;
    
    // Check if user is already active on another project
    const userId = getCurrentUserId();
    const activeProject = getBuilderActiveProject(userId, data?.leads || []);
    
    if (activeProject && activeProject.id !== pendingLeadId) {
      alert(`You are already actively building ${activeProject.business_name}. Complete or leave that project before joining another.`);
      setShowDeliverableModal(false);
      setPendingLeadId(null);
      setSelectedDeliverables([]);
      return;
    }
    
    setJoiningSprint(pendingLeadId); // Set joining state for this lead
    
    try {
      const response = await fetch(`http://localhost:3001/api/leads/${pendingLeadId}/join-sprint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          userName: user?.name || 'Ashley Vigo',
          selectedDeliverables: selectedDeliverables,
          isTeamSprint: isTeamSprint,
          teamSize: teamSize
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to join sprint');
      }

      const updatedLead = await response.json();
      
      // Refresh leads data
      const leadsResponse = await fetch("http://localhost:3001/api/leads");
      const leadsData = await leadsResponse.json();
      setData(leadsData);
      
      // Close modal and show success
      setShowDeliverableModal(false);
      setPendingLeadId(null);
      setSelectedDeliverables([]);
      setIsTeamSprint(false);
      setTeamSize(1);
      setClaimedProjectId(pendingLeadId);
      setShowSuccess(true);
      
      // Hide success message after 3 seconds
      setTimeout(() => {
        setShowSuccess(false);
        setClaimedProjectId(null);
      }, 3000);
      
    } catch (error) {
      console.error('Error joining sprint:', error);
      alert(error instanceof Error ? error.message : 'Failed to join sprint');
    } finally {
      setJoiningSprint(false);
    }
  };

  const toggleDeliverable = (deliverableId: string) => {
    setSelectedDeliverables(prev => {
      if (prev.includes(deliverableId)) {
        return prev.filter(id => id !== deliverableId);
      } else {
        return [...prev, deliverableId];
      }
    });
  };

  const handleSelectAll = (allDeliverableIds: string[]) => {
    if (selectedDeliverables.length === allDeliverableIds.length) {
      setSelectedDeliverables([]);
    } else {
      setSelectedDeliverables([...allDeliverableIds]);
    }
  };

  // Get current user's builder info (mock userId for demo)
  const getCurrentBuilder = (lead: Lead): ActiveBuilder | null => {
    if (!lead.activeBuilders || !user) return null;
    // For demo, use email to match or first builder
    // In production, this would use actual userId from auth
    return lead.activeBuilders[0] || null;
  };

  // Get current user ID (mock for demo)
  const getCurrentUserId = (): string => {
    // In production, get from auth context
    return user?.id || 'alumni_ashley';
  };

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

  // Check if user is currently building this project
  const isUserCurrentlyBuilding = (lead: Lead): boolean => {
    return lead.activeBuilders?.some(b => b.userId === getCurrentUserId()) || false;
  };

  // Filter to show only the project the current user is active on
  const userActiveProjects = data?.leads.filter(lead =>
    lead.activeBuilders &&
    lead.activeBuilders.some(b => b.userId === getCurrentUserId())
  ) || [];

  // Get user tier info
  const userTier = 2; // Ashley Vigo is Tier 2
  const maxTeamSize = userTier >= 2 ? 3 : 1;

  // Check if current user is winner
  const isCurrentUserWinner = (lead: Lead): boolean => {
    if (!lead.winnerUserId) return false;
    return lead.winnerUserId === getCurrentUserId();
  };

  // Get winner name
  const getWinnerName = (lead: Lead): string | null => {
    if (!lead.winnerUserId || !lead.activeBuilders) return null;
    const winner = lead.activeBuilders.find(b => b.userId === lead.winnerUserId);
    return winner?.name || null;
  };

  // Validate URL (GitHub or Loom)
  const validateProofUrl = (url: string): boolean => {
    const urlPattern = /^https?:\/\/(github\.com|loom\.com|www\.github\.com|www\.loom\.com)/i;
    return urlPattern.test(url);
  };

  // Handle proof link input change
  const handleProofLinkChange = (checkpointId: number, value: string) => {
    setProofLinks(prev => ({ ...prev, [checkpointId]: value }));
    // Clear error when user types
    if (urlErrors[checkpointId]) {
      setUrlErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[checkpointId];
        return newErrors;
      });
    }
  };

  // Submit checkpoint proof
  const handleSubmitProof = async (leadId: string, checkpointId: number) => {
    const proofLink = proofLinks[checkpointId]?.trim();
    
    if (!proofLink) {
      setUrlErrors(prev => ({ ...prev, [checkpointId]: 'Please enter a proof link' }));
      return;
    }

    if (!validateProofUrl(proofLink)) {
      setUrlErrors(prev => ({ 
        ...prev, 
        [checkpointId]: 'Proof link must be a GitHub or Loom URL' 
      }));
      return;
    }

    setSubmittingCheckpoint(checkpointId);

    try {
      // Mock userId - in production, get from auth context
      const userId = 'alumni_001'; // This would come from user context
      
      const response = await fetch(`http://localhost:3001/api/leads/${leadId}/checkpoint`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          checkpointId,
          proofLink,
          userId,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to submit proof');
      }

      const updatedLead = await response.json();
      setSelectedLead(updatedLead);
      
      // Clear the input
      setProofLinks(prev => {
        const newLinks = { ...prev };
        delete newLinks[checkpointId];
        return newLinks;
      });
      
      // Refresh leads data
      const leadsResponse = await fetch("http://localhost:3001/api/leads");
      const leadsData = await leadsResponse.json();
      setData(leadsData);
      
    } catch (error) {
      console.error('Error submitting proof:', error);
      setUrlErrors(prev => ({ 
        ...prev, 
        [checkpointId]: error instanceof Error ? error.message : 'Failed to submit proof' 
      }));
    } finally {
      setSubmittingCheckpoint(null);
    }
  };

  // Get checkpoint status
  const getCheckpointStatus = (lead: Lead, checkpointId: number): CheckpointStatus => {
    const builder = getCurrentBuilder(lead);
    if (!builder || !builder.checkpointStatuses) {
      return { status: 'pending' };
    }
    return builder.checkpointStatuses[checkpointId] || { status: 'pending' };
  };

  // Check if previous checkpoint is verified
  const canSubmitCheckpoint = (lead: Lead, checkpointId: number): boolean => {
    if (checkpointId === 1) return true; // First checkpoint always available
    
    // Check if previous checkpoint is verified
    const previousStatus = getCheckpointStatus(lead, checkpointId - 1);
    return previousStatus.status === 'verified';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-textPrimary text-xl font-light">Loading Projects...</div>
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== 'alumni') {
    return null; // Will redirect via useEffect
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
      {/* Sprint Sidebar */}
      <SprintSidebar />

      {/* Winners Circle */}
      <WinnersCircle />

      {/* Success Toast */}
      {showSuccess && claimedProjectId && (
        <div className="fixed top-6 right-[340px] z-50 bg-green-500 text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3 transform transition-all duration-300 ease-in-out">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <div>
            <div className="font-semibold">Project Claimed Successfully!</div>
            <div className="text-sm text-green-100">You've been assigned to this project.</div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="bg-white border-b border-border shadow-sm relative z-50">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <img 
                  src="/bridge-b-arch.png" 
                  alt="Bridge B" 
                  className="h-28 w-auto logo-glow"
                  style={{ backgroundColor: '#000000', padding: '8px', borderRadius: '8px' }}
                />
                <h1 className="text-6xl font-bold tracking-tight text-textPrimary">
                  ridge<span className="text-green-600">.IT</span>
                </h1>
              </div>
              <div className="ml-6 border-l-2 border-gray-300 pl-6">
                <p className="text-lg font-semibold text-green-600 leading-tight">
                  Alumni Project Marketplace
                </p>
                <p className="text-base text-textSecondary font-medium mt-1">
                  Find & Claim Technical Projects
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push("/library")}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium flex items-center gap-2"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                Blueprint Library
              </button>
              <div className="text-right">
                <div className="text-base font-semibold text-textPrimary">{user?.name}</div>
                <div className="text-sm text-textSecondary">Alumni Portal</div>
              </div>
              <button
                onClick={() => {
                  logout();
                  router.push('/');
                }}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-md transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-6 shadow-sm">
            <div className="text-textSecondary text-sm uppercase tracking-wide mb-2 font-medium">
              Available Projects
            </div>
            <div className="text-4xl font-semibold text-green-700">{availableProjects.length}</div>
            <div className="text-sm text-green-600 mt-2">Ready to claim</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-200 rounded-lg p-6 shadow-sm">
            <div className="text-textSecondary text-sm uppercase tracking-wide mb-2 font-medium">
              Avg Build Time
            </div>
            <div className="text-4xl font-semibold text-green-700">4 weeks</div>
            <div className="text-sm text-green-600 mt-2">Estimated timeline</div>
          </div>
        </div>

        {/* Project Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {availableProjects
            .sort((a, b) => b.hfi_score - a.hfi_score)
            .map((lead) => {
              const hours = parseHoursFromEstimate(lead.time_on_task_estimate);
              const recoverableHours = Math.round(hours * 0.75); // 75% efficiency gain
              const proposedSolutions = seededShuffle(
                getProposedSolutions(lead.friction_type),
                lead.id
              );
              const techStack = getTechStackTag(lead.friction_type, lead.id, lead.business_name);
              
              // Calculate strategic match score for Ashley Vigo
              const matchData = calculateStrategicMatchScore(lead);
              const isHighMatch = matchData.score >= 90;

              return (
                <div
                  key={lead.id}
                  className={`bg-white rounded-lg shadow-md border-2 transition-all hover:shadow-lg cursor-pointer relative p-6 ${
                    isHighMatch ? 'border-green-500 ring-2 ring-green-200 shadow-green-500/50' : 'border-gray-200'
                  } ${lead.isPaused ? 'sprint-paused' : ''}`}
                  onClick={() => handleCardClick(lead)}
                >
                  {/* Strategic Match Badge */}
                  {matchData.score >= 90 && (
                    <div className="absolute top-3 right-3 z-10">
                      <div className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg animate-pulse">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                        </svg>
                        {matchData.score}% Strategic Match
                      </div>
                    </div>
                  )}
                  {/* Header */}
                  <div className="mb-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-xl font-semibold text-textPrimary">{lead.business_name}</h3>
                          <SlotsBadge lead={lead} />
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        {getHFIBadge(lead.hfi_score)}
                        {lead.winnerUserId && (
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded-md text-xs font-semibold">
                            🏆 Winner: {getWinnerName(lead) || 'Determined'}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Project Status Badge */}
                    {(() => {
                      const projectStatus = getProjectStatus(lead);
                      return (
                        <div className="flex items-center gap-2 mb-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            projectStatus.color === 'orange' ? 'bg-orange-100 text-orange-700' :
                            projectStatus.color === 'gray' ? 'bg-gray-100 text-gray-700' :
                            'bg-green-100 text-green-700'
                          }`}>
                            {projectStatus.label}
                          </span>
                          {projectStatus.showCountdown && (
                            <CountdownBadge lead={lead} />
                          )}
                        </div>
                      );
                    })()}
                    <div className="flex items-center gap-2 text-sm text-textSecondary mb-3">
                      <span>{lead.location.neighborhood}, {lead.location.borough}</span>
                    </div>
                    {/* Right to Outreach Banner */}
                    {isCurrentUserWinner(lead) && (
                      <div className="mb-3 p-3 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg text-white">
                        <div className="flex items-center gap-2">
                          <span className="text-xl">🏆</span>
                          <div>
                            <div className="font-semibold text-sm">Right to Outreach Unlocked!</div>
                            <div className="text-xs text-green-100">You've won this sprint. Contact the business owner to proceed.</div>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* Complexity Score and Build Time */}
                    <div className="flex items-center gap-3 mb-3">
                      <ComplexityScore score={lead.complexity_score || 3} />
                      <BuildTimeBadge time={lead.estimated_build_time || '3-4 weeks'} />
                    </div>
                    {techStack && (
                      <div className="mb-3">
                        <span className={getBadgeClass(lead.friction_type)}>
                          {techStack}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Proposed Solution */}
                  <div className="mb-4">
                    <div className="text-xs text-textTertiary uppercase tracking-wide mb-2 font-medium">
                      Proposed Solution
                    </div>
                    <ul className="space-y-1.5">
                      {proposedSolutions.slice(0, 3).map((solution, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-textSecondary">
                          <svg 
                            className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" 
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
                          <span>{solution}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Squad Radar - replace Potential Impact section */}
                  <div className="mt-4 p-3 bg-gradient-to-r from-slate-50 to-emerald-50 rounded-lg border border-emerald-200">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                        </svg>
                        <span className="text-xs font-semibold text-emerald-800">Squad Composition</span>
                      </div>
                      <span className="text-xs text-emerald-600 font-medium">
                        {lead.activeBuilders?.length || 0}/3 Filled
                      </span>
                    </div>
                    
                    {/* Trio Slots */}
                    <div className="flex items-center gap-3">
                      {getSquadSlots(lead).map((slot, idx) => (
                        <div key={idx} className="flex-1">
                          {slot.filled && slot.builder ? (
                            <div className="relative group">
                              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white font-bold text-sm shadow-lg">
                                {getInitials(slot.builder.name || 'UN')}
                              </div>
                              {/* Tooltip */}
                              <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-slate-800 text-white text-xs rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                {slot.builder.name}
                              </div>
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center">
                              <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                              </svg>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Blueprint Synergy Link */}
                  {(() => {
                    const similarProject = hasSimilarBlueprintProject(lead);
                    
                    return similarProject.exists ? (
                      <div className="mt-3 p-2 bg-blue-50 rounded border border-blue-200 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <svg className="w-4 h-4 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                          </svg>
                          <div>
                            <div className="text-xs font-semibold text-blue-800">Blueprint Available</div>
                            <div className="text-xs text-blue-600">Based on {similarProject.projectName}</div>
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            router.push(`/library?project=${similarProject.projectId}`);
                          }}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-xs font-medium hover:bg-blue-700 transition-colors flex items-center gap-1"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                          View Base Logic
                        </button>
                      </div>
                    ) : null;
                  })()}

                  {/* Seeking Label */}
                  {(() => {
                    const seekingRole = getSeekingLabel(lead);
                    const hasOpenSlots = (lead.activeBuilders?.length || 0) < 3;
                    
                    return seekingRole && hasOpenSlots ? (
                      <div className="mt-2 px-2 py-1 bg-orange-100 border border-orange-300 rounded flex items-center gap-2">
                        <svg className="w-3 h-3 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                        </svg>
                        <span className="text-xs font-bold text-orange-700">
                          SEEKING: {seekingRole}
                        </span>
                      </div>
                    ) : null;
                  })()}

                  {/* Competitor Avatars */}
                  {lead.activeBuilders && lead.activeBuilders.length > 0 && (
                    <div className="flex items-center gap-2 mb-4 pt-3 border-t border-gray-200">
                      <span className="text-xs text-gray-500">Building now:</span>
                      <div className="flex -space-x-2">
                        {lead.activeBuilders.slice(0, 3).map((builder, idx) => (
                          <div
                            key={builder.userId}
                            className="w-7 h-7 rounded-full bg-gradient-to-br from-green-400 to-emerald-600 border-2 border-white flex items-center justify-center text-white text-xs font-semibold shadow-sm hover:shadow-md transition-shadow cursor-help"
                            title={builder.name || builder.userId}
                          >
                            {getBuilderInitials(builder)}
                          </div>
                        ))}
                        {lead.activeBuilders.length > 3 && (
                          <div className="w-7 h-7 rounded-full bg-gray-300 border-2 border-white flex items-center justify-center text-gray-600 text-xs font-medium shadow-sm">
                            +{lead.activeBuilders.length - 3}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Contact Info for Winner */}
                  {isCurrentUserWinner(lead) && lead.contact && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg border-2 border-blue-300">
                      <div className="text-xs text-blue-700 uppercase tracking-wide mb-2 font-semibold">
                        Business Contact Information
                      </div>
                      <div className="space-y-1 text-sm">
                        <div className="text-textPrimary">
                          <span className="font-medium">Owner:</span> {lead.contact.owner_name}
                        </div>
                        <div className="text-textPrimary">
                          <span className="font-medium">Phone:</span> {lead.contact.phone}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedLead(lead)}
                      className="flex-1 px-4 py-2 text-sm font-medium text-green-700 bg-white border border-green-300 rounded-md hover:bg-green-50 transition-colors"
                    >
                      View Details
                    </button>
                    {isCurrentUserWinner(lead) ? (
                      <button
                        onClick={() => {
                          if (lead.contact) {
                            window.open(`tel:${lead.contact.phone.replace(/\D/g, '')}`, '_self');
                          }
                        }}
                        className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 rounded-md hover:from-green-700 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg"
                      >
                        Contact Business Owner
                      </button>
                    ) : lead.winnerUserId ? (
                      <div className="flex-1 px-4 py-2 text-sm font-medium text-gray-500 bg-gray-100 rounded-md text-center">
                        Winner: {getWinnerName(lead) || 'Determined'}
                      </div>
                    ) : (() => {
                      const filledSlots = lead.activeBuilders?.length || 0;
                      const maxSlots = lead.maxSlots || 4;
                      const slotsRemaining = maxSlots - filledSlots;
                      const isFinalSlot = slotsRemaining === 1;
                      const isFull = slotsRemaining === 0;
                      const isUserInSprint = getCurrentBuilder(lead) !== null;
                      const availableSlots = slotsRemaining;
                      
                      if (isFull) {
                        return (
                          <div className="flex-1 px-4 py-2 text-sm font-medium text-gray-500 bg-gray-400 rounded-md text-center cursor-not-allowed">
                            Sprint Full
                          </div>
                        );
                      }
                      
                      // Get per-card team sprint state
                      const cardState = cardTeamSprint[lead.id] || { isTeam: false, teamSize: 1 };
                      
                      return (
                        !isUserInSprint && availableSlots > 0 ? (
                          <div className="flex-1 space-y-3">
                            {/* Team Selection UI */}
                            {userTier >= 2 && (
                              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                                <div className="flex items-center justify-between mb-2">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={cardState.isTeam}
                                      onChange={(e) => {
                                        setCardTeamSprint(prev => ({
                                          ...prev,
                                          [lead.id]: {
                                            isTeam: e.target.checked,
                                            teamSize: e.target.checked ? prev[lead.id]?.teamSize || 1 : 1
                                          }
                                        }));
                                      }}
                                      className="rounded text-emerald-600 focus:ring-emerald-500"
                                    />
                                    <span className="text-sm font-semibold text-emerald-800">
                                      Form Squad
                                    </span>
                                  </label>
                                  <span className="px-2 py-0.5 bg-emerald-600 text-white text-xs rounded-full font-bold">
                                    Tier {userTier}
                                  </span>
                                </div>
                                
                                {cardState.isTeam && (
                                  <div className="space-y-2">
                                    <div className="text-xs text-emerald-700 font-medium">Select squad members:</div>
                                    <select
                                      multiple
                                      className="w-full px-3 py-2 text-sm border border-emerald-300 rounded focus:ring-2 focus:ring-emerald-500 bg-white"
                                      size={3}
                                      onChange={(e) => {
                                        const selected = Array.from(e.target.selectedOptions).map(o => o.value);
                                        const newTeamSize = selected.length + 1; // +1 for Ashley
                                        setCardTeamSprint(prev => ({
                                          ...prev,
                                          [lead.id]: {
                                            ...prev[lead.id],
                                            isTeam: true,
                                            teamSize: newTeamSize
                                          }
                                        }));
                                      }}
                                    >
                                      <option value="alumni_001">Jordan Taylor - Backend</option>
                                      <option value="alumni_002">Maria Garcia - Frontend</option>
                                      <option value="alumni_003">Alex Chen - Full-Stack</option>
                                      <option value="alumni_004">Sam Johnson - DevOps</option>
                                      <option value="alumni_005">Nina Patel - UI/UX</option>
                                    </select>
                                    <div className="text-xs text-emerald-600">
                                      Select up to 2 teammates (you + 2 = 3 total)
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                            
                            {/* Updated Button */}
                            <button
                              onClick={() => handleJoinSprint(lead.id, cardState.isTeam, cardState.teamSize)}
                              disabled={joiningSprint === lead.id}
                              className={`w-full px-4 py-3 rounded-lg font-bold transition-all shadow-lg ${
                                availableSlots === 1
                                  ? 'bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 text-white'
                                  : 'bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white'
                              } disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2`}
                            >
                              {joiningSprint === lead.id ? (
                                <>
                                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Joining...
                                </>
                              ) : availableSlots === 1 ? (
                                <>
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                  </svg>
                                  Join Final Slot
                                </>
                              ) : (
                                <>
                                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                                  </svg>
                                  {cardState.isTeam ? `Form Squad (${cardState.teamSize} members)` : 'Join Sprint Solo'}
                                </>
                              )}
                            </button>
                          </div>
                        ) : null
                      );
                    })()}
                  </div>
                </div>
              );
            })}
        </div>

        {availableProjects.length === 0 && (
          <div className="text-center py-12">
            <div className="text-textSecondary text-lg">No available projects at this time.</div>
            <div className="text-textTertiary text-sm mt-2">Check back later for new opportunities.</div>
          </div>
        )}
      </div>

      {/* Project Detail Modal */}
      {selectedLead && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6 z-50"
          onClick={() => setSelectedLead(null)}
        >
          <div
            className="bg-card border border-border rounded-lg p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <h2 className="text-3xl font-semibold text-textPrimary">{selectedLead.business_name}</h2>
                  <SlotsBadge lead={selectedLead} />
                </div>
                {/* Project Status Badge */}
                {(() => {
                  const projectStatus = getProjectStatus(selectedLead);
                  return (
                    <div className="flex items-center gap-2 mb-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        projectStatus.color === 'orange' ? 'bg-orange-100 text-orange-700' :
                        projectStatus.color === 'gray' ? 'bg-gray-100 text-gray-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {projectStatus.label}
                      </span>
                      {projectStatus.showCountdown && (
                        <CountdownBadge lead={selectedLead} />
                      )}
                    </div>
                  );
                })()}
                <div className="flex items-center gap-3 flex-wrap mb-3">
                  {getHFIBadge(selectedLead.hfi_score)}
                  {selectedLead.winnerUserId && (
                    <span className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-md text-sm font-semibold">
                      🏆 Winner: {getWinnerName(selectedLead) || 'Determined'}
                    </span>
                  )}
                  {(() => {
                    const techTag = getTechStackTag(selectedLead.friction_type, selectedLead.id, selectedLead.business_name);
                    return techTag ? (
                      <span className={getBadgeClass(selectedLead.friction_type)}>
                        {techTag}
                      </span>
                    ) : null;
                  })()}
                </div>
                {/* Right to Outreach Banner */}
                {isCurrentUserWinner(selectedLead) && (
                  <div className="mb-3 p-4 bg-gradient-to-r from-green-500 to-emerald-600 rounded-lg text-white">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🏆</span>
                      <div>
                        <div className="font-bold text-lg">Right to Outreach Unlocked!</div>
                        <div className="text-sm text-green-100 mt-1">You've won this sprint. Contact the business owner to proceed with the project.</div>
                      </div>
                    </div>
                  </div>
                )}
                {/* Complexity Score and Build Time */}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-textSecondary font-medium">Complexity:</span>
                    <ComplexityScore score={selectedLead.complexity_score || 3} />
                  </div>
                  <BuildTimeBadge time={selectedLead.estimated_build_time || '3-4 weeks'} />
                </div>
              </div>
              <button
                onClick={() => setSelectedLead(null)}
                className="text-textTertiary hover:text-textPrimary text-2xl"
              >
                ×
              </button>
            </div>

            {/* Sprint Countdown Timer */}
            <SprintCountdown 
              firstCompletionAt={selectedLead.firstCompletionAt || null}
              submissionWindowOpen={selectedLead.submissionWindowOpen || false}
            />

            <div className="space-y-6">
              {/* Location */}
              <div>
                <h3 className="text-lg font-medium mb-3 text-textPrimary">Location</h3>
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

              {/* Friction Type */}
              <div>
                <h3 className="text-lg font-medium mb-3 text-textPrimary">Primary Friction</h3>
                <div className="bg-slate-900 rounded-lg p-6 border-2 border-slate-700 shadow-lg">
                  <div className="text-white text-base leading-relaxed font-medium">
                    {selectedLead.friction_type}
                  </div>
                  <div className="mt-3 text-sm text-gray-300">
                    {selectedLead.time_on_task_estimate}
                  </div>
                </div>
              </div>

              {/* Proposed Solution */}
              <div>
                <h3 className="text-lg font-medium mb-3 text-textPrimary">Proposed Solution</h3>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-5 border-2 border-green-200 shadow-sm">
                  <div className="text-sm font-semibold text-green-900 mb-3 uppercase tracking-wide">
                    Technical Deliverables
                  </div>
                  <ul className="space-y-2.5 mb-4">
                    {seededShuffle(
                      getProposedSolutions(selectedLead.friction_type),
                      selectedLead.id
                    ).map((deliverable, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <svg 
                          className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" 
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
                        <span className="text-sm text-green-800 font-medium">{deliverable}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="pt-3 mt-3 border-t border-green-200">
                    <div className="flex items-center gap-2 text-xs text-green-600 font-medium">
                      <svg 
                        className="w-4 h-4 text-green-400" 
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

              {/* Squad Radar */}
              <div>
                <h3 className="text-lg font-medium mb-3 text-textPrimary">Squad Composition</h3>
                <div className="bg-gradient-to-r from-slate-50 to-emerald-50 rounded-lg p-4 border-2 border-emerald-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <svg className="w-5 h-5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
                      </svg>
                      <span className="text-sm font-semibold text-emerald-800">Team Members</span>
                    </div>
                    <span className="text-sm text-emerald-600 font-medium">
                      {selectedLead.activeBuilders?.length || 0}/3 Filled
                    </span>
                  </div>
                  
                  {/* Trio Slots */}
                  <div className="flex items-center gap-4">
                    {getSquadSlots(selectedLead).map((slot, idx) => (
                      <div key={idx} className="flex-1">
                        {slot.filled && slot.builder ? (
                          <div className="relative group">
                            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center text-white font-bold text-base shadow-lg">
                              {getInitials(slot.builder.name || 'UN')}
                            </div>
                            {/* Tooltip */}
                            <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1.5 bg-slate-800 text-white text-sm rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                              {slot.builder.name}
                            </div>
                          </div>
                        ) : (
                          <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center bg-white">
                            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sprint Info in Modal */}
              {selectedLead.activeBuilders && selectedLead.activeBuilders.length > 0 && (
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-medium mb-3 text-textPrimary">Active Builders</h3>
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-sm text-textSecondary">Builders in Sprint:</span>
                        <div className="flex items-center gap-2">
                          {selectedLead.activeBuilders.map((builder) => (
                            <div key={builder.userId} className="px-3 py-1 bg-cyan-100 text-cyan-800 rounded-full text-sm font-medium">
                              {builder.name} ({builder.checkpointsCompleted} checkpoints)
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Blueprint Synergy Link in Modal */}
              {(() => {
                const similarProject = hasSimilarBlueprintProject(selectedLead);
                
                return similarProject.exists ? (
                  <div className="p-3 bg-blue-50 rounded-lg border-2 border-blue-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z" />
                      </svg>
                      <div>
                        <div className="text-sm font-semibold text-blue-800">Blueprint Available</div>
                        <div className="text-xs text-blue-600">Similar project: {similarProject.projectName}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        router.push(`/library?project=${similarProject.projectId}`);
                        setSelectedLead(null);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                      View Base Logic
                    </button>
                  </div>
                ) : null;
              })()}

              {/* Contact Info for Winner */}
              {isCurrentUserWinner(selectedLead) && selectedLead.contact && (
                <div>
                  <h3 className="text-lg font-medium mb-3 text-textPrimary">Business Contact Information</h3>
                  <div className="bg-blue-50 rounded-lg p-5 border-2 border-blue-300 shadow-sm">
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        <div>
                          <div className="text-xs text-blue-600 uppercase tracking-wide font-medium">Owner Name</div>
                          <div className="text-lg font-semibold text-blue-900">{selectedLead.contact.owner_name}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                        <div>
                          <div className="text-xs text-blue-600 uppercase tracking-wide font-medium">Phone</div>
                          <div className="text-lg font-semibold text-blue-900">{selectedLead.contact.phone}</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Winner Message for Non-Winners */}
              {selectedLead.winnerUserId && !isCurrentUserWinner(selectedLead) && (
                <div className="bg-yellow-50 border-2 border-yellow-300 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">🏆</span>
                    <div>
                      <div className="font-semibold text-yellow-800">Winner Determined</div>
                      <div className="text-sm text-yellow-700 mt-1">
                        {getWinnerName(selectedLead) || 'Another builder'} has won this sprint. Keep building and try the next opportunity!
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Action Button */}
              <div>
                {isCurrentUserWinner(selectedLead) ? (
                  <button
                    onClick={() => {
                      if (selectedLead.contact) {
                        window.open(`tel:${selectedLead.contact.phone.replace(/\D/g, '')}`, '_self');
                      }
                    }}
                    className="w-full px-6 py-4 text-base font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-lg hover:shadow-xl"
                  >
                    Contact Business Owner
                  </button>
                ) : selectedLead.winnerUserId ? (
                  <div className="w-full px-6 py-4 text-base font-medium text-gray-500 bg-gray-100 rounded-lg text-center">
                    Winner: {getWinnerName(selectedLead) || 'Determined'}
                  </div>
                ) : (() => {
                  const filledSlots = selectedLead.activeBuilders?.length || 0;
                  const maxSlots = selectedLead.maxSlots || 4;
                  const availableSlots = maxSlots - filledSlots;
                  const isUserInSprint = getCurrentBuilder(selectedLead) !== null;
                  const isFull = availableSlots === 0;
                  const isFinalSlot = availableSlots === 1;
                  
                  if (isFull || isUserInSprint) {
                    return (
                      <div className={`w-full px-6 py-4 text-base font-semibold text-white rounded-lg transition-all shadow-lg ${
                        isUserInSprint || isFull ? 'bg-gray-400 cursor-not-allowed' : ''
                      }`}>
                        {isUserInSprint ? 'Already Joined Sprint' : 'Sprint Full'}
                      </div>
                    );
                  }
                  
                  return (
                    <div className="space-y-3">
                      {userTier >= 2 && (
                        <div className="p-3 bg-green-50 rounded border border-green-200">
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isTeamSprint}
                              onChange={(e) => {
                                setIsTeamSprint(e.target.checked);
                                if (!e.target.checked) setTeamSize(1);
                              }}
                              className="rounded text-green-600 focus:ring-green-500"
                            />
                            <span className="text-sm font-medium text-green-800">
                              Join as Team (Max {maxTeamSize} members)
                            </span>
                            <span className="ml-auto px-2 py-0.5 bg-green-600 text-white text-xs rounded-full">
                              Tier {userTier}
                            </span>
                          </label>
                          
                          {isTeamSprint && (
                            <div className="mt-2 flex items-center gap-2">
                              <label className="text-xs text-green-700">Team Size:</label>
                              <select
                                value={teamSize}
                                onChange={(e) => setTeamSize(Number(e.target.value))}
                                className="px-2 py-1 text-sm border border-green-300 rounded focus:ring-2 focus:ring-green-500"
                              >
                                {Array.from({ length: maxTeamSize }, (_, i) => i + 1).map(size => (
                                  <option key={size} value={size}>{size} member{size > 1 ? 's' : ''}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}
                      
                      <button
                        onClick={async () => {
                          await handleClaimProject(selectedLead.id);
                          setSelectedLead(null);
                        }}
                        className={`w-full px-6 py-4 text-base font-semibold text-white rounded-lg transition-all shadow-lg hover:shadow-xl ${
                          isFinalSlot
                            ? 'bg-orange-500 hover:bg-orange-600'
                            : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700'
                        }`}
                      >
                        {isFinalSlot ? 'Join Final Slot' : `Join Sprint${isTeamSprint ? ` (${teamSize} ${teamSize > 1 ? 'members' : 'member'})` : ''} (${filledSlots}/${maxSlots} Slots)`}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Deliverable Selection Modal */}
      {showDeliverableModal && pendingLeadId && (() => {
        const lead = data?.leads.find(l => l.id === pendingLeadId);
        if (!lead) return null;
        
        const deliverables = getDeliverables(lead.friction_type, pendingLeadId);
        const allDeliverableIds = deliverables.map(d => d.id);
        const hasDeliverables = deliverables.length > 0;
        
        return (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6 z-50"
            onClick={() => {
              setShowDeliverableModal(false);
              setPendingLeadId(null);
              setSelectedDeliverables([]);
              setIsTeamSprint(false);
              setTeamSize(1);
              setJoiningSprint(false);
            }}
          >
            <div
              className="bg-card border border-border rounded-lg p-8 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-semibold text-textPrimary mb-2">
                    Select Deliverables to Build
                  </h2>
                  <p className="text-sm text-textSecondary">
                    Choose the technical features you want to implement for <span className="font-medium">{lead.business_name}</span>.
                    You can select multiple deliverables.
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowDeliverableModal(false);
                    setPendingLeadId(null);
                    setSelectedDeliverables([]);
                    setIsTeamSprint(false);
                    setTeamSize(1);
                    setJoiningSprint(false);
                  }}
                  className="text-textTertiary hover:text-textPrimary text-2xl"
                >
                  ×
                </button>
              </div>

              {/* Team Sprint Toggle for Tier 2+ */}
              {userTier >= 2 && (
                <div className="mb-6 p-3 bg-green-50 rounded border border-green-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isTeamSprint}
                      onChange={(e) => {
                        setIsTeamSprint(e.target.checked);
                        if (!e.target.checked) setTeamSize(1);
                      }}
                      className="rounded text-green-600 focus:ring-green-500"
                    />
                    <span className="text-sm font-medium text-green-800">
                      Join as Team (Max {maxTeamSize} members)
                    </span>
                    <span className="ml-auto px-2 py-0.5 bg-green-600 text-white text-xs rounded-full">
                      Tier {userTier}
                    </span>
                  </label>
                  
                  {isTeamSprint && (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-xs text-green-700">Team Size:</label>
                      <select
                        value={teamSize}
                        onChange={(e) => setTeamSize(Number(e.target.value))}
                        className="px-2 py-1 text-sm border border-green-300 rounded focus:ring-2 focus:ring-green-500"
                      >
                        {Array.from({ length: maxTeamSize }, (_, i) => i + 1).map(size => (
                          <option key={size} value={size}>{size} member{size > 1 ? 's' : ''}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {hasDeliverables ? (
                <div className="space-y-3 mb-6">
                  {/* Select All checkbox */}
                  <label className="flex items-center gap-3 p-3 border-2 border-green-300 rounded-lg hover:bg-green-50 cursor-pointer bg-green-50">
                    <input
                      type="checkbox"
                      checked={selectedDeliverables.length === allDeliverableIds.length && allDeliverableIds.length > 0}
                      onChange={() => handleSelectAll(allDeliverableIds)}
                      className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-green-800">Select All Deliverables</div>
                      <div className="text-sm text-green-600">Build the complete project</div>
                    </div>
                  </label>

                  {/* Individual deliverables */}
                  {deliverables.map((deliverable) => (
                    <label
                      key={deliverable.id}
                      className={`flex items-start gap-3 p-4 border rounded-lg hover:bg-gray-50 cursor-pointer transition-colors ${
                        selectedDeliverables.includes(deliverable.id)
                          ? 'border-green-500 bg-green-50'
                          : 'border-gray-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDeliverables.includes(deliverable.id)}
                        onChange={() => toggleDeliverable(deliverable.id)}
                        className="mt-1 w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                      />
                      <div className="flex-1">
                        <div className="font-medium text-textPrimary mb-1">{deliverable.title}</div>
                        <div className="text-sm text-textSecondary mb-2">{deliverable.description}</div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Complexity:</span>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: 5 }, (_, i) => (
                              <div
                                key={i}
                                className={`w-2 h-2 rounded-full ${
                                  i < deliverable.complexity
                                    ? i < 2
                                      ? 'bg-green-500'
                                      : i === 2
                                      ? 'bg-blue-500'
                                      : 'bg-orange-500'
                                    : 'bg-gray-200'
                                }`}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              ) : (
                <div className="mb-6">
                  <label className="flex items-center gap-3 p-4 border-2 border-green-300 rounded-lg hover:bg-green-50 cursor-pointer bg-green-50">
                    <input
                      type="checkbox"
                      checked={selectedDeliverables.includes('full_project')}
                      onChange={() => toggleDeliverable('full_project')}
                      className="w-5 h-5 text-green-600 border-gray-300 rounded focus:ring-green-500"
                    />
                    <div className="flex-1">
                      <div className="font-semibold text-green-800">Full Project</div>
                      <div className="text-sm text-green-600">
                        No specific deliverables defined. You will build the complete project.
                      </div>
                    </div>
                  </label>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                  onClick={() => {
                    setShowDeliverableModal(false);
                    setPendingLeadId(null);
                    setSelectedDeliverables([]);
                    setIsTeamSprint(false);
                    setTeamSize(1);
                    setJoiningSprint(false);
                  }}
                  disabled={joiningSprint}
                >
                  Cancel
                </button>
                <button
                  className={`flex-1 px-4 py-2 text-sm font-semibold text-white rounded-md transition-all shadow-md hover:shadow-lg ${
                    selectedDeliverables.length === 0 || joiningSprint
                      ? 'bg-gray-400 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700'
                  }`}
                  disabled={selectedDeliverables.length === 0 || joiningSprint}
                  onClick={handleConfirmJoin}
                >
                  {joiningSprint ? (
                    'Joining...'
                  ) : (
                    `Join Sprint${isTeamSprint ? ` (${teamSize} ${teamSize > 1 ? 'members' : 'member'})` : ''} (${selectedDeliverables.length} ${selectedDeliverables.length === 1 ? 'deliverable' : 'deliverables'} selected)`
                  )}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Rules of Engagement Modal */}
      <RulesOfEngagementModal
        isOpen={showRulesModal}
        onClose={() => setShowRulesModal(false)}
      />
    </div>
  );
}
