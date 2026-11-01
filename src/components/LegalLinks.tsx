import { Link } from 'react-router-dom';

export function LegalLinks() {
  return <nav aria-label="Privacy and support" className="flex flex-wrap gap-x-6 text-sm text-neutral-200">
    <Link to="/privacy" className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-white">Privacy policy</Link>
    <Link to="/support" className="inline-flex min-h-11 items-center underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-white">Support</Link>
  </nav>;
}
