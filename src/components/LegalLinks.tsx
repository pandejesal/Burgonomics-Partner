import { Link, useInRouterContext } from 'react-router-dom';

export function LegalLinks() {
  const inRouter = useInRouterContext();
  return <nav aria-label="Privacy and support" className="flex flex-wrap gap-x-6 text-sm text-neutral-200">
    {inRouter ? <Link to="/privacy" className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-white">Privacy policy</Link> : <a href="/privacy" className="inline-flex min-h-11 items-center underline">Privacy policy</a>}
    {inRouter ? <Link to="/support" className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-white">Support</Link> : <a href="/support" className="inline-flex min-h-11 items-center underline">Support</a>}
  </nav>;
}
