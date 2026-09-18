import type { LearnerSkillState, LearningStatus } from "./learning-evidence";

export type HomeFocusItem = {
  skill: string;
  note: string;
  strength: 1 | 2 | 3;
  label: string;
  status: LearningStatus;
};

const PRESENTATION: Record<LearningStatus, { strength: 1 | 2 | 3; label: string }> = {
  needs_revisit: { strength: 1, label: "Revisit" },
  building: { strength: 1, label: "Building" },
  review_due: { strength: 2, label: "Review due" },
  supported: { strength: 2, label: "With support" },
  independent_recent: { strength: 3, label: "Recent independent" },
  retained: { strength: 3, label: "Retained" },
};

export function homeFocusItems(states: readonly LearnerSkillState[]): HomeFocusItem[] {
  return states.map((state) => ({
    skill: state.label,
    note: state.evidenceNote,
    status: state.status,
    ...PRESENTATION[state.status],
  }));
}

