import { Link } from 'react-router-dom';
import { LegalLinks } from '../components/LegalLinks';

const pageClass = 'min-h-screen bg-neutral-950 text-neutral-100 px-6 py-10';
export function PrivacyPage() {
  return <main className={pageClass}><article className="mx-auto max-w-2xl space-y-6 leading-relaxed">
    <h1 className="text-2xl font-bold">Burgonomics Partner privacy policy</h1>
    <p>This app supports restaurant operations for authorized operators. Your account identifies you and limits access to assigned branches and roles.</p>
    <h2 className="text-xl font-semibold">Information used by this app</h2>
    <p>We process your account name, email, user ID, assigned role and branches, and any phone number associated with your operator profile. Device notification tokens are used to send operational alerts. Support messages and operational actions you submit are associated with your account.</p>
    <p>Orders and customer contact details are available only for authorized operational work. Do not use or disclose this information for unrelated purposes.</p>
    <h2 className="text-xl font-semibold">Services and permissions</h2>
    <p>Google Firebase provides authentication, data storage, app integrity checks and notifications. Enabled payment, POS and delivery integrations process the information needed for their operational functions. Notification permission is optional and can be changed in device settings. The current partner app does not request device GPS, camera or photo access.</p>
    <h2 className="text-xl font-semibold">Account and data requests</h2>
    <p>Contact your organization administrator for access changes. For privacy, access or deletion requests, email <a className="underline" href="mailto:privacy@burgonomics.com">privacy@burgonomics.com</a>. Identify your operator account and organization; do not send your password. Operational records may need to be retained to meet legal and business obligations; ask for the applicable retention details.</p>
    <p>This notice covers the partner application, not the separate customer ordering application.</p>
    <LegalLinks />
    <Link className="inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-white" to="/login">Back to sign in</Link>
  </article></main>;
}

export function SupportPage() {
  return <main className={pageClass}><section className="mx-auto max-w-2xl space-y-6 leading-relaxed">
    <h1 className="text-2xl font-bold">Partner support</h1>
    <p>For account access or operational help, contact your organization administrator or email <a className="underline" href="mailto:support@burgonomics.com">support@burgonomics.com</a>. Include your branch and a description of the issue, never your password or payment credentials.</p>
    <Link className="inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-white" to="/tickets">Open support tickets (sign-in required)</Link>
    <LegalLinks />
    <Link className="inline-flex min-h-11 items-center underline focus-visible:outline-2 focus-visible:outline-white" to="/login">Back to sign in</Link>
  </section></main>;
}
