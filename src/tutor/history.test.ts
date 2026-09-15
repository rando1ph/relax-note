import { describe, expect, it } from "vitest";
import { completedTurns, trimTutorHistory } from "./history";
import type { TutorMessage } from "./types";

function user(id: string, content: string): TutorMessage {
  return { id, role: "user", content, createdAt: 0, status: "complete", errorMessage: null, request: null };
}

function assistant(id: string, content: string, status: TutorMessage["status"] = "complete"): TutorMessage {
  return { id, role: "assistant", content, createdAt: 0, status, errorMessage: null, request: null };
}

describe("completedTurns", () => {
  it("keeps only complete user/assistant pairs", () => {
    const messages = [
      user("u1", "q1"),
      assistant("a1", "a1"),
      user("u2", "q2"),
      assistant("a2", "", "pending"),
      user("u3", "q3"),
    ];
    expect(completedTurns(messages)).toHaveLength(1);
  });
});

describe("trimTutorHistory", () => {
  it("caps the number of turns, keeping the most recent", () => {
    const messages: TutorMessage[] = [];
    for (let i = 0; i < 8; i++) {
      messages.push(user(`u${i}`, `question ${i}`));
      messages.push(assistant(`a${i}`, `answer ${i}`));
    }
    const result = trimTutorHistory(messages, { maxTurns: 6, maxChars: 1_000_000 });
    expect(result).toHaveLength(12);
    expect(result[0].content).toBe("question 2");
    expect(result[result.length - 1].content).toBe("answer 7");
  });

  it("drops the oldest turns to respect the char budget", () => {
    const messages = [
      user("u1", "A".repeat(4000)),
      assistant("a1", "B".repeat(4000)),
      user("u2", "C".repeat(4000)),
      assistant("a2", "D".repeat(4000)),
    ];
    const result = trimTutorHistory(messages, { maxTurns: 6, maxChars: 9000 });
    // Each remaining turn is 8000 chars; two turns would be 16000 > 9000.
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("C".repeat(4000));
    expect(result[1].content).toBe("D".repeat(4000));
  });

  it("excludes pending/failed assistant turns and their unanswered user", () => {
    const messages = [
      user("u1", "q1"),
      assistant("a1", "a1"),
      user("u2", "q2"),
      assistant("a2", "", "error"),
    ];
    const result = trimTutorHistory(messages);
    expect(result.map((m) => m.content)).toEqual(["q1", "a1"]);
  });

  it("stays under the Rust MAX_MESSAGES bound", () => {
    const messages: TutorMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push(user(`u${i}`, `q ${i}`));
      messages.push(assistant(`a${i}`, `a ${i}`));
    }
    const result = trimTutorHistory(messages);
    // 6 turns * 2 + system + current user = 14 <= 16.
    expect(result.length).toBeLessThanOrEqual(12);
  });

  it("merges continuation messages into a single history turn", () => {
    const messages: TutorMessage[] = [
      user("u1", "q1"),
      assistant("a1", "part1"),
      { ...assistant("a2", "part2"), continuationOf: "a1" },
    ];
    const result = trimTutorHistory(messages);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("q1");
    expect(result[1].content).toBe("part1\n\npart2");
  });
});
