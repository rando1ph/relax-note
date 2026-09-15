export interface QuickAction {
  id: string;
  label: string;
  question: string;
}

export const TUTOR_QUICK_ACTIONS: QuickAction[] = [
  { id: "explain", label: "Explain", question: "Explain this passage." },
  { id: "simplify", label: "Simplify", question: "Simplify this passage." },
  { id: "why", label: "Why?", question: "Why is this important?" },
  { id: "key-points", label: "Key points", question: "What are the key points of this passage?" },
];

interface TutorQuickActionsProps {
  onAction: (question: string) => void;
}

export function TutorQuickActions({ onAction }: TutorQuickActionsProps) {
  return (
    <div className="tutor-quick-actions">
      {TUTOR_QUICK_ACTIONS.map((action) => (
        <button
          key={action.id}
          type="button"
          className="tutor-quick-action"
          onClick={() => onAction(action.question)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
