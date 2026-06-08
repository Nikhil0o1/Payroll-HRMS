import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { initials } from "@/lib/utils";

/**
 * Person avatar that renders the uploaded profile photo when available and
 * gracefully falls back to initials otherwise. Radix swaps to the fallback
 * automatically if the image is missing or fails to load.
 */
export function UserAvatar({
  name,
  src,
  className,
  fallbackClassName,
}: {
  name: string;
  src?: string | null;
  className?: string;
  fallbackClassName?: string;
}) {
  return (
    <Avatar className={className}>
      {src ? <AvatarImage src={src} alt={name} className="object-cover" /> : null}
      <AvatarFallback className={fallbackClassName}>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
