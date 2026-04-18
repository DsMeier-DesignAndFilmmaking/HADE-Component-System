"use client";

interface ReasoningListProps {
  reasoning: string[];
}

export function ReasoningList({ reasoning }: ReasoningListProps) {
  const visible = reasoning.length > 0 ? reasoning.slice(0, 3) : ["Understanding your context..."];

  return (
    <div className="hade-web-reasoning" aria-label="Why this suggestion">
      {visible.map((item) => (
        <div key={item} className="hade-web-reason-row">
          <span className="hade-web-dot" aria-hidden="true" />
          <p className="hade-web-reason-text">{item}</p>
        </div>
      ))}
    </div>
  );
}
