import * as React from "react";
import Link from "@/components/link";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";

const sections = [
  ["introduction", "Introduction and Acceptance of Terms"],
  ["definitions", "Definitions"],
  ["eligibility", "Eligibility and Account Registration"],
  ["security", "Account Security and Responsibilities"],
  ["roles", "User Types and Marketplace Roles"],
  ["listings", "Parking Space Listings and Host Responsibilities"],
  ["booking", "Booking Process and Confirmation"],
  ["changes", "Booking Changes and Cancellations"],
  ["payments", "Payments and Payment Processing"],
  ["fees", "Platform Fees and Commission"],
  ["payouts", "Host Earnings and Manual Payouts"],
  ["refunds", "Refunds, Disputes and Payment Failures"],
  ["drivers", "Driver Responsibilities"],
  ["hosts", "Host Responsibilities"],
  ["prohibited", "Prohibited Activities"],
  ["reviews", "Reviews, Ratings and User Content"],
  ["availability", "Platform Availability and Maintenance"],
  ["suspension", "Account Suspension and Termination"],
  ["deletion", "Account Deletion and Data Retention"],
  ["liability", "Limitation of Liability"],
  ["indemnity", "Indemnification"],
  ["ip", "Intellectual Property"],
  ["third-parties", "Third-Party Services"],
  ["changes-terms", "Changes to These Terms"],
  ["law", "Governing Law and Jurisdiction"],
  ["contact", "Contact and Grievance Redressal"],
] as const;

export default function TermsPage() {
  React.useEffect(() => {
    document.title = "Terms and Conditions · Place2Park";
    const description = document.querySelector('meta[name="description"]');
    const previous = description?.getAttribute("content") ?? "";
    description?.setAttribute(
      "content",
      "Terms for booking and listing parking on Place2Park, including fees, cancellations, refunds, and manual host payouts."
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
        <h1 className="mt-2 font-display text-3xl font-bold tracking-tight text-ink sm:text-4xl">Terms and Conditions</h1>
        <p className="mt-3 text-sm text-muted">Last updated 14 November 2026. This page describes the public website at place2park.me.</p>
        <p className="mt-4 rounded-xl border border-line bg-page px-4 py-3 text-sm leading-6 text-ink">
          Publishing these terms does not by itself mean Place2Park has completed every obligation under Indian law. The legal name of the operator, its registered address, the courts that would hear a dispute, and a named grievance officer are not recorded in the product and are marked below for confirmation.
        </p>

        <nav aria-label="Terms and conditions contents" className="mt-8 border-t border-line pt-6">
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
            <h2 className="font-display text-xl font-semibold text-ink">1. Introduction and Acceptance of Terms</h2>
            <p className="mt-3 text-muted">
              Place2Park is a parking marketplace. A person can search for a parking space and book it. A person who lists a space can receive earnings from a completed booking. The person who books parks their own vehicle and keeps their keys.
            </p>
            <p className="mt-3 text-muted">
              These terms describe the booking, payment, cancellation, refund, payout, and account behaviour that the website and its API implement. Signup, Google registration, and sign-in do not show a terms checkbox, and the product does not store a record that a person accepted this page. Reading this page is how a person can see the rules before they book or list a space.
            </p>
            <p className="mt-3 text-muted">
              The description is written with the Information Technology Act, 2000, the Indian Contract Act, 1872, the Consumer Protection Act, 2019, the Consumer Protection (E-Commerce) Rules, 2020, and the Digital Personal Data Protection Act, 2023, in mind. It is not a certificate that every obligation under those laws has been met.
            </p>
          </section>

          <section id="definitions" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">2. Definitions</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
              <li>A seeker is an account with the role used for finding parking.</li>
              <li>A provider, shown in the product as a Keeper, is an account with the role used for listing parking.</li>
              <li>An all-rounder is an account that can both find parking and list a space.</li>
              <li>A listing is a parking space a provider or all-rounder submits, including its price, photos, availability, and location.</li>
              <li>The parking fee is the time-based price of the space, before the driver service fee and before the host commission.</li>
              <li>The driver service fee is 5% of the parking fee, added to what the driver pays.</li>
              <li>The host commission is 10% of the parking fee, deducted from what the host earns. The product stores this amount as the platform fee.</li>
              <li>A booking is a reservation for one listing, one start time, and one allowed duration.</li>
              <li>Razorpay is the payment service that takes checkout payments and processes refunds.</li>
              <li>A payout is a manual record of host earnings that an operator reviews. It is not an automatic bank transfer.</li>
            </ul>
          </section>

          <section id="eligibility" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">3. Eligibility and Account Registration</h2>
            <p className="mt-3 text-muted">
              Creating an account is free. A person can register with an email address and a password, or with Google. A password registration sends a 6-digit email code, and the account is created only after that code matches. A new Google user chooses seeker, provider, or all-rounder before the account is created. Signing in to an existing account, including with Google, requires one emailed code before a session is issued. An existing account’s role is not changed by a later Google sign-in.
            </p>
            <p className="mt-3 text-muted">
              The product stores the name, email address, chosen role, and, when the profile is saved, a phone number. It does not ask for a date of birth and it does not check age. A password account is not automatically linked to Google.
            </p>
          </section>

          <section id="security" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">4. Account Security and Responsibilities</h2>
            <p className="mt-3 text-muted">
              The password is stored as a hash. After a successful code, the session is a signed token kept in the browser for up to 7 days. The person using the account is responsible for that browser and for the email address that receives sign-in codes. A password can be reset by email, and changing the account email requires an emailed code.
            </p>
            <p className="mt-3 text-muted">
              A suspended account cannot sign in. The product tells that person to contact support.
            </p>
          </section>

          <section id="roles" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">5. User Types and Marketplace Roles</h2>
            <p className="mt-3 text-muted">
              A seeker can search, save listings, book, pay, cancel within the rules below, and review a completed booking. A provider can create and manage listings, see bookings on those listings, add bank details, and request a payout. An all-rounder can do both. A person cannot book their own listing.
            </p>
            <p className="mt-3 text-muted">
              Place2Park provides the marketplace, the booking record, and the payment and payout records. The provider makes the space available. Place2Park does not park the vehicle and does not take the keys.
            </p>
          </section>

          <section id="listings" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">6. Parking Space Listings and Host Responsibilities</h2>
            <p className="mt-3 text-muted">
              A listing includes the description, hourly price, allowed durations, availability, photos, and map location entered by the provider. The hourly price must be from ₹10 to ₹1,000. Photos are JPEG, PNG, or WebP, up to 5 MB each, and a listing can have up to 8. Publishing requires confirmation that drivers park their own vehicles and that the provider will not request keys.
            </p>
            <p className="mt-3 text-muted">
              On the production website, a listing submitted for publication waits for operator review before it can be booked, unless that review requirement has been turned off for the platform. A listing can be left as a draft, paused, rejected, or hidden. Only a listing the product treats as bookable appears in public search.
            </p>
            <p className="mt-3 text-muted">
              The street address and access instructions stay hidden until a booking is confirmed, in progress, or completed. Search can show the area and the map position used to discover the space.
            </p>
          </section>

          <section id="booking" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">7. Booking Process and Confirmation</h2>
            <p className="mt-3 text-muted">
              A booking needs a bookable listing, a start time, a vehicle type, and a vehicle number. The allowed durations are 1, 2, 3, 4, 6, 8, 12, or 24 hours, and the listing can set a shorter range inside that list. A booking can start up to 30 days ahead, and only inside the listing’s available hours and outside its blocked dates.
            </p>
            <p className="mt-3 text-muted">
              The price is calculated on the server from the listing’s stored hourly price. The amount the driver pays is not taken from the browser. Creating a booking places it in a pending hold for 12 minutes and reserves that time on the listing. The product checks for another booking on the same space and time before the hold is saved, and it checks again after the hold is saved. If two holds overlap, the later one is removed. A person cannot hold their own listing.
            </p>
            <p className="mt-3 text-muted">
              The booking is confirmed after Razorpay reports a captured payment and Place2Park verifies that payment, as described below. An access code is stored for the booking and is shown when the booking is confirmed or later. When the start time arrives, a confirmed booking is treated as in progress. When the end time passes, it is treated as completed. Those changes follow the clock. They are not a separate approval step.
            </p>
          </section>

          <section id="changes" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">8. Booking Changes and Cancellations</h2>
            <p className="mt-3 text-muted">
              The product does not offer a way to move a booking to a different time or listing. A different time needs a new booking if the space is still free.
            </p>
            <p className="mt-3 text-muted">
              The person who made the booking can cancel it while it is pending, or while it is confirmed and the start time is still in the future. A confirmed booking cannot be cancelled after it has started. A booking that is in progress, completed, or expired cannot be cancelled through this action. The provider does not have a separate cancel control for the driver’s booking.
            </p>
            <p className="mt-3 text-muted">
              An unpaid pending hold ends after 12 minutes if it is not confirmed. The time slot can then be booked by someone else. If a payment is verified after that hold has ended, Place2Park confirms the booking only when the slot is still free. If another booking already occupies the slot, Place2Park does not confirm over it and instead requests a refund of the stored amount.
            </p>
          </section>

          <section id="payments" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">9. Payments and Payment Processing</h2>
            <p className="mt-3 text-muted">
              Checkout is handled by Razorpay. Card and UPI details are entered in Razorpay’s checkout. Place2Park does not store a complete card number or card security code. Place2Park keeps the amount, currency, Razorpay order identifier, payment identifier, the method Razorpay reports, the payment status, and any refund status.
            </p>
            <p className="mt-3 text-muted">
              The amount charged is the amount stored for that booking. After checkout, Place2Park checks Razorpay’s signature and reads the payment back from Razorpay. The amount and currency must match the stored payment before the booking is confirmed. Razorpay can also send a signed notification of a captured payment, a failed payment, or a refund update. A captured payment is confirmed or refunded through the same settlement rules. A failed-payment notification marks that payment attempt as failed and leaves the booking pending, so the driver can try again before the 12-minute hold ends.
            </p>
            <p className="mt-3 text-muted">
              Closing the checkout window leaves the reservation unpaid. A timeout, or no response, while Place2Park is checking Razorpay does not by itself mark the payment as failed. The driver can try verification again while the hold is still open. Until a payment is verified, or the hold ends, the booking stays unpaid.
            </p>
          </section>

          <section id="fees" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">10. Platform Fees and Commission</h2>
            <p className="mt-3 text-muted">
              The parking fee is the hourly price multiplied by the booked hours, rounded to the nearest paise. The driver service fee is 5% of that parking fee, rounded to the nearest paise, and it is added to the driver’s total. The host commission is 10% of the same parking fee, rounded to the nearest paise, and it is deducted from the host’s earning. The host earning is the parking fee minus that commission.
            </p>
            <p className="mt-3 text-muted">
              For a space priced at ₹100 an hour and booked for 2 hours, the parking fee is ₹200, the driver service fee is ₹10, and the driver pays ₹210. The host commission is ₹20, and the host earning is ₹180. Amounts already saved on an older booking stay as they were at checkout. The quote does not add another marketplace fee. It also does not calculate a tax. Whether any tax must be charged is not decided by this page and needs confirmation.
            </p>
          </section>

          <section id="payouts" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">11. Host Earnings and Manual Payouts</h2>
            <p className="mt-3 text-muted">
              Host earnings are paid manually. Place2Park does not send an automatic bank transfer when a booking ends. A completed booking can be included in a payout when its payment is paid, it is not refunded, a refund is not still pending, and it is not already attached to a payout. The payout amount is the host earning stored on those bookings.
            </p>
            <p className="mt-3 text-muted">
              A provider or all-rounder adds the account holder name, bank name, IFSC, and account number in Settings. The account number is encrypted. The screen shows the last four digits. An operator must verify those bank details before a payout can be requested. Requesting a payout creates a record for review. An operator can approve it, mark it as being processed, mark it paid with a payment reference, reject it, or mark it failed. None of those steps is an automatic transfer by the website, and the product does not promise a date by which the money will reach the bank.
            </p>
          </section>

          <section id="refunds" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">12. Refunds, Disputes and Payment Failures</h2>
            <p className="mt-3 text-muted">
              If a paid booking is cancelled more than 60 minutes before it starts, Place2Park requests a refund of the stored payment amount through Razorpay. The booking is not marked refunded only because the request was sent. It stays pending until Razorpay confirms the refund, or it is marked failed when Razorpay reports a definite failure. The cancellation screen says a requested refund can take a few days to appear. That sentence is a product message. It is not a guaranteed date.
            </p>
            <p className="mt-3 text-muted">
              A confirmed booking can still be cancelled in the last 60 minutes before it starts, and the product does not request a refund for that cancellation. An unpaid cancellation does not refund money that was not captured. If the connection to Razorpay times out while a refund is being requested, the refund stays pending and is not treated as failed only because the response was missing. The person can be asked to try again.
            </p>
            <p className="mt-3 text-muted">
              A payment problem, a missing space, or other booking trouble can be sent through Support or through a report on the booking. Report categories include a payment dispute, a space that was unavailable, and no access. Opening a ticket or a report records the complaint for an operator to read. It does not by itself start a refund or a payout, and the product does not decide a dispute on a fixed timetable.
            </p>
          </section>

          <section id="drivers" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">13. Driver Responsibilities</h2>
            <p className="mt-3 text-muted">
              The driver parks their own vehicle and keeps the keys. The vehicle number on the booking should match the vehicle that uses the space. The driver uses the space for the booked time and follows the access instructions once the booking is confirmed. The driver does not hand the vehicle to the provider for valet parking. Place2Park does not insure the vehicle.
            </p>
          </section>

          <section id="hosts" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">14. Host Responsibilities</h2>
            <p className="mt-3 text-muted">
              The provider or all-rounder is responsible for the listing being accurate and for the space being available at the booked time. They confirm self-parking and do not ask for the driver’s keys. They keep the availability, price, photos, and access instructions current, and they provide bank details that match the account that should receive a manual payout. They do not book their own listing.
            </p>
          </section>

          <section id="prohibited" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">15. Prohibited Activities</h2>
            <p className="mt-3 text-muted">
              A person must not book their own listing, publish a listing that asks drivers to hand over keys, or present a space, price, or photo that they know is false. A person must not use another person’s account, interfere with checkout, or send a payment confirmation that did not come from Razorpay. Listing reports can record incorrect information, an unsafe space, fraud, or a space that was unavailable. User reports can record misconduct, an unauthorised vehicle, overstaying, or property damage. Those reports are records for review. This page does not create a separate penalty schedule.
            </p>
          </section>

          <section id="reviews" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">16. Reviews, Ratings and User Content</h2>
            <p className="mt-3 text-muted">
              The driver who made a booking can leave one review after that booking is completed. The rating is a whole number from 1 to 5, and the comment can be up to 1,000 characters. The listing shows the average of those ratings. Photos, review text, and support messages are stored so the marketplace can show the listing, the review, or the support case. The product does not ask for a separate copyright assignment.
            </p>
            <p className="mt-3 text-muted">
              If the account is later deleted, the review comment is cleared and the rating can remain on the listing. Support text the person wrote can also be cleared, as described in the Privacy Policy.
            </p>
          </section>

          <section id="availability" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">17. Platform Availability and Maintenance</h2>
            <p className="mt-3 text-muted">
              Search, maps, checkout, and email depend on Place2Park and on the providers named below. A map, a payment screen, or an email code can be unavailable for a time. A pending hold still expires after 12 minutes. The product does not promise that the website will be available at every moment, and it does not offer a service credit for downtime.
            </p>
          </section>

          <section id="suspension" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">18. Account Suspension and Termination</h2>
            <p className="mt-3 text-muted">
              An operator can mark an account suspended. A suspended account cannot sign in. The product message tells the person to contact support. Suspension is separate from deletion. A person can also stop using the account, or delete it when the deletion rules below allow it. Listings can be rejected or hidden by an operator.
            </p>
            <p className="mt-3 text-muted">
              This page does not list every reason an operator may suspend an account. A suspension does not by itself delete bookings, payments, or payout records.
            </p>
          </section>

          <section id="deletion" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">19. Account Deletion and Data Retention</h2>
            <p className="mt-3 text-muted">
              In Settings, under Account, a person can delete the account by typing CONFIRM. Deletion does not run while a booking is pending, confirmed, or in progress, while a refund is pending, while a payout is still open, or while host earnings on a completed paid booking are still unpaid. The screen shows the reason.
            </p>
            <p className="mt-3 text-muted">
              When deletion proceeds, the account, its vehicles, saved listings, and notifications are removed, and the person can no longer sign in. Booking amounts, payment records, payout records, and an audit record of the deletion can be kept. A payout snapshot can still contain the account holder name, bank, IFSC, and last four digits. A removed listing can still keep its city, area, and map coordinates. Deletion is not a promise that every record disappears immediately. The Privacy Policy describes the same process.
            </p>
          </section>

          <section id="liability" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">20. Limitation of Liability</h2>
            <p className="mt-3 text-muted">
              Place2Park lets a driver and a provider make a booking and records the payment and payout connected to it. The provider is responsible for the space. The driver is responsible for the vehicle and for parking it. Place2Park does not guarantee that a space will be exactly as photographed, that a vehicle will be free from damage or theft, or that a payout will arrive on a particular day.
            </p>
            <p className="mt-3 text-muted">
              Nothing on this page removes a right that the Consumer Protection Act, 2019, or another applicable law, does not allow to be given up. This section has not been certified as an enforceable waiver. The legal operator who would be responsible in a claim is one of the details that still needs confirmation.
            </p>
          </section>

          <section id="indemnity" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">21. Indemnification</h2>
            <p className="mt-3 text-muted">
              A provider is responsible for the listing they publish and for having the right to offer that space. A driver is responsible for the vehicle they bring and for using the space only as booked. A person who submits a report, a review, or a support message is responsible for what they write.
            </p>
            <p className="mt-3 text-muted">
              The product does not collect a separate indemnity agreement at signup. Whether a court would require one user to cover another person’s loss is not decided by this page and should be confirmed with a lawyer before these words are treated as a formal indemnity.
            </p>
          </section>

          <section id="ip" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">22. Intellectual Property</h2>
            <p className="mt-3 text-muted">
              The Place2Park name, the site, and the product copy are used to operate the marketplace. Photos, listing text, and reviews are supplied by users and are shown for that listing, profile, review, or support request. Uploading a photo does not transfer a written copyright assignment, because the product does not ask for one. A person should upload only images and text they have the right to use.
            </p>
          </section>

          <section id="third-parties" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">23. Third-Party Services</h2>
            <p className="mt-3 text-muted">Place2Park uses these providers for the roles below.</p>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-muted">
              <li>Razorpay, to take checkout payments and process refunds.</li>
              <li>Google Identity Services, to verify a Google sign-in.</li>
              <li>Google Maps and Places, to show the map and resolve a place search.</li>
              <li>Cloudinary, when configured, to store uploaded images. A development setup can store images locally when Cloudinary is not configured.</li>
              <li>Resend, when configured, to send email. If Resend is not configured, mail is sent through the SMTP server configured for Place2Park.</li>
              <li>Google Analytics 4, on the public production site, when a measurement ID is configured. The Privacy Policy describes when that tag stays off.</li>
            </ul>
            <p className="mt-3 text-muted">
              Those providers process the information needed for their role. Their own terms apply to the checkout page, the map, or the sign-in window they show. Place2Park does not control Razorpay’s checkout availability.
            </p>
          </section>

          <section id="changes-terms" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">24. Changes to These Terms</h2>
            <p className="mt-3 text-muted">
              If these terms change, the updated text will be posted on this page with a new date. The product does not currently ask a person to accept the new text again, and it does not store an acceptance date. A booking keeps the amounts that were saved when it was created. A later change to the fee percentages applies to a new quote, not by rewriting an old booking.
            </p>
          </section>

          <section id="law" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">25. Governing Law and Jurisdiction</h2>
            <p className="mt-3 text-muted">
              These terms are written for a service offered in India and are intended to be read with Indian law, including the statutes named in the introduction. The product does not record a registered office, a chosen city, or a court. Those details need confirmation before this page is used as a formal choice of law or jurisdiction.
            </p>
          </section>

          <section id="contact" className="scroll-mt-24 border-t border-line pt-8">
            <h2 className="font-display text-xl font-semibold text-ink">26. Contact and Grievance Redressal</h2>
            <p className="mt-3 text-muted">
              Booking, payment, payout, and account questions can be sent to the support address already published in the product:{" "}
              <a href="mailto:support@place2park.me" className="font-medium text-brand-600">support@place2park.me</a>.
              You can also open <Link href="/support" className="font-medium text-brand-600">Support</Link>.
              How personal information is handled is described in the <Link href="/privacy-policy" className="font-medium text-brand-600">Privacy Policy</Link>.
            </p>
            <p className="mt-3 text-muted">
              The following details are not established in the Place2Park website and need confirmation before this page is used as a formal legal notice: the legal name of the person or company that operates Place2Park, any company registration number, its registered address, the city or court for disputes, and the name and contact of a grievance officer.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
