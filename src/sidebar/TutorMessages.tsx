import { MarkdownRenderer } from "../markdown/MarkdownRenderer";
import { isTruncated } from "../tutor/types";
import type { TutorMessage } from "../tutor/types";

interface TutorMessagesProps {
  messages: TutorMessage[];
  running: boolean;
  onRetry: (assistantId: string) => void;
  onContinue: (assistantId: string) => void;
  onSave: (assistantId: string) => void;
}

export function TutorMessages({
  messages,
  running,
  onRetry,
  onContinue,
  onSave,
}: TutorMessagesProps) {
  if (messages.length === 0) {
    return <div className="panel-empty">Ask a question about what you are reading.</div>;
  }

  return (
    <div className="tutor-messages">
      {messages.map((message) => {
        const assistant = message.role === "assistant";
        const hasContent = message.content.trim().length > 0;
        const renderMarkdown = assistant && hasContent && message.status !== "error";
        const complete = assistant && message.status === "complete" && hasContent;

        return (
          <div key={message.id} className={`tutor-message ${message.role}`}>
            <div
              className={
                "tutor-message-content" + (renderMarkdown ? " markdown" : "")
              }
            >
              {hasContent ? (
                renderMarkdown ? (
                  <MarkdownRenderer content={message.content} />
                ) : (
                  message.content
                )
              ) : message.status === "pending" ? (
                "Thinking…"
              ) : (
                ""
              )}
            </div>

            {assistant && message.status === "stopped" ? (
              <div className="tutor-status">Stopped</div>
            ) : null}

            {assistant && message.status === "error" ? (
              <div className="tutor-error">
                <span>{message.errorMessage ?? "Request failed"}</span>
                <button
                  type="button"
                  className="sidebar-action"
                  onClick={() => onRetry(message.id)}
                >
                  Retry
                </button>
              </div>
            ) : null}

            {complete && isTruncated(message) ? (
              <div className="tutor-truncated">
                <span>回答因长度限制被截断</span>
                <button
                  type="button"
                  className="sidebar-action"
                  disabled={running}
                  onClick={() => onContinue(message.id)}
                >
                  Continue
                </button>
              </div>
            ) : null}

            {complete ? (
              <div className="tutor-message-actions">
                {message.savedPageNoteId ? (
                  <span className="tutor-saved">Saved to Notes ✓</span>
                ) : (
                  <button
                    type="button"
                    className="tutor-action"
                    onClick={() => onSave(message.id)}
                  >
                    Save to Page Note
                  </button>
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
