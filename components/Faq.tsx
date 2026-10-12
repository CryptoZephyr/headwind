"use client";

import * as Accordion from "@radix-ui/react-accordion";
import { ChevronDown } from "lucide-react";

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <Accordion.Root type="multiple" className="faq">
      {items.map((it, i) => (
        <Accordion.Item key={i} value={`q${i}`} className="faq-item">
          <Accordion.Header asChild>
            <h3>
              <Accordion.Trigger className="faq-trigger">
                <span>{it.q}</span>
                <ChevronDown size={20} aria-hidden="true" className="faq-chev" />
              </Accordion.Trigger>
            </h3>
          </Accordion.Header>
          <Accordion.Content className="faq-content"><p>{it.a}</p></Accordion.Content>
        </Accordion.Item>
      ))}
    </Accordion.Root>
  );
}
