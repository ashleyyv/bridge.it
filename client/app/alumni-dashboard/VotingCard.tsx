"use client";

import { useState } from "react";
import VotingPanel from "./VotingPanel";

export default function VotingCard() {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-white rounded-xl shadow-md border-2 border-cyan-100 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 px-6 py-4 text-left hover:from-cyan-700 hover:to-teal-700 transition-colors"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <svg
              className={`w-5 h-5 text-white flex-shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <span aria-hidden>🗳️</span>
              Vote on finalist builds
            </h2>
          </div>
        </div>
        <p className="text-sm text-cyan-100 mt-1 ml-7">
          Projects with 2+ builders who completed all milestones appear here. Vote on each build’s final submission; rate 1–5.
        </p>
      </button>
      {expanded && (
        <div className="p-6">
          <VotingPanel />
        </div>
      )}
    </div>
  );
}
