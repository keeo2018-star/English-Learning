"use client";

import { useLayoutEffect, useRef } from "react";

export function VocabularyTitle({ text, fit = false }: { text: string; fit?: boolean }) {
  const title = useRef<HTMLHeadingElement>(null);
  const long = Array.from(text.trim()).length >= 44 || /\S{28,}/u.test(text);

  useLayoutEffect(() => {
    const element = title.current;
    if (!fit || !element || (long && /\s/u.test(text.trim()))) return;

    let active = true;
    function measure() {
      if (!active || !element) return;
      element.style.fontSize = "";
      element.style.whiteSpace = "nowrap";
      const range = document.createRange();
      range.selectNodeContents(element);
      const width = range.getBoundingClientRect().width;
      const available = element.clientWidth;
      const base = parseFloat(getComputedStyle(element).fontSize);
      if (available > 0 && width > available) {
        const minimum = parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.25;
        const size = Math.floor(base * available / width);
        element.style.fontSize = `${Math.max(minimum, size)}px`;
        if (size < minimum) element.style.whiteSpace = "";
      }
    }

    measure();
    const observer = new ResizeObserver(measure);
    if (element.parentElement) observer.observe(element.parentElement);
    void document.fonts.ready.then(measure);
    return () => {
      active = false;
      observer.disconnect();
      element.style.fontSize = "";
      element.style.whiteSpace = "";
    };
  }, [fit, long, text]);

  return <h2 ref={title} className="wb-vocabulary-title wb-learning-content" data-long={long || undefined}>{text}</h2>;
}
