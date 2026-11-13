import * as React from "react";
import Link from "@/components/link";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

const sections = [
  ["introduction", "Introduction"],
  ["information", "Information We Collect"],
  ["use", "How We Use Your Information"],
  ["account", "Account Registration and Authentication"],
  ["location", "Location and Parking Discovery"],
  ["vehicle", "Vehicle and Booking Information"],
  ["payments", "Payments and Financial Information"],
  ["payouts", "Bank Details and Host Payouts"],
  ["images", "Images and Uploaded Content"],
  ["cookies", "Cookies and Similar Technologies"],
  ["analytics", "Analytics and Google Analytics"],
  ["sharing", "Third-Party Services and Data Sharing"],
  ["security", "Data Security"],
  ["retention", "Data Retention"],
  ["deletion", "Account Deletion"],
  ["rights", "Your Privacy Rights"],
  ["children", "Children's Privacy"],
  ["changes", "Changes to This Privacy Policy"],
  ["contact", "Contact and Grievance Redressal"],
] as const;

export default function PrivacyPage() {
  React.useEffect(() => {
    document.title = "Privacy Policy · Place2Park";
    const description = document.querySelector('meta[name="description"]');
    const previous = description?.getAttribute("content") ?? "";
    description?.setAttribute(
      "content",
      "How Place2Park collects, uses, and keeps account, booking, payment, payout, and location information."
    );
    return () => {
      if (description) description.setAttribute("content", previous);
    };
  }, []);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
        <p className="text-sm font-medium text-brand-600">Place2Park</p>
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">Privacy Policy</h1>
        <p className="mt-3 text-sm text-muted">Last updated 14 November 2026. This page describes the public website at place2park.me.</p>
        <p className="mt-4 rounded-xl border border-line bg-page px-4 py-3 text-sm leading-6 text-ink">
          Publishing this page does not by itself mean Place2Park has completed every obligation under Indian privacy law. The legal name of the operator, its registered address, and a named grievance officer are not recorded in the product and are marked below for confirmation.
        </p>

        <nav aria-label="Privacy policy contents" className="mt-8 border-t border-line pt-6">
          <h2 className="text-sm font-semibold text-ink">Contents</h2>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {sections.map(([id, label], index) => (
              <li key={id}>
                <a href={`#${id}`} className="text-sm text-brand-600 hover:text-brand-700">
                  {index + 1}. {label}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-10 space-y-10 text-sm leading-6 text-ink">
          <section id="introduction" className="scroll-mt-24">
            <h2 className="font-display text-xl font-semibold text-ink">1. Introduction</h2>
            <p className="mt-3 text-muted">
              Place2Park is a parking marketplace. People can search for and book parking spaces. People who list a space can receive earnings from completed bookings. This policy explains the information the website and its API actually collect, and the providers that process it.
            </p>
            <p className="mt-3 text-muted">
              It is written with the Information Technology Act, 2000, the Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011, the Digital Personal Data Protection Act, 2023, and the Digital Personal Data Protection Rules, 2025 in mind. It is not a certificate of compliance.
            </p>
          </section>

          <section id="information" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">2. Information We Collect</h2>
            <p className="mt-3 text-muted">Depending on how you use Place2Park, the product stores:</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
              <li>Account details: name, email address, phone number, profile photo, account role, and the date the account was created.</li>
              <li>A password hash when you create a password. The password itself is not stored.</li>
              <li>A Google account identifier, and the name, email, and picture included in a verified Google sign-in token, when you use Google.</li>
              <li>Vehicle type, registration plate, and optional make and model.</li>
              <li>Saved listings, bookings, reviews, notifications, and support tickets or reports you submit.</li>
              <li>Listing details a host enters, including description, price, availability, photos, and map coordinates. The street address and access instructions are hidden from other people until a booking is confirmed.</li>
              <li>Payment status, amount, currency, Razorpay order and payment identifiers, and refund status for a booking.</li>
              <li>For hosts, the account holder name, bank name, IFSC, and bank account number used for payouts.</li>
              <li>A device location only when you allow the browser to share it, and the place you type or select while searching.</li>
            </ul>
          </section>

          <section id="use" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">3. How We Use Your Information</h2>
            <p className="mt-3 text-muted">
              Place2Park uses this information to create and sign you in to an account, show parking, take and manage bookings, calculate fees, process payments and refunds, record host earnings, send the verification and account emails the product sends, answer support requests, and limit abusive requests. Hosts can choose whether their name is shown on a public listing. A separate setting records whether marketing email is on. The product does not send a marketing programme beyond that preference.
            </p>
          </section>

          <section id="account" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">4. Account Registration and Authentication</h2>
            <p className="mt-3 text-muted">
              You can register with an email address and password, or with Google. A password registration sends a 6-digit email code. The account is created only after that code matches. The code is meant to expire after 5 minutes, and the pending registration after 15 minutes. A new code can be requested after 60 seconds. After several wrong attempts, that code stops working.
            </p>
            <p className="mt-3 text-muted">
              Signing in with a password, or with Google for an account that already exists, also requires one emailed code before a session is issued. A person who has not registered and chooses Google is asked to pick an account type before an account is created. Place2Park checks Google’s signed token on the server. It does not trust an email address or Google identifier sent by the browser on its own, and it does not attach Google sign-in to an existing password account.
            </p>
            <p className="mt-3 text-muted">
              Changing the email address on an account requires an emailed code. A password reset is also sent by email. The phone number is stored when you save your profile.
            </p>
          </section>

          <section id="location" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">5. Location and Parking Discovery</h2>
            <p className="mt-3 text-muted">
              Maps and place search use Google Maps, including Places. If you allow location in the browser, the map can centre near that position. If you do not allow it, you can still search by typing a place. A host’s listing stores coordinates. Other people see the area and city while a booking is unconfirmed. The street address and access instructions are shown after the booking is confirmed.
            </p>
          </section>

          <section id="vehicle" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">6. Vehicle and Booking Information</h2>
            <p className="mt-3 text-muted">
              A booking can include the start and end time, duration, vehicle type, vehicle plate, amounts, and status. An access code is stored for the booking and is shown when the booking is confirmed or later. You can save listings. Those saved places are tied to your account. The other person on a booking can see the information needed to provide the parking, such as the booking time and vehicle plate. They do not receive the other person’s payment gateway identifiers.
            </p>
          </section>

          <section id="payments" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">7. Payments and Financial Information</h2>
            <p className="mt-3 text-muted">
              Card and UPI checkout is handled by Razorpay. Place2Park does not store a complete card number or card security code. Those values are entered in Razorpay’s checkout. Place2Park keeps the booking amount, currency, payment status, Razorpay order identifier, Razorpay payment identifier, the payment method Razorpay reports, and refund status and amount where a refund is requested. The payment signature used to verify Razorpay’s message is not shown in the app.
            </p>
            <p className="mt-3 text-muted">
              A driver can cancel a pending or confirmed booking before it starts. A refund is available through the product when the cancellation is more than 60 minutes before the start time. Place2Park does not start an automatic bank transfer of host earnings.
            </p>
          </section>

          <section id="payouts" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">8. Bank Details and Host Payouts</h2>
            <p className="mt-3 text-muted">
              A host can add a bank account so parking earnings can be paid later. Place2Park collects the account holder name, bank name, IFSC, and account number. The account number is encrypted with AES-256-GCM before it is stored. In the app, the account is shown in a masked form, with the last four digits. Changing bank details that are already saved requires the account password. A Google account that has no password must set one before those details can be changed.
            </p>
            <p className="mt-3 text-muted">
              A payout record can keep a snapshot of the holder name, bank, IFSC, and last four digits for that payout. Access to the full account number is limited to the account holder’s own masked view and to authorised operator review. Place2Park does not publish the encryption key.
            </p>
          </section>

          <section id="images" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">9. Images and Uploaded Content</h2>
            <p className="mt-3 text-muted">
              Profile photos, listing photos, and images attached to a support ticket or report are accepted as JPEG, PNG, or WebP, up to 5 MB each. When Cloudinary is configured, those images are stored there. A listing photo that is uploaded and not attached to a listing can be removed after 24 hours. When an account is deleted, images the product recognises as belonging to that account are removed from Cloudinary when Cloudinary is configured.
            </p>
          </section>

          <section id="cookies" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">10. Cookies and Similar Technologies</h2>
            <p className="mt-3 text-muted">
              An ordinary Place2Park login is a signed token kept in the browser’s local storage. It is sent with requests to the API. There is no separate refresh-token store. The token is intended to last 7 days and is rejected when you sign out everywhere or when the account is deleted.
            </p>
            <p className="mt-3 text-muted">
              While you are finishing email verification or Google registration, a short-lived pending token is kept in session storage and removed after that step. A listing draft can be kept in local storage on that browser while a host is editing it. The public website does not use a cookie to sign an ordinary account in. A separate operator console uses its own cookie session. That console is not part of the public account.
            </p>
          </section>

          <section id="analytics" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">11. Analytics and Google Analytics</h2>
            <p className="mt-3 text-muted">
              On the public production website, Place2Park can load Google Analytics 4 when a measurement ID is configured. It is used to count page views and a small set of product events: sign-in and registration method, a parking search result count, a listing view, the start of a booking, and a confirmed booking value in rupees. Page addresses sent to Analytics omit the query string. Fields whose names look like a password, email, phone, token, bank detail, or similar value are dropped before an event is sent. Google signals and ad personalisation signals are turned off in the tag configuration.
            </p>
            <p className="mt-3 text-muted">
              The tag is not loaded outside production, on the operator console, when no measurement ID is set, or when the browser sends Do Not Track or Global Privacy Control. Place2Park does not show an analytics consent banner, does not use Google consent mode, and does not offer a settings switch to turn Analytics off.
            </p>
          </section>

          <section id="sharing" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">12. Third-Party Services and Data Sharing</h2>
            <p className="mt-3 text-muted">Place2Park uses these providers for the roles below. It does not sell account information.</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
              <li>Google Identity Services, to verify a Google sign-in.</li>
              <li>Google Maps and Places, to show the map and resolve a place you search for.</li>
              <li>Razorpay, to take checkout payments and process refunds.</li>
              <li>Cloudinary, when configured, to store uploaded images.</li>
              <li>Resend, when configured, to send email. If Resend is not configured, mail is sent through the SMTP server configured for Place2Park. Email is used for verification codes, password reset, and the account-deletion notice.</li>
              <li>Google Analytics 4, when enabled as described above.</li>
            </ul>
            <p className="mt-3 text-muted">
              Booking and listing information is shown to the other person on that booking to the extent described in this policy. Support requests are visible to the account that filed them and to operators handling support.
            </p>
          </section>

          <section id="security" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">13. Data Security</h2>
            <p className="mt-3 text-muted">
              Passwords are stored as a hash. Bank account numbers are encrypted with AES-256-GCM. Uploaded images are checked for type, size, and file signature. Requests are rate limited. The public site is served over HTTPS. These measures reduce risk. They are not a guarantee that unauthorised access cannot occur, and Place2Park does not claim a security certification in this policy.
            </p>
          </section>

          <section id="retention" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">14. Data Retention</h2>
            <p className="mt-3 text-muted">
              Email verification codes are intended to expire after 5 minutes, and an unfinished registration or login challenge after 15 minutes. An unattached listing photo can be removed after 24 hours. A login token is intended to last 7 days.
            </p>
            <p className="mt-3 text-muted">
              Booking, payment, refund, payout, and audit records can remain after other account data is removed, as described in account deletion. The application does not define a single statutory retention period for every record. A retention schedule required by tax or company law has to be confirmed outside this website.
            </p>
          </section>

          <section id="deletion" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">15. Account Deletion</h2>
            <p className="mt-3 text-muted">
              In Settings, under Account, you can delete the account by typing CONFIRM. Deletion does not proceed while a booking is still active, a refund is pending, a payout is still open, or host earnings have not been paid. When deletion proceeds, the account can no longer sign in. The product removes the user record, vehicles, saved places, notifications, and pending uploads. It clears personal text from reviews, reports, and support messages tied to that account, and it hides that host’s listings.
            </p>
            <p className="mt-3 text-muted">
              Booking amounts, payment records, and payout records can be kept. A payout snapshot can still contain the account holder name, bank, IFSC, and last four digits. A listing’s city, area, and coordinates can remain after the title, description, address, and photos are cleared. Deletion is not a promise that every related record disappears immediately.
            </p>
          </section>

          <section id="rights" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">16. Your Privacy Rights</h2>
            <p className="mt-3 text-muted">
              From Settings you can download a copy of your account, vehicles, saved places, bookings, payment status, and payout status. You can correct your name, phone, and vehicles on your profile, change your email after a code, and delete the account as described above. Hosts can hide their name on listings. You can turn the marketing-email preference on or off. To ask for a correction or to raise a privacy complaint that the product screens do not cover, use the contact below. Access and erasure through the product are limited to the signed-in account, and erasure does not extend to every retained financial or audit record.
            </p>
          </section>

          <section id="children" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">17. Children's Privacy</h2>
            <p className="mt-3 text-muted">
              Place2Park is a marketplace for booking and listing parking. It does not offer a children’s account, and it does not ask for or check a date of birth. If you believe a child’s personal information was submitted, contact the support address below so it can be reviewed.
            </p>
          </section>

          <section id="changes" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">18. Changes to This Privacy Policy</h2>
            <p className="mt-3 text-muted">
              If this policy changes, the updated text will be posted on this page with a new date. The page describes the product as built. A later product change can make part of this page incomplete until the page is updated.
            </p>
          </section>

          <section id="contact" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">19. Contact and Grievance Redressal</h2>
            <p className="mt-3 text-muted">
              Privacy and account questions can be sent to the support address already published in the product:{" "}
              <a href="mailto:support@place2park.me" className="font-medium text-brand-600">support@place2park.me</a>.
              You can also open <Link href="/support" className="font-medium text-brand-600">Support</Link>.
            </p>
            <p className="mt-3 text-muted">
              The following details are not established in the Place2Park website and need confirmation before this page is used as a formal legal notice: the legal name of the person or company that operates Place2Park, its registered address, and the name and contact of a grievance officer or Data Protection Officer.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
