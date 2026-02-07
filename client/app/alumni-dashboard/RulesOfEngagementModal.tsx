"use client";

interface RulesOfEngagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function RulesOfEngagementModal({ isOpen, onClose }: RulesOfEngagementModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-6 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white border border-gray-200 rounded-lg p-8 max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
              <svg
                className="w-6 h-6 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                />
              </svg>
            </div>
            <h2 className="text-3xl font-bold text-gray-900">Rules of Engagement</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-3xl leading-none transition-colors"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="space-y-6">
          {/* How the Sprint Engine Works */}
          <section>
            <h3 className="text-xl font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <span className="text-green-600">How the Sprint Engine Works</span>
            </h3>
            
            {/* Competitive Build Model */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-5 border-2 border-green-200 mb-4">
              <h4 className="text-lg font-semibold text-green-900 mb-2">Competitive Build Model</h4>
              <p className="text-gray-700 leading-relaxed">
                When you join a sprint, you&apos;re competing with other builders to earn the <span className="font-semibold text-green-700">&quot;Right to Outreach.&quot;</span> The winning builder gets to present their solution to the business owner.
              </p>
            </div>
          </section>

          {/* Scoring Formula */}
          <section>
            <h3 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <span className="text-green-600">Scoring Formula (Weighted)</span>
            </h3>
            <p className="text-gray-700 mb-4">Your final score is calculated as:</p>
            
            <div className="space-y-4">
              {/* Quality */}
              <div className="bg-white border-2 border-green-300 rounded-lg p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white font-bold text-lg">
                    50%
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900">Quality (50%)</h4>
                </div>
                <p className="text-gray-700 mb-2">Technical excellence, code quality, completeness</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 ml-2">
                  <li>Verified by Scout through proof of work review</li>
                  <li>Based on deliverable completion and implementation quality</li>
                </ul>
              </div>

              {/* Pace */}
              <div className="bg-white border-2 border-blue-300 rounded-lg p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold text-lg">
                    30%
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900">Pace (30%)</h4>
                </div>
                <p className="text-gray-700 mb-2">Speed to completion</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 ml-2">
                  <li>Measured from sprint join time to final submission</li>
                  <li>Faster completion = higher pace score</li>
                  <li className="font-semibold text-gray-800">Cap: Must finish within 48-hour submission window after first finalist</li>
                </ul>
              </div>

              {/* Scout Review */}
              <div className="bg-white border-2 border-purple-300 rounded-lg p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-lg">
                    20%
                  </div>
                  <h4 className="text-lg font-semibold text-gray-900">Scout Review (20%)</h4>
                </div>
                <p className="text-gray-700 mb-2">Professional presentation</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 ml-2">
                  <li>Clarity of documentation</li>
                  <li>Quality of demo/proof links</li>
                  <li>Communication and responsiveness</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Submission Window */}
          <section>
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-5">
              <h3 className="text-lg font-semibold text-blue-900 mb-3 flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-blue-600"
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
                Submission Window
              </h3>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>Opens when the <span className="font-semibold">FIRST builder</span> completes all 4 milestones</li>
                <li>Lasts for <span className="font-semibold">48 hours</span></li>
                <li>All finalists must submit within this window to qualify</li>
                <li className="text-red-600 font-semibold">Late submissions are disqualified</li>
              </ul>
            </div>
          </section>

          {/* Winner Selection */}
          <section>
            <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-lg p-5">
              <h3 className="text-lg font-semibold text-yellow-900 mb-3 flex items-center gap-2">
                <span className="text-2xl">🏆</span>
                Winner Selection
              </h3>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>Scout reviews all finalists after window closes</li>
                <li>Scores are calculated using the weighted formula</li>
                <li>Winner is announced and granted <span className="font-semibold text-green-700">&quot;Right to Outreach&quot;</span></li>
                <li>Winner can contact the business owner directly</li>
              </ul>
            </div>
          </section>

          {/* Fair Play */}
          <section>
            <div className="bg-gray-50 border-2 border-gray-300 rounded-lg p-5">
              <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                  />
                </svg>
                Fair Play
              </h3>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>All builders see the same technical brief</li>
                <li>No early access or unfair advantages</li>
                <li>Transparent scoring visible to all participants</li>
              </ul>
            </div>
          </section>
        </div>

        {/* Footer Button */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 text-base font-semibold text-white bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg hover:from-green-700 hover:to-emerald-700 transition-all shadow-md hover:shadow-lg"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
