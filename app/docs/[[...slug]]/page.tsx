import Link from "next/link";
import { notFound } from "next/navigation";
import { DOCS, findDoc, href } from "@/components/docs/content";

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug ? d.slug.split("/") : [] }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug?: string[] }> }) {
  const doc = findDoc((await params).slug);
  return { title: doc ? `${doc.title} · Headwind docs` : "Headwind docs" };
}

export default async function DocPage({ params }: { params: Promise<{ slug?: string[] }> }) {
  const doc = findDoc((await params).slug);
  if (!doc) notFound();
  const i = DOCS.indexOf(doc);
  const prev = DOCS[i - 1];
  const next = DOCS[i + 1];
  return (
    <div className="doc">
      <article className="doc-body">
        <p className="eyebrow">{doc.group}</p>
        <h1>{doc.title}</h1>
        <p className="doc-lede">{doc.lede}</p>
        {doc.sections.map((s) => (
          <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`}>
            <h2 id={`${s.id}-h`}><a href={`#${s.id}`} className="anchor">{s.h}</a></h2>
            {s.body}
          </section>
        ))}
        <nav className="doc-pager" aria-label="Previous and next page">
          {prev ? <Link href={href(prev)}><span className="meta">Previous</span>{prev.title}</Link> : <span />}
          {next ? <Link href={href(next)} className="next"><span className="meta">Next</span>{next.title}</Link> : <span />}
        </nav>
      </article>
      {doc.sections.length > 1 && (
        <nav className="doc-toc" aria-label="On this page">
          <p className="eyebrow">On this page</p>
          <ul>{doc.sections.map((s) => <li key={s.id}><a href={`#${s.id}`}>{s.h}</a></li>)}</ul>
        </nav>
      )}
    </div>
  );
}
