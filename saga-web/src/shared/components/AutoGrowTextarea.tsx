import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from "react";

// A textarea that grows with its content — on a newline or when text wraps
// past the end of a line — instead of scrolling inside a fixed-height box.
export default function AutoGrowTextarea({
  minRows = 1,
  className = "",
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [rest.value]);

  return <textarea ref={ref} rows={minRows} className={`resize-none overflow-hidden ${className}`} {...rest} />;
}
