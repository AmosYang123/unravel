import { releaseConfig } from "@/lib/release-config";

export default function SupportContact() {
  return (
    <section className="mt-8">
      <h2 className="text-xl font-semibold">Contact</h2>
      {releaseConfig.ownerName && <p className="mt-3">App owner: {releaseConfig.ownerName}</p>}
      {releaseConfig.supportEmail ? (
        <p className="mt-3">Email <a className="underline" href={`mailto:${releaseConfig.supportEmail}`}>{releaseConfig.supportEmail}</a> for help or privacy requests. Please do not include journal entries or passwords.</p>
      ) : <p className="mt-3">Support contact details are not yet available.</p>}
    </section>
  );
}
