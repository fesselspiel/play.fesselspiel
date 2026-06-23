import { redirect } from "next/navigation";

export default function TrackerYearRedirect({ params }: { params: { slug: string; year: string } }) {
  redirect(`/sessions?tracker=${encodeURIComponent(params.slug)}&year=${encodeURIComponent(params.year)}`);
}
