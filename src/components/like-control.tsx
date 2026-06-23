import { ThumbsUp } from "lucide-react";

export type LikePerson = {
  id?: string | null;
  name: string;
};

export function likeSummary(likes: LikePerson[]) {
  if (!likes.length) return "";
  const names = likes.map((like) => like.name || "Jemand");
  if (likes.length === 1) return `${names[0]} gefällt das.`;
  if (likes.length === 2) return `${names[0]} und ${names[1]} gefällt das.`;
  return `${names[0]}, ${names[1]} und ${likes.length - 2} weiteren gefällt das.`;
}

export function LikeControl({
  action,
  hiddenName,
  hiddenValue,
  liked,
  likes,
  label = "Gefällt mir"
}: {
  action: (formData: FormData) => void | Promise<void>;
  hiddenName: string;
  hiddenValue: string;
  liked: boolean;
  likes: LikePerson[];
  label?: string;
}) {
  return (
    <div className="space-y-1">
      {likes.length ? (
        <p className="text-[11px] font-medium text-graphite">👍 {likeSummary(likes)}</p>
      ) : null}
      <form action={action}>
        <input type="hidden" name={hiddenName} value={hiddenValue} />
        <button
          type="submit"
          className={`focus-ring inline-flex min-h-7 items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-semibold ${
            liked ? "text-redbrand hover:text-redbrandHover" : "text-graphite hover:text-redbrand"
          }`}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          {liked ? "Gefällt dir" : label}
        </button>
      </form>
    </div>
  );
}
