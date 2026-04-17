import { JSX } from "react";

// Lightweight markdown renderer (headings, bold, code blocks, lists, paragraphs)
export function renderMarkdown(content: string) {
  const lines = content.split("\n");
  const elements: JSX.Element[] = [];
  let inCodeBlock = false;
  let codeLines: string[] = [];
  let key = 0;

  const processInline = (text: string) => {
    const parts = text.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) =>
      i % 2 === 1 ? <strong key={i} className="font-semibold">{part}</strong> : part
    );
  };

  for (const line of lines) {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={key++} className="my-3 rounded border border-border bg-muted/50 p-3 text-xs font-mono overflow-x-auto text-foreground">
            {codeLines.join("\n")}
          </pre>
        );
        codeLines = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.startsWith("# ")) {
      elements.push(<h1 key={key++} className="mt-6 mb-3 text-2xl font-bold font-heading text-foreground">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={key++} className="mt-5 mb-2 text-xl font-semibold font-heading text-foreground">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={key++} className="mt-4 mb-2 text-lg font-semibold font-heading text-foreground">{line.slice(4)}</h3>);
    } else if (line.startsWith("- ")) {
      elements.push(
        <div key={key++} className="flex gap-2 ml-4 my-0.5 text-sm text-foreground">
          <span className="text-muted-foreground">•</span>
          <span>{processInline(line.slice(2))}</span>
        </div>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={key++} className="h-2" />);
    } else {
      elements.push(<p key={key++} className="text-sm leading-relaxed text-foreground my-1">{processInline(line)}</p>);
    }
  }

  return elements;
}
