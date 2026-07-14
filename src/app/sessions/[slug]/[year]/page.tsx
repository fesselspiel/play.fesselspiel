import { redirect } from "next/navigation";

export default async function TrackerYearRedirect(props: { params: Promise<{ slug: string; year: string }> }) {
  const params = await props.params;
  redirect(`/sessions?tracker=${encodeURIComponent(params.slug)}&year=${encodeURIComponent(params.year)}`);
}
