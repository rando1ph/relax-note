import { forwardRef } from "react";

interface TutorComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  running: boolean;
  disabled: boolean;
}

export const TutorComposer = forwardRef<HTMLTextAreaElement, TutorComposerProps>(
  function TutorComposer({ value, onChange, onSend, onStop, running, disabled }, ref) {
    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        if (!disabled && !running && value.trim()) onSend();
      }
    };

    return (
      <div className="tutor-composer">
        <textarea
          ref={ref}
          className="tutor-composer-input"
          value={value}
          placeholder="Ask about this passage…"
          rows={2}
          onChange={(event) => onChange(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
        />
        <div className="tutor-composer-actions">
          {running ? (
            <button
              type="button"
              className="sidebar-action destructive"
              onClick={onStop}
            >
              Stop
            </button>
          ) : (
            <button
              type="button"
              className="sidebar-action primary"
              onClick={onSend}
              disabled={disabled || !value.trim()}
            >
              Send
            </button>
          )}
        </div>
      </div>
    );
  },
);
