import Image from "next/image";
import Link from "next/link";
import { Faq } from "@/components/Faq";
import { SampleWalkthrough } from "@/components/SampleWalkthrough";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

const FAQ = [
  { q: "Who is Headwind for?", a: "Owners and finance leads at permanent-placement recruitment agencies, where cash depends on placement fees that land only when a candidate starts." },
  { q: "Does Headwind decide that a role is lost?", a: "No. A missing job listing or a company-wide hiring drop is a clue, not a verdict. A fee is only removed from the Reviewed forecast when agency records or a client reply support it. Unconfirmed roles become a question for the account manager." },
  { q: "Where does the evidence come from?", a: "Your imported CSV files (clients, roles, candidate stages, fees and cash figures), client replies you paste in, and public company and job-listing data from Crustdata. Every item shows its source and date." },
  { q: "What happens to my cash forecast?", a: "Headwind keeps three alternative scenarios for the same period: Original (your imported numbers), Reviewed (supported by evidence) and Downside (unconfirmed roles left out). It writes Reviewed and Downside to their own cfo.ai scenarios, reads them back to check, and never touches cfo.ai Main." },
  { q: "What if a review stops halfway?", a: "Finished steps are saved. The worker retries short failures on its own, and you can retry the unfinished steps without repeating the finished ones or double-writing to cfo.ai." },
  { q: "Is the sample on this page real?", a: "No. Northbeam Talent and its roles, candidates, fees and replies are made up. The sample review on this page runs in your browser and calls no outside service. In the live app's sample agency, the company hiring data is real and comes from Crustdata." },
  { q: "Is it ready for my agency?", a: "It runs one agency per install with one shared team password. It has been tested on a sample agency and a 40-company coverage check, not with a real agency's records yet. See Proof in the docs for what has and hasn't been shown." },
];

export default function Landing() {
  return (
    <>
      <a className="skip" href="#main">Skip to content</a>
      <SiteHeader />
      <main id="main">
        <section className="hero">
          <div className="wrap hero-inner">
            <h1 className="hero-title">Know which placement fees still hold before you count the cash.</h1>
            <p className="hero-sub">Headwind checks each open role every week against your records, client replies and public hiring data, then shows what it does to this month&apos;s closing cash.</p>
            <div className="btn-row hero-cta">
              <Link className="btn btn-primary" href="#sample">See a sample review</Link>
              <Link className="btn btn-secondary" href="/docs">Read the docs</Link>
            </div>
            <Image src="/brand/headwind-windsock-hero.png" alt="A blue windsock on a white pole, filled by the wind" width={1536} height={1024} priority className="hero-img" sizes="(max-width: 900px) 100vw, 900px" />
          </div>
        </section>

        <section className="band" aria-labelledby="problem-h">
          <div className="wrap split">
            <h2 id="problem-h">Expected fees aren&apos;t cash yet.</h2>
            <div className="stack">
              <p>An agency&apos;s forecast counts fees from candidates who haven&apos;t started. A client pauses hiring, a candidate takes another offer, or a role quietly goes cold, and the forecast is wrong before anyone notices.</p>
              <p className="muted">Headwind doesn&apos;t guess. It separates what the evidence supports from what still needs a client to confirm, and keeps the difference visible.</p>
            </div>
          </div>
        </section>

        <section id="sample" className="band band-white" aria-labelledby="sample-h">
          <div className="wrap stack">
            <p className="eyebrow">Sample review</p>
            <h2 id="sample-h">Three roles, three different answers</h2>
            <SampleWalkthrough />
          </div>
        </section>

        <section id="how" className="band" aria-labelledby="how-h">
          <div className="wrap stack">
            <p className="eyebrow">How it works</p>
            <h2 id="how-h">One review a week, one question per unclear role</h2>
            <ol className="steps">
              <li><span className="step-n">1</span><h3>Weekly review</h3><p>Every Monday, Headwind reads your imported roles, checks each client company and role listing on Crustdata, and applies fixed rules.</p></li>
              <li><span className="step-n">2</span><h3>Confirm with the client</h3><p>Roles the evidence can&apos;t settle get one neutral question, an owner and a due date. Paste the client&apos;s reply when it comes in.</p></li>
              <li><span className="step-n">3</span><h3>Updated forecast</h3><p>Only the affected role is reassessed. Reviewed and Downside are rewritten in cfo.ai and read back before they show as verified.</p></li>
            </ol>
          </div>
        </section>

        <section className="band band-white" aria-labelledby="ev-h">
          <div className="wrap split">
            <h2 id="ev-h">Evidence you can check, and runs that recover</h2>
            <ul className="facts">
              <li><strong>Every item is dated and sourced.</strong> Agency records, client replies and Crustdata data are labelled, with the source date kept apart from when Headwind fetched it.</li>
              <li><strong>Unclear companies are blocked, not guessed.</strong> If Crustdata returns several possible companies, none of their data is used.</li>
              <li><strong>History is kept.</strong> A new client reply creates a new decision version; earlier ones stay readable.</li>
              <li><strong>Stopped runs resume.</strong> Finished steps are saved, so a retry picks up where it stopped.</li>
            </ul>
          </div>
        </section>

        <section id="faq" className="band" aria-labelledby="faq-h">
          <div className="wrap split">
            <h2 id="faq-h">Questions</h2>
            <Faq items={FAQ} />
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
